"""Executive Summary Agent — Wave 3, Pro.

Pre-summarization same pattern as Pitch Deck. Returns ExecutiveSummaryResult with
coherence_score populated by services.coherence_service.score(all_outputs).
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, ClassVar

from pydantic import HttpUrl

from config import settings
from models.agent_schemas import ArticulationOutput, ExecutiveSummaryResult
from models.session_models import AgentName, Wave

from ._summarize import summarize_all
from .base import PrometheusAgent

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "executive_summary.txt"

_EXEC_SUMMARY_KEYS = [
    "brand_identity_result",
    "market_research_result",
    "competitive_analysis_result",
    "business_model_result",
    "financial_model_result",
    "go_to_market_result",
    "risk_analysis_result",
    "tech_architecture_result",
]


class ExecutiveSummaryAgent(PrometheusAgent[ExecutiveSummaryResult]):
    name: ClassVar[AgentName] = AgentName.EXECUTIVE_SUMMARY
    wave: ClassVar[Wave] = Wave.WAVE_3
    model: ClassVar[str] = settings.model_pro
    output_schema: ClassVar[type] = ExecutiveSummaryResult
    prompt_template: ClassVar[str] = _PROMPT_PATH.read_text(encoding="utf-8")
    requires_grounding: ClassVar[bool] = False
    timeout_seconds: ClassVar[int] = 60
    temperature: ClassVar[float] = 0.4

    @property
    def output_key(self) -> str:
        return "executive_summary_result"

    async def before_model(self, state: dict[str, Any]) -> dict[str, Any]:
        if state.get("_exec_summaries_ready"):
            return state

        summaries = await summarize_all(state, _EXEC_SUMMARY_KEYS)
        new_state = dict(state)
        new_state.update(summaries)
        new_state["_exec_summaries_ready"] = True

        if "polished_idea" not in new_state:
            articulation = new_state.get("articulation")
            if isinstance(articulation, ArticulationOutput):
                new_state["polished_idea"] = articulation.polished_idea
            elif isinstance(articulation, dict):
                new_state["polished_idea"] = articulation.get("polished_idea", "")
            else:
                new_state["polished_idea"] = new_state.get("idea_text", "")
        return new_state

    def render_prompt(self, state: dict[str, Any]) -> str:
        return self.prompt_template.format(
            polished_idea=state.get("polished_idea", state.get("idea_text", "")),
            brand_summary=state.get("brand_summary", ""),
            market_summary=state.get("market_summary", ""),
            competitive_summary=state.get("competitive_summary", ""),
            business_model_summary=state.get("business_model_summary", ""),
            financial_summary=state.get("financial_summary", ""),
            gtm_summary=state.get("gtm_summary", ""),
            risk_summary=state.get("risk_summary", ""),
            tech_summary=state.get("tech_summary", ""),
        )

    async def after_model(
        self,
        output: ExecutiveSummaryResult,
        state: dict[str, Any],
    ) -> ExecutiveSummaryResult:
        from services.coherence_service import score as coherence_score  # noqa: WPS433

        # Build the full output bundle for coherence scoring.
        all_outputs = {
            key: state.get(key) for key in _EXEC_SUMMARY_KEYS if state.get(key) is not None
        }
        all_outputs["executive_summary_result"] = output

        try:
            score_value = await asyncio.wait_for(
                coherence_score(all_outputs),
                timeout=15,
            )
        except (TimeoutError, Exception) as exc:  # noqa: BLE001
            self.logger.warning("exec_summary.coherence_failed", error=str(exc))
            score_value = output.coherence_score

        # Clamp into the valid Pydantic range.
        try:
            score_value = float(score_value)
        except (TypeError, ValueError):
            score_value = 0.5
        score_value = max(0.0, min(1.0, score_value))

        updates: dict[str, Any] = {"coherence_score": score_value}

        # Optional: publish to Google Docs via workspace service.
        brand = state.get("brand_identity_result")
        company_name: str | None
        if hasattr(brand, "company_name"):
            company_name = brand.company_name  # type: ignore[union-attr]
        elif isinstance(brand, dict):
            company_name = brand.get("company_name")
        else:
            company_name = None

        try:
            from services.google_workspace import create_executive_summary_doc  # noqa: WPS433

            doc_payload = await asyncio.wait_for(
                create_executive_summary_doc(
                    summary_text=output.summary_text,
                    one_liner=output.one_liner,
                    company_name=company_name,
                    user_uid=state.get("user_uid"),
                ),
                timeout=30,
            )
        except (TimeoutError, Exception) as exc:  # noqa: BLE001
            self.logger.warning("exec_summary.doc_failed", error=str(exc))
            doc_payload = None

        if isinstance(doc_payload, dict):
            if doc_id := doc_payload.get("doc_id"):
                updates["doc_id"] = doc_id
            if doc_url := doc_payload.get("doc_url"):
                try:
                    updates["doc_url"] = HttpUrl(doc_url)
                except (TypeError, ValueError):
                    pass

        return output.model_copy(update=updates)


executive_summary_agent = ExecutiveSummaryAgent()
