"""Pitch Deck Agent — Wave 3, Pro.

Pre-summarization step: before final synthesis, runs 6 parallel Flash calls to
compress upstream outputs to ~300 tokens each. Then assembles PitchDeckResult.
`after_model` calls services.google_workspace.create_presentation_from_template
to render via template-copy + Imagen heroes (NOT raw batchUpdate).
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, ClassVar

from pydantic import HttpUrl

from config import settings
from models.agent_schemas import (
    ArticulationOutput,
    BrandIdentityResult,
    PitchDeckResult,
)
from models.session_models import AgentName, Wave

from ._summarize import summarize_all
from .base import PrometheusAgent

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "pitch_deck.txt"

_DECK_SUMMARY_KEYS = [
    "brand_identity_result",
    "market_research_result",
    "competitive_analysis_result",
    "business_model_result",
    "financial_model_result",
    "go_to_market_result",
]


class PitchDeckAgent(PrometheusAgent[PitchDeckResult]):
    name: ClassVar[AgentName] = AgentName.PITCH_DECK
    wave: ClassVar[Wave] = Wave.WAVE_3
    model: ClassVar[str] = settings.model_pro
    output_schema: ClassVar[type] = PitchDeckResult
    prompt_template: ClassVar[str] = _PROMPT_PATH.read_text(encoding="utf-8")
    requires_grounding: ClassVar[bool] = False
    timeout_seconds: ClassVar[int] = 75
    temperature: ClassVar[float] = 0.5

    @property
    def output_key(self) -> str:
        return "pitch_deck_result"

    async def before_model(self, state: dict[str, Any]) -> dict[str, Any]:
        """Run 6 parallel Flash summarize calls. Inject `*_summary` keys into state."""
        # Avoid re-running summarization on retry.
        if state.get("_deck_summaries_ready"):
            return state

        summaries = await summarize_all(state, _DECK_SUMMARY_KEYS)
        new_state = dict(state)
        new_state.update(summaries)
        new_state["_deck_summaries_ready"] = True
        # Ensure polished_idea is present.
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
        # All summaries pre-populated by before_model. Provide safe defaults.
        return self.prompt_template.format(
            brand_summary=state.get("brand_summary", ""),
            market_summary=state.get("market_summary", ""),
            competitive_summary=state.get("competitive_summary", ""),
            business_model_summary=state.get("business_model_summary", ""),
            financial_summary=state.get("financial_summary", ""),
            gtm_summary=state.get("gtm_summary", ""),
            polished_idea=state.get("polished_idea", state.get("idea_text", "")),
        )

    async def after_model(
        self,
        output: PitchDeckResult,
        state: dict[str, Any],
    ) -> PitchDeckResult:
        from services.google_workspace import (  # noqa: WPS433
            create_presentation_from_template,
        )

        brand = state.get("brand_identity_result")
        brand_payload: dict[str, Any] = {}
        if isinstance(brand, BrandIdentityResult):
            brand_payload = brand.model_dump(mode="json")
        elif isinstance(brand, dict):
            brand_payload = brand

        slides_payload = [s.model_dump(mode="json") for s in output.slides]

        try:
            workspace_result = await asyncio.wait_for(
                create_presentation_from_template(
                    brand=brand_payload,
                    slides=slides_payload,
                    user_uid=state.get("user_uid"),
                    company_name=brand_payload.get("company_name"),
                ),
                timeout=60,
            )
        except (TimeoutError, Exception) as exc:  # noqa: BLE001
            self.logger.warning("pitch_deck.workspace_failed", error=str(exc))
            return output

        updates: dict[str, Any] = {}
        if isinstance(workspace_result, dict):
            if pid := workspace_result.get("presentation_id"):
                updates["presentation_id"] = pid
            if purl := workspace_result.get("presentation_url"):
                try:
                    updates["presentation_url"] = HttpUrl(purl)
                except (TypeError, ValueError):
                    pass
            if pdf := workspace_result.get("pdf_url"):
                try:
                    updates["pdf_url"] = HttpUrl(pdf)
                except (TypeError, ValueError):
                    pass
            # Per-slide image URLs from Imagen.
            slide_image_map = workspace_result.get("slide_image_urls") or {}
            if slide_image_map:
                new_slides = []
                for slide in output.slides:
                    url = slide_image_map.get(str(slide.slide_number)) or slide_image_map.get(
                        slide.slide_number
                    )
                    if url:
                        try:
                            new_slides.append(
                                slide.model_copy(update={"image_url": HttpUrl(url)})
                            )
                            continue
                        except (TypeError, ValueError):
                            pass
                    new_slides.append(slide)
                updates["slides"] = new_slides

        return output.model_copy(update=updates) if updates else output


pitch_deck_agent = PitchDeckAgent()
