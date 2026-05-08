"""Weekly market diff for watched companies (retention loop).

Triggered by Cloud Scheduler. For each company:
  1. Read the last_week snapshot (Firestore)
  2. Re-run the Market Research + Competitive Analysis agents
  3. Diff the two snapshots
  4. If a *material* change is found, send a digest email and update the
     snapshot in Firestore.

A change is "material" when:
  * a competitor enters / exits the top-5
  * the TAM/SAM headline number moves more than 10%
  * a new industry trend appears in the top-5
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import structlog

from models.agent_schemas import (
    CompetitiveAnalysisResult,
    DataPoint,
    MarketResearchResult,
)
from services import firestore_service, notification_service

log = structlog.get_logger(__name__)


# ─── Diff helpers ───────────────────────────────────────────────────────────


def _data_point_value(dp: DataPoint | dict[str, Any]) -> float | None:
    val = dp.value if isinstance(dp, DataPoint) else dp.get("value")
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        try:
            return float(val.replace(",", "").replace("$", ""))
        except ValueError:
            return None
    return None


def _pct_change(old: float, new: float) -> float:
    if old == 0:
        return 0.0
    return abs((new - old) / old)


def _diff_market(
    old: MarketResearchResult, new: MarketResearchResult
) -> list[dict[str, Any]]:
    diffs: list[dict[str, Any]] = []
    for label in ("tam", "sam", "som"):
        old_v = _data_point_value(getattr(old, label))
        new_v = _data_point_value(getattr(new, label))
        if old_v and new_v and _pct_change(old_v, new_v) > 0.10:
            diffs.append(
                {
                    "title": f"{label.upper()} moved",
                    "summary": f"{label.upper()} changed from {old_v:,.0f} → {new_v:,.0f}",
                }
            )

    old_trends = set(old.industry_trends or [])
    new_trends = set(new.industry_trends or [])
    added = new_trends - old_trends
    removed = old_trends - new_trends
    if added:
        diffs.append(
            {"title": "New industry trends", "summary": "; ".join(sorted(added))}
        )
    if removed:
        diffs.append(
            {"title": "Trends fading", "summary": "; ".join(sorted(removed))}
        )
    return diffs


def _diff_competitors(
    old: CompetitiveAnalysisResult, new: CompetitiveAnalysisResult
) -> list[dict[str, Any]]:
    diffs: list[dict[str, Any]] = []
    old_set = {c.name.lower() for c in old.competitors[:5]}
    new_set = {c.name.lower() for c in new.competitors[:5]}
    entered = new_set - old_set
    exited = old_set - new_set
    if entered:
        diffs.append(
            {"title": "New competitors in top-5", "summary": ", ".join(sorted(entered))}
        )
    if exited:
        diffs.append(
            {"title": "Competitors dropped from top-5", "summary": ", ".join(sorted(exited))}
        )
    return diffs


# ─── Public API ─────────────────────────────────────────────────────────────


async def weekly_market_diff(company_id: str) -> dict[str, Any]:
    """Re-runs Market + Competitive agents for a single company. Returns
    a summary of diffs found and whether an email was sent."""
    db = firestore_service._get_db()  # type: ignore[attr-defined]

    def _read_company() -> dict[str, Any] | None:
        snap = await_db.collection("companies").document(company_id).get()  # type: ignore[name-defined]  # noqa
        return snap.to_dict() if snap.exists else None

    def _read_company_sync() -> dict[str, Any] | None:
        snap = db.collection("companies").document(company_id).get()
        return snap.to_dict() if snap.exists else None

    company = await asyncio.to_thread(_read_company_sync)
    if not company:
        log.warning("retention.unknown_company", id=company_id)
        return {"company_id": company_id, "ran": False, "reason": "not_found"}

    parsed_idea = company.get("parsed_idea") or {}
    if not parsed_idea:
        return {"company_id": company_id, "ran": False, "reason": "no_parsed_idea"}

    # Lazy import to avoid circular dependency on agent modules at startup
    try:
        from agents.market_research_agent import MarketResearchAgent  # type: ignore[import-not-found]
        from agents.competitive_analysis_agent import CompetitiveAnalysisAgent  # type: ignore[import-not-found]
    except Exception as e:  # noqa: BLE001
        log.error("retention.agents_unavailable", err=str(e))
        return {"company_id": company_id, "ran": False, "reason": "agents_unavailable"}

    state: dict[str, Any] = {"parsed_idea": parsed_idea}

    market_agent = MarketResearchAgent()
    competitive_agent = CompetitiveAnalysisAgent()

    market_run, comp_run = await asyncio.gather(
        market_agent.run(state),
        competitive_agent.run(state),
        return_exceptions=False,
    )

    if not (market_run.output and comp_run.output):
        log.warning("retention.partial_run", company_id=company_id)
        return {"company_id": company_id, "ran": False, "reason": "partial_run"}

    new_market: MarketResearchResult = market_run.output  # type: ignore[assignment]
    new_comp: CompetitiveAnalysisResult = comp_run.output  # type: ignore[assignment]

    last_market_raw = company.get("last_week_market")
    last_comp_raw = company.get("last_week_competitive")
    diffs: list[dict[str, Any]] = []

    try:
        if last_market_raw:
            old_market = MarketResearchResult.model_validate(last_market_raw)
            diffs += _diff_market(old_market, new_market)
        if last_comp_raw:
            old_comp = CompetitiveAnalysisResult.model_validate(last_comp_raw)
            diffs += _diff_competitors(old_comp, new_comp)
    except Exception as e:  # noqa: BLE001
        log.warning("retention.diff_err", err=str(e))

    # Persist new snapshot
    def _persist() -> None:
        db.collection("companies").document(company_id).set(
            {
                "last_week_market": json.loads(new_market.model_dump_json()),
                "last_week_competitive": json.loads(new_comp.model_dump_json()),
                "last_diff_at": datetime.now(timezone.utc),
            },
            merge=True,
        )

    await asyncio.to_thread(_persist)

    # Send digest if material changes & user configured
    sent_email = False
    if diffs:
        owner_uid = company.get("owner_uid")
        user = await firestore_service.get_user(owner_uid) if owner_uid else None
        if user and user.email and (user.consent or {}).get("retention", True):
            sent_email = await notification_service.send_market_digest(
                user, {"name": company.get("name") or "your company"}, diffs
            )

    log.info(
        "retention.weekly_diff",
        company_id=company_id,
        diffs=len(diffs),
        email_sent=sent_email,
    )
    return {
        "company_id": company_id,
        "ran": True,
        "diffs": diffs,
        "email_sent": sent_email,
    }


__all__ = ["weekly_market_diff"]
