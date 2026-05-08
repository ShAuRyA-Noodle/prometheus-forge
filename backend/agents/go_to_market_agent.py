"""Go-to-Market Agent — Wave 2, Flash. Returns GoToMarketResult."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, ClassVar

from pydantic import BaseModel

from config import settings
from models.agent_schemas import (
    ArticulationOutput,
    BrandIdentityResult,
    BusinessModelResult,
    CompetitiveAnalysisResult,
    GoToMarketResult,
    MarketResearchResult,
)
from models.session_models import AgentName, Wave

from .base import PrometheusAgent

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "go_to_market.txt"


def _stringify(value: Any) -> str:
    if isinstance(value, BaseModel):
        return value.model_dump_json(indent=2)
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, indent=2, default=str)
    except (TypeError, ValueError):
        return str(value)


class GoToMarketAgent(PrometheusAgent[GoToMarketResult]):
    name: ClassVar[AgentName] = AgentName.GO_TO_MARKET
    wave: ClassVar[Wave] = Wave.WAVE_2
    model: ClassVar[str] = settings.model_flash
    output_schema: ClassVar[type] = GoToMarketResult
    prompt_template: ClassVar[str] = _PROMPT_PATH.read_text(encoding="utf-8")
    requires_grounding: ClassVar[bool] = False
    timeout_seconds: ClassVar[int] = 30
    temperature: ClassVar[float] = 0.5

    @property
    def output_key(self) -> str:
        return "go_to_market_result"

    def render_prompt(self, state: dict[str, Any]) -> str:
        polished = state.get("polished_idea")
        if polished is None:
            articulation = state.get("articulation")
            if isinstance(articulation, ArticulationOutput):
                polished = articulation.polished_idea
            elif isinstance(articulation, dict):
                polished = articulation.get("polished_idea", "")
            else:
                polished = ""

        market = state.get("market_research_result")
        market_str = (
            market.model_dump_json(indent=2)
            if isinstance(market, MarketResearchResult)
            else _stringify(market or {})
        )

        comp = state.get("competitive_analysis_result")
        comp_str = (
            comp.model_dump_json(indent=2)
            if isinstance(comp, CompetitiveAnalysisResult)
            else _stringify(comp or {})
        )

        bm = state.get("business_model_result")
        bm_str = (
            bm.model_dump_json(indent=2)
            if isinstance(bm, BusinessModelResult)
            else _stringify(bm or {})
        )

        brand = state.get("brand_identity_result")
        brand_str = (
            brand.model_dump_json(indent=2)
            if isinstance(brand, BrandIdentityResult)
            else _stringify(brand or {})
        )

        return self.prompt_template.format(
            polished_idea=polished or state.get("idea_text", ""),
            market_research_result=market_str,
            competitive_analysis_result=comp_str,
            business_model_result=bm_str,
            brand_identity_result=brand_str,
        )


go_to_market_agent = GoToMarketAgent()
