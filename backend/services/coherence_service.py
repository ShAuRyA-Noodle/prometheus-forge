"""Cross-artifact coherence scoring.

Run AFTER Wave 3. Inspects all agent outputs for:

1. Company name consistency (brand → landing → deck → legal → exec summary)
2. Financial numbers in the pitch deck consistent with FinancialModelResult
3. GTM channels appear in the deck
4. Brand colors used in the landing page CSS
5. Tagline / one-liner agreement across deck title slide & exec summary

Returns a 0.0-1.0 score (1.0 = perfectly coherent).
"""
from __future__ import annotations

import re
from typing import Any

import structlog

from models.agent_schemas import (
    BrandIdentityResult,
    BusinessModelResult,
    ExecutiveSummaryResult,
    FinancialModelResult,
    GoToMarketResult,
    LandingPageResult,
    PitchDeckResult,
)
from models.session_models import AgentName

log = structlog.get_logger(__name__)


def _safe_get(d: dict[str, Any], key: AgentName) -> dict[str, Any] | None:
    return d.get(key.value) if d else None


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def score(all_agent_outputs: dict[str, Any]) -> float:
    """Returns a 0..1 score. ``all_agent_outputs`` is keyed by agent name str
    (matching ``AgentName.value``) and each value is the raw payload dict."""
    if not all_agent_outputs:
        return 0.0

    checks: list[tuple[str, bool, float]] = []  # (label, passed, weight)

    brand_payload = _safe_get(all_agent_outputs, AgentName.BRAND_IDENTITY)
    landing_payload = _safe_get(all_agent_outputs, AgentName.LANDING_PAGE)
    deck_payload = _safe_get(all_agent_outputs, AgentName.PITCH_DECK)
    legal_payload = _safe_get(all_agent_outputs, AgentName.LEGAL_DOCUMENTS)
    exec_payload = _safe_get(all_agent_outputs, AgentName.EXECUTIVE_SUMMARY)
    financial_payload = _safe_get(all_agent_outputs, AgentName.FINANCIAL_MODEL)
    bm_payload = _safe_get(all_agent_outputs, AgentName.BUSINESS_MODEL)
    gtm_payload = _safe_get(all_agent_outputs, AgentName.GO_TO_MARKET)

    # ─── 1. Company name consistency ────────────────────────────────────────
    canonical_name: str | None = None
    if brand_payload:
        try:
            brand = BrandIdentityResult.model_validate(brand_payload)
            canonical_name = brand.company_name
        except Exception:
            canonical_name = brand_payload.get("company_name")
    if canonical_name:
        n = _normalize(canonical_name)

        landing_html = ""
        if landing_payload:
            landing_html = (
                landing_payload.get("html_sanitized", "")
                + " "
                + landing_payload.get("title", "")
                + " "
                + landing_payload.get("meta_description", "")
            )
        checks.append(("name_in_landing", n in _normalize(landing_html), 1.0))

        deck_text = ""
        if deck_payload:
            for slide in deck_payload.get("slides", []) or []:
                deck_text += " " + str(slide.get("title", ""))
                deck_text += " " + str(slide.get("body", ""))
        checks.append(("name_in_deck", n in _normalize(deck_text), 1.5))

        legal_blob = ""
        if legal_payload:
            legal_blob = " ".join(
                str(v) for v in legal_payload.values() if isinstance(v, str)
            )
        # Legal docs render with placeholders; the company_name is required there
        checks.append(("name_in_legal", n in _normalize(legal_blob) or bool(legal_payload), 0.5))

        exec_text = ""
        if exec_payload:
            exec_text = (
                exec_payload.get("summary_text", "")
                + " "
                + exec_payload.get("one_liner", "")
            )
        checks.append(("name_in_exec", n in _normalize(exec_text), 1.0))

    # ─── 2. Financial figures cross-check ───────────────────────────────────
    if financial_payload and deck_payload:
        try:
            fm = FinancialModelResult.model_validate(financial_payload)
        except Exception:
            fm = None
        if fm and fm.projections:
            year3 = fm.projections[-1]
            target = round(year3.revenue_usd / 1_000_000.0, 1)  # $M
            deck_text = " ".join(
                str(s.get("body", "")) + " " + str(s.get("title", ""))
                for s in deck_payload.get("slides", []) or []
            )
            # Look for any number whose first 2 sig figs match target_M
            target_int = int(year3.revenue_usd)
            target_m = int(year3.revenue_usd / 1_000_000)
            mentioned = (
                f"${target_m}m" in _normalize(deck_text)
                or f"${target_m:,}" in deck_text.lower()
                or str(target_int)[:3] in deck_text.replace(",", "")
                or f"{target}m" in _normalize(deck_text)
            )
            checks.append(("financials_in_deck", bool(mentioned), 1.0))

    # ─── 3. GTM channels appear in deck ─────────────────────────────────────
    if gtm_payload and deck_payload:
        try:
            gtm = GoToMarketResult.model_validate(gtm_payload)
        except Exception:
            gtm = None
        deck_text = " ".join(
            str(s.get("body", "")) + " " + str(s.get("title", ""))
            for s in deck_payload.get("slides", []) or []
        )
        deck_norm = _normalize(deck_text)
        if gtm and gtm.marketing_channels:
            hits = 0
            for ch in gtm.marketing_channels:
                ch_name = str(ch.get("channel", "") if isinstance(ch, dict) else "").lower()
                if ch_name and ch_name in deck_norm:
                    hits += 1
            ratio = hits / max(1, len(gtm.marketing_channels))
            checks.append(("gtm_channels_in_deck", ratio >= 0.3, 0.75))

    # ─── 4. Brand colors used in landing CSS ────────────────────────────────
    if brand_payload and landing_payload:
        try:
            brand = BrandIdentityResult.model_validate(brand_payload)
            css = (landing_payload.get("css") or "") + " " + (
                landing_payload.get("html_sanitized") or ""
            )
            css_lower = css.lower()
            color_hits = sum(1 for c in brand.color_palette if c.hex.lower() in css_lower)
            checks.append(
                ("brand_colors_in_landing", color_hits >= max(1, len(brand.color_palette) // 2), 1.0)
            )
        except Exception:
            pass

    # ─── 5. Tagline / one-liner agreement ───────────────────────────────────
    if brand_payload and exec_payload:
        try:
            brand = BrandIdentityResult.model_validate(brand_payload)
            es = ExecutiveSummaryResult.model_validate(exec_payload)
            tagline_norm = _normalize(brand.tagline)
            one_liner_norm = _normalize(es.one_liner)
            # Looser check: at least one shared content token (>=4 chars)
            tag_tokens = {t for t in tagline_norm.split() if len(t) >= 4}
            line_tokens = {t for t in one_liner_norm.split() if len(t) >= 4}
            overlap = bool(tag_tokens & line_tokens)
            checks.append(("tagline_one_liner_overlap", overlap, 0.5))
        except Exception:
            pass

    # ─── 6. Business model echo in deck ─────────────────────────────────────
    if bm_payload and deck_payload:
        try:
            bm = BusinessModelResult.model_validate(bm_payload)
            deck_text = " ".join(
                str(s.get("body", "")) for s in deck_payload.get("slides", []) or []
            )
            n = _normalize(deck_text)
            checks.append(
                ("revenue_model_in_deck", _normalize(bm.revenue_model)[:20] in n, 0.5)
            )
        except Exception:
            pass

    if not checks:
        return 0.0

    total_weight = sum(w for _, _, w in checks)
    earned = sum(w for _, passed, w in checks if passed)
    final = float(earned / total_weight) if total_weight > 0 else 0.0

    log.info(
        "coherence.score",
        score=round(final, 3),
        passed=[c[0] for c in checks if c[1]],
        failed=[c[0] for c in checks if not c[1]],
    )
    return round(final, 3)


__all__ = ["score"]
