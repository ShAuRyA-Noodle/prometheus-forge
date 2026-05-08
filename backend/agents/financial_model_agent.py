"""Financial Model Agent — Wave 2, Pro.

Gemini supplies ASSUMPTIONS only (CAC, churn, pricing, headcount, growth, burn).
The deterministic Python finance engine reconciles a P&L and overwrites the
projections / runway / breakeven / key_metrics / reconciliation_passed fields.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, ClassVar

from pydantic import BaseModel

from config import settings
from models.agent_schemas import (
    ArticulationOutput,
    BusinessModelResult,
    FinancialModelResult,
    MarketResearchResult,
    ParsedIdea,
    TechArchitectureResult,
)
from models.session_models import AgentName, Wave

from .base import PrometheusAgent

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "financial_model.txt"


def _stringify(value: Any) -> str:
    if isinstance(value, BaseModel):
        return value.model_dump_json(indent=2)
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, indent=2, default=str)
    except (TypeError, ValueError):
        return str(value)


class FinancialModelAgent(PrometheusAgent[FinancialModelResult]):
    name: ClassVar[AgentName] = AgentName.FINANCIAL_MODEL
    wave: ClassVar[Wave] = Wave.WAVE_2
    model: ClassVar[str] = settings.model_pro
    output_schema: ClassVar[type] = FinancialModelResult
    prompt_template: ClassVar[str] = _PROMPT_PATH.read_text(encoding="utf-8")
    requires_grounding: ClassVar[bool] = False
    timeout_seconds: ClassVar[int] = 45
    temperature: ClassVar[float] = 0.2

    @property
    def output_key(self) -> str:
        return "financial_model_result"

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

        parsed = state.get("parsed_idea")
        parsed_str = (
            parsed.model_dump_json(indent=2)
            if isinstance(parsed, ParsedIdea)
            else _stringify(parsed or {})
        )

        market = state.get("market_research_result")
        market_str = (
            market.model_dump_json(indent=2)
            if isinstance(market, MarketResearchResult)
            else _stringify(market or {})
        )

        bm = state.get("business_model_result")
        bm_str = (
            bm.model_dump_json(indent=2)
            if isinstance(bm, BusinessModelResult)
            else _stringify(bm or {})
        )

        tech = state.get("tech_architecture_result")
        tech_str = (
            tech.model_dump_json(indent=2)
            if isinstance(tech, TechArchitectureResult)
            else _stringify(tech or {})
        )

        return self.prompt_template.format(
            polished_idea=polished or state.get("idea_text", ""),
            parsed_idea=parsed_str,
            market_research_result=market_str,
            business_model_result=bm_str,
            tech_architecture_result=tech_str,
        )

    async def after_model(
        self,
        output: FinancialModelResult,
        state: dict[str, Any],
    ) -> FinancialModelResult:
        # Hand the assumptions block to the deterministic engine; ignore whatever
        # placeholder projections Gemini returned.
        from services.finance_engine import compute_projections  # noqa: WPS433

        try:
            reconciled: FinancialModelResult = await compute_projections(
                assumptions=output.assumptions,
                seed_funding_usd=output.funding_seed_usd,
            )
        except Exception as exc:  # noqa: BLE001
            self.logger.error("financial_engine.failed", error=str(exc))
            # Surface the failure via reconciliation flag so wave_2_gate rejects.
            return output.model_copy(update={"reconciliation_passed": False})

        return reconciled


financial_model_agent = FinancialModelAgent()
