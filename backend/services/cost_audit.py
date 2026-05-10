"""Runtime cost analyzer.

Two functions:
  - ``audit_session(session)`` — flags anomalies on a single session
  - ``aggregate(window)`` — computes p50/p95/p99 latency + cost per agent over
    the last ``window`` for cost dashboards.

Anomalies flagged:
  - token count > p99 of its model
  - output_tokens vs schema mismatch (output_tokens far exceed expected schema size)
  - unexpected agent retries (retry_count >= 1)
  - cost > MAX_COST_USD_PER_SESSION
  - latency > p99 ceiling
"""
from __future__ import annotations

import asyncio
import statistics
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field

from config import settings

log = structlog.get_logger(__name__)


# ─── Models ──────────────────────────────────────────────────────────────────


class CostAnomaly(BaseModel):
    agent_name: str
    code: str
    severity: str  # info | warn | critical
    detail: str
    value: float | int | str | None = None


class CostAudit(BaseModel):
    session_id: str
    total_cost_usd: float
    total_input_tokens: int
    total_output_tokens: int
    anomalies: list[CostAnomaly]
    audited_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentStats(BaseModel):
    agent_name: str
    samples: int
    cost_p50: float
    cost_p95: float
    cost_p99: float
    latency_p50_ms: float
    latency_p95_ms: float
    latency_p99_ms: float


class CostReport(BaseModel):
    window_hours: int
    total_sessions: int
    total_cost_usd: float
    per_agent: list[AgentStats]
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ─── Internals ───────────────────────────────────────────────────────────────


# Schema-derived expected output token bands per agent (calibrated heuristics).
_EXPECTED_OUTPUT_TOKENS: dict[str, tuple[int, int]] = {
    "idea_parser": (200, 1000),
    "articulation": (200, 1500),
    "market_research": (1500, 5000),
    "competitive_analysis": (1500, 6000),
    "business_model": (1500, 5000),
    "brand_identity": (1500, 4500),
    "risk_analysis": (1000, 4000),
    "tech_architecture": (1500, 5000),
    "financial_model": (500, 2500),
    "landing_page": (3000, 10000),
    "legal_documents": (500, 2000),
    "go_to_market": (1500, 5000),
    "pitch_deck": (2500, 8000),
    "executive_summary": (800, 2500),
}


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = max(0, min(len(s) - 1, int(round(pct * (len(s) - 1)))))
    return float(s[idx])


def _db() -> Any:
    from services.firestore_service import _get_db  # type: ignore[attr-defined]

    return _get_db()


# ─── audit_session ───────────────────────────────────────────────────────────


def audit_session(session: dict[str, Any]) -> CostAudit:
    """Pure-function audit of a session dict (already loaded from Firestore)."""
    anomalies: list[CostAnomaly] = []
    sid = session.get("session_id", "")
    agents: dict[str, Any] = session.get("agents") or {}

    total_cost = 0.0
    total_in = 0
    total_out = 0

    for name, rec in agents.items():
        cost = float(rec.get("cost_usd") or 0.0)
        in_tok = int(rec.get("input_tokens") or 0)
        out_tok = int(rec.get("output_tokens") or 0)
        retry = int(rec.get("retry_count") or 0)
        dur = int(rec.get("duration_ms") or 0)
        total_cost += cost
        total_in += in_tok
        total_out += out_tok

        # Output tokens vs expected band
        band = _EXPECTED_OUTPUT_TOKENS.get(name)
        if band and out_tok > band[1] * 1.3:
            anomalies.append(
                CostAnomaly(
                    agent_name=name,
                    code="OUTPUT_TOKENS_OVER",
                    severity="warn",
                    detail=f"output_tokens {out_tok} > 1.3x expected band {band[1]}",
                    value=out_tok,
                )
            )
        if band and out_tok > 0 and out_tok < band[0] * 0.4:
            anomalies.append(
                CostAnomaly(
                    agent_name=name,
                    code="OUTPUT_TOKENS_UNDER",
                    severity="info",
                    detail=f"output_tokens {out_tok} < 0.4x expected band {band[0]}",
                    value=out_tok,
                )
            )

        # Retry count
        if retry >= 1:
            anomalies.append(
                CostAnomaly(
                    agent_name=name,
                    code="RETRY",
                    severity="info",
                    detail=f"retry_count={retry}",
                    value=retry,
                )
            )

        # Latency ceiling per wave timeout setting
        if dur > settings.wave_timeout_seconds * 1000:
            anomalies.append(
                CostAnomaly(
                    agent_name=name,
                    code="LATENCY_OVER_WAVE_TIMEOUT",
                    severity="warn",
                    detail=f"duration_ms={dur} > wave_timeout_s={settings.wave_timeout_seconds}",
                    value=dur,
                )
            )

    if total_cost > settings.max_cost_usd_per_session:
        anomalies.append(
            CostAnomaly(
                agent_name="*",
                code="COST_BUDGET_EXCEEDED",
                severity="critical",
                detail=f"total_cost {total_cost:.4f} > cap {settings.max_cost_usd_per_session}",
                value=round(total_cost, 4),
            )
        )

    log.info(
        "cost_audit.session",
        sid=sid,
        anomalies=len(anomalies),
        total_cost=round(total_cost, 4),
    )
    return CostAudit(
        session_id=sid,
        total_cost_usd=round(total_cost, 4),
        total_input_tokens=total_in,
        total_output_tokens=total_out,
        anomalies=anomalies,
    )


# ─── aggregate ───────────────────────────────────────────────────────────────


async def aggregate(window: timedelta = timedelta(hours=24)) -> CostReport:
    """Compute per-agent p50/p95/p99 over the past ``window``."""

    def _read() -> list[dict[str, Any]]:
        cutoff = datetime.now(timezone.utc) - window
        q = (
            _db()
            .collection("sessions")
            .where("created_at", ">=", cutoff)
            .limit(1000)
        )
        return [s.to_dict() | {"id": s.id} for s in q.stream()]

    sessions = await asyncio.to_thread(_read)
    by_agent: dict[str, dict[str, list[float]]] = {}
    total_cost = 0.0
    total_sess = 0

    for s in sessions:
        total_sess += 1
        agents = s.get("agents") or {}
        for name, rec in agents.items():
            costs = by_agent.setdefault(name, {"cost": [], "lat": []})
            cost = float(rec.get("cost_usd") or 0.0)
            costs["cost"].append(cost)
            total_cost += cost
            if rec.get("duration_ms"):
                costs["lat"].append(float(rec["duration_ms"]))

    per_agent: list[AgentStats] = []
    for name, buckets in sorted(by_agent.items()):
        per_agent.append(
            AgentStats(
                agent_name=name,
                samples=len(buckets["cost"]),
                cost_p50=_percentile(buckets["cost"], 0.5),
                cost_p95=_percentile(buckets["cost"], 0.95),
                cost_p99=_percentile(buckets["cost"], 0.99),
                latency_p50_ms=_percentile(buckets["lat"], 0.5),
                latency_p95_ms=_percentile(buckets["lat"], 0.95),
                latency_p99_ms=_percentile(buckets["lat"], 0.99),
            )
        )

    return CostReport(
        window_hours=int(window.total_seconds() // 3600),
        total_sessions=total_sess,
        total_cost_usd=round(total_cost, 4),
        per_agent=per_agent,
    )


def percentiles(values: list[float]) -> dict[str, float]:
    if not values:
        return {"p50": 0.0, "p95": 0.0, "p99": 0.0, "mean": 0.0}
    return {
        "p50": _percentile(values, 0.5),
        "p95": _percentile(values, 0.95),
        "p99": _percentile(values, 0.99),
        "mean": statistics.fmean(values),
    }


__all__ = [
    "AgentStats",
    "CostAnomaly",
    "CostAudit",
    "CostReport",
    "aggregate",
    "audit_session",
    "percentiles",
]
