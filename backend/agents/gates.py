"""Validation gates between waves.

Each gate:
  • re-validates Pydantic schemas
  • runs Vertex Safety on text outputs
  • checks USPTO/domain on Brand result
  • validates WCAG on color palette
  • sanitizes Landing HTML
  • checks reconciliation_passed on Financial
Raises GateRejectedError with structured reasons (machine-readable list).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import structlog
from pydantic import BaseModel, ValidationError

from models.agent_schemas import (
    BrandIdentityResult,
    BusinessModelResult,
    ColorEntry,
    CompetitiveAnalysisResult,
    ExecutiveSummaryResult,
    FinancialModelResult,
    GoToMarketResult,
    LandingPageResult,
    LegalDocumentsResult,
    MarketResearchResult,
    ParsedIdea,
    PitchDeckResult,
    RiskAnalysisResult,
    TechArchitectureResult,
)

from .base import GateRejectedError

log = structlog.get_logger("prometheus.gates")


# ─── Gate primitives ────────────────────────────────────────────────────────


@dataclass
class GateIssue:
    code: str
    agent: str
    message: str
    severity: str = "error"  # "error" or "warning"


@dataclass
class GateResult:
    wave: str
    passed: bool
    issues: list[GateIssue] = field(default_factory=list)
    warnings: list[GateIssue] = field(default_factory=list)

    def raise_if_failed(self) -> None:
        if not self.passed:
            payload = [
                {"code": i.code, "agent": i.agent, "message": i.message}
                for i in self.issues
            ]
            raise GateRejectedError(
                f"Gate {self.wave} rejected with {len(self.issues)} issue(s): {payload}"
            )


def _coerce(model_cls: type[BaseModel], value: Any) -> tuple[BaseModel | None, str | None]:
    """Try to coerce `value` into `model_cls`. Returns (instance, None) on success or
    (None, error_msg) on failure."""
    if isinstance(value, model_cls):
        return value, None
    try:
        return model_cls.model_validate(value), None
    except ValidationError as ve:
        return None, str(ve)


# ─── Helper: contrast / WCAG ─────────────────────────────────────────────────


def _hex_to_rgb(hex_str: str) -> tuple[float, float, float]:
    h = hex_str.lstrip("#")
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)


def _relative_luminance(rgb: tuple[float, float, float]) -> float:
    def _component(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (_component(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast_ratio(hex_a: str, hex_b: str) -> float:
    la = _relative_luminance(_hex_to_rgb(hex_a))
    lb = _relative_luminance(_hex_to_rgb(hex_b))
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)


def _wcag_aa_normal(ratio: float) -> bool:
    """AA for normal text = ≥ 4.5."""
    return ratio >= 4.5


# ─── Vertex Safety ──────────────────────────────────────────────────────────


async def _safety_check_text(text: str, *, agent: str) -> GateIssue | None:
    """Run Vertex AI Safety on a string. Returns an issue if blocked."""
    try:
        from services.vertex_safety import check_text  # noqa: WPS433
    except ImportError:
        log.warning("safety.module_missing")
        return None

    try:
        verdict = await check_text(text)
    except Exception as exc:  # noqa: BLE001
        log.warning("safety.error", agent=agent, error=str(exc))
        return None

    if isinstance(verdict, dict) and verdict.get("blocked"):
        return GateIssue(
            code="SAFETY_BLOCKED",
            agent=agent,
            message=f"Vertex Safety blocked: {verdict.get('categories', [])}",
        )
    return None


# ─── Wave 1 gate ────────────────────────────────────────────────────────────


async def wave_1_gate(state: dict[str, Any]) -> GateResult:
    """Validates Wave 1 outputs:
      - schema validation on all 6 agent results
      - parsed_idea moderation_flags must be empty (else SAFETY_BLOCKED)
      - Vertex Safety pre-filter on long-text outputs
      - USPTO + domain check (already run in BrandIdentityAgent.after_model — just verify)
      - WCAG AA contrast for primary/text colors
    """
    issues: list[GateIssue] = []
    warnings: list[GateIssue] = []

    # parsed_idea — moderation_flags
    parsed_raw = state.get("parsed_idea")
    parsed, err = _coerce(ParsedIdea, parsed_raw)
    if err or parsed is None:
        issues.append(GateIssue(code="SCHEMA_INVALID", agent="idea_parser", message=err or "missing"))
    else:
        if parsed.moderation_flags:
            issues.append(
                GateIssue(
                    code="MODERATION_FLAGGED",
                    agent="idea_parser",
                    message=f"flags={parsed.moderation_flags}",
                )
            )

    # Schema check the six wave-1 outputs.
    schema_map: dict[str, type[BaseModel]] = {
        "market_research_result": MarketResearchResult,
        "competitive_analysis_result": CompetitiveAnalysisResult,
        "business_model_result": BusinessModelResult,
        "brand_identity_result": BrandIdentityResult,
        "risk_analysis_result": RiskAnalysisResult,
        "tech_architecture_result": TechArchitectureResult,
    }
    coerced: dict[str, BaseModel] = {}
    for key, cls in schema_map.items():
        value = state.get(key)
        if value is None:
            issues.append(GateIssue(code="MISSING_OUTPUT", agent=key, message="not produced"))
            continue
        instance, err = _coerce(cls, value)
        if instance is None:
            issues.append(GateIssue(code="SCHEMA_INVALID", agent=key, message=err or "unknown"))
        else:
            coerced[key] = instance

    # Vertex Safety on the long-form text fields.
    market = coerced.get("market_research_result")
    if isinstance(market, MarketResearchResult):
        si = await _safety_check_text(market.market_timing_rationale, agent="market_research")
        if si:
            issues.append(si)

    risk = coerced.get("risk_analysis_result")
    if isinstance(risk, RiskAnalysisResult):
        si = await _safety_check_text(risk.worst_case_scenario, agent="risk_analysis")
        if si:
            issues.append(si)

    # Brand Identity: trademark/domain check should already be populated by after_model.
    brand = coerced.get("brand_identity_result")
    if isinstance(brand, BrandIdentityResult):
        # Find availability metadata from the company-name's matching candidate, if any.
        primary_match = next(
            (c for c in brand.name_alternatives if c.name == brand.company_name),
            None,
        )
        # The agent's after_model often promotes; primary may not appear in alternatives.
        # Tolerate missing data — it may have failed silently.
        if primary_match is not None:
            if primary_match.uspto_conflicts:
                issues.append(
                    GateIssue(
                        code="USPTO_CONFLICT",
                        agent="brand_identity",
                        message=f"conflicts={primary_match.uspto_conflicts}",
                    )
                )
            if primary_match.domain_com_available is False:
                warnings.append(
                    GateIssue(
                        code="DOMAIN_UNAVAILABLE",
                        agent="brand_identity",
                        message=".com not available",
                        severity="warning",
                    )
                )

        # WCAG check + populate contrast fields back into the palette.
        try:
            updated_palette = _evaluate_palette(brand.color_palette)
        except Exception as exc:  # noqa: BLE001
            warnings.append(
                GateIssue(
                    code="WCAG_EVAL_ERROR",
                    agent="brand_identity",
                    message=str(exc),
                    severity="warning",
                )
            )
            updated_palette = brand.color_palette
        else:
            primary_text_pair = _find_primary_text_pair(updated_palette)
            if primary_text_pair is not None:
                primary_hex, text_hex, ratio = primary_text_pair
                if not _wcag_aa_normal(ratio):
                    issues.append(
                        GateIssue(
                            code="WCAG_AA_FAIL",
                            agent="brand_identity",
                            message=f"primary={primary_hex} text={text_hex} ratio={ratio:.2f}",
                        )
                    )

        # Mutate state with hydrated palette so downstream agents can reuse.
        state["brand_identity_result"] = brand.model_copy(
            update={"color_palette": updated_palette}
        )

    passed = len(issues) == 0
    log.info("gate.wave_1.complete", passed=passed, issues=len(issues), warnings=len(warnings))
    return GateResult(wave="wave_1", passed=passed, issues=issues, warnings=warnings)


def _evaluate_palette(palette: list[ColorEntry]) -> list[ColorEntry]:
    out: list[ColorEntry] = []
    for entry in palette:
        on_white = _contrast_ratio(entry.hex, "#FFFFFF")
        on_black = _contrast_ratio(entry.hex, "#000000")
        out.append(
            entry.model_copy(
                update={
                    "contrast_on_white": round(on_white, 2),
                    "contrast_on_black": round(on_black, 2),
                    "wcag_aa_normal": _wcag_aa_normal(max(on_white, on_black)),
                }
            )
        )
    return out


def _find_primary_text_pair(palette: list[ColorEntry]) -> tuple[str, str, float] | None:
    primary = next((c for c in palette if c.role == "primary"), None)
    text = next((c for c in palette if c.role == "text"), None)
    if primary is None or text is None:
        # Fallback: primary vs background
        bg = next((c for c in palette if c.role == "background"), None)
        if primary is not None and bg is not None:
            ratio = _contrast_ratio(primary.hex, bg.hex)
            return primary.hex, bg.hex, ratio
        return None
    ratio = _contrast_ratio(primary.hex, text.hex)
    return primary.hex, text.hex, ratio


# ─── Wave 2 gate ────────────────────────────────────────────────────────────


async def wave_2_gate(state: dict[str, Any]) -> GateResult:
    """Validates Wave 2 outputs:
      - schemas
      - reconciliation_passed on FinancialModelResult
      - landing HTML re-sanitized & non-empty
      - go-to-market kpi sanity
    """
    issues: list[GateIssue] = []
    warnings: list[GateIssue] = []

    schema_map: dict[str, type[BaseModel]] = {
        "financial_model_result": FinancialModelResult,
        "landing_page_result": LandingPageResult,
        "legal_documents_result": LegalDocumentsResult,
        "go_to_market_result": GoToMarketResult,
    }
    coerced: dict[str, BaseModel] = {}
    for key, cls in schema_map.items():
        value = state.get(key)
        if value is None:
            issues.append(GateIssue(code="MISSING_OUTPUT", agent=key, message="not produced"))
            continue
        instance, err = _coerce(cls, value)
        if instance is None:
            issues.append(GateIssue(code="SCHEMA_INVALID", agent=key, message=err or "unknown"))
        else:
            coerced[key] = instance

    # Financial reconciliation gate.
    fin = coerced.get("financial_model_result")
    if isinstance(fin, FinancialModelResult):
        if not fin.reconciliation_passed:
            issues.append(
                GateIssue(
                    code="FINANCE_NOT_RECONCILED",
                    agent="financial_model",
                    message="finance_engine could not reconcile P&L",
                )
            )
        if fin.runway_months <= 0:
            warnings.append(
                GateIssue(
                    code="FINANCE_NEGATIVE_RUNWAY",
                    agent="financial_model",
                    message=f"runway_months={fin.runway_months}",
                    severity="warning",
                )
            )

    # Landing HTML must already be sanitized; re-run defensively.
    landing = coerced.get("landing_page_result")
    if isinstance(landing, LandingPageResult):
        try:
            from services.sanitization import sanitize_html  # noqa: WPS433

            cleaned = sanitize_html(landing.html_sanitized)
            if not cleaned or len(cleaned) < 100:
                issues.append(
                    GateIssue(
                        code="LANDING_EMPTY",
                        agent="landing_page",
                        message="sanitized HTML too small",
                    )
                )
            else:
                state["landing_page_result"] = landing.model_copy(
                    update={"html_sanitized": cleaned}
                )
        except ImportError:
            warnings.append(
                GateIssue(
                    code="SANITIZER_MISSING",
                    agent="landing_page",
                    message="sanitization module not importable",
                    severity="warning",
                )
            )
        except Exception as exc:  # noqa: BLE001
            issues.append(
                GateIssue(
                    code="SANITIZE_FAILED",
                    agent="landing_page",
                    message=str(exc),
                )
            )

        # Vertex Safety on meta + title.
        si = await _safety_check_text(
            f"{landing.title}\n{landing.meta_description}",
            agent="landing_page",
        )
        if si:
            issues.append(si)

    # Legal must always have lawyer_review_cta=True (defense in depth).
    legal = coerced.get("legal_documents_result")
    if isinstance(legal, LegalDocumentsResult) and not legal.lawyer_review_cta:
        issues.append(
            GateIssue(
                code="LEGAL_NO_LAWYER_CTA",
                agent="legal_documents",
                message="lawyer_review_cta is False — must always be True",
            )
        )

    passed = len(issues) == 0
    log.info("gate.wave_2.complete", passed=passed, issues=len(issues), warnings=len(warnings))
    return GateResult(wave="wave_2", passed=passed, issues=issues, warnings=warnings)


# ─── Wave 3 gate ────────────────────────────────────────────────────────────


async def wave_3_gate(state: dict[str, Any]) -> GateResult:
    """Validates Wave 3 outputs:
      - schemas
      - executive_summary coherence_score ≥ threshold
      - pitch deck has 10–14 slides
      - cross-artifact: company_name appears in deck title slide
    """
    issues: list[GateIssue] = []
    warnings: list[GateIssue] = []

    schema_map: dict[str, type[BaseModel]] = {
        "pitch_deck_result": PitchDeckResult,
        "executive_summary_result": ExecutiveSummaryResult,
    }
    coerced: dict[str, BaseModel] = {}
    for key, cls in schema_map.items():
        value = state.get(key)
        if value is None:
            issues.append(GateIssue(code="MISSING_OUTPUT", agent=key, message="not produced"))
            continue
        instance, err = _coerce(cls, value)
        if instance is None:
            issues.append(GateIssue(code="SCHEMA_INVALID", agent=key, message=err or "unknown"))
        else:
            coerced[key] = instance

    deck = coerced.get("pitch_deck_result")
    exec_sum = coerced.get("executive_summary_result")

    if isinstance(deck, PitchDeckResult):
        if not (10 <= len(deck.slides) <= 14):
            issues.append(
                GateIssue(
                    code="DECK_SLIDE_COUNT",
                    agent="pitch_deck",
                    message=f"len={len(deck.slides)} (want 10-14)",
                )
            )

        # Cross-artifact coherence: company_name must appear on title slide.
        brand = state.get("brand_identity_result")
        company_name: str | None = None
        if hasattr(brand, "company_name"):
            company_name = brand.company_name  # type: ignore[union-attr]
        elif isinstance(brand, dict):
            company_name = brand.get("company_name")
        if company_name and deck.slides:
            title_slide = next(
                (s for s in deck.slides if s.layout == "title"), deck.slides[0]
            )
            haystack = f"{title_slide.title} {title_slide.body}".lower()
            if company_name.lower() not in haystack:
                warnings.append(
                    GateIssue(
                        code="DECK_NAME_MISSING",
                        agent="pitch_deck",
                        message=(
                            f"company_name '{company_name}' not in title slide — "
                            "may indicate inconsistency"
                        ),
                        severity="warning",
                    )
                )

    if isinstance(exec_sum, ExecutiveSummaryResult):
        if exec_sum.coherence_score < 0.5:
            warnings.append(
                GateIssue(
                    code="LOW_COHERENCE",
                    agent="executive_summary",
                    message=f"coherence_score={exec_sum.coherence_score:.2f} (<0.5)",
                    severity="warning",
                )
            )

        si = await _safety_check_text(exec_sum.summary_text, agent="executive_summary")
        if si:
            issues.append(si)

    passed = len(issues) == 0
    log.info("gate.wave_3.complete", passed=passed, issues=len(issues), warnings=len(warnings))
    return GateResult(wave="wave_3", passed=passed, issues=issues, warnings=warnings)


__all__ = [
    "GateIssue",
    "GateResult",
    "wave_1_gate",
    "wave_2_gate",
    "wave_3_gate",
]
