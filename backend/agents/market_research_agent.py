"""Market Research Agent — Wave 1, Pro + grounding. Returns MarketResearchResult."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, ClassVar

from pydantic import BaseModel

from config import settings
from models.agent_schemas import ArticulationOutput, MarketResearchResult, ParsedIdea
from models.session_models import AgentName, Wave

from .base import PrometheusAgent

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "market_research.txt"


def _stringify(value: Any) -> str:
    if isinstance(value, BaseModel):
        return value.model_dump_json(indent=2)
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, indent=2, default=str)
    except (TypeError, ValueError):
        return str(value)


class MarketResearchAgent(PrometheusAgent[MarketResearchResult]):
    name: ClassVar[AgentName] = AgentName.MARKET_RESEARCH
    wave: ClassVar[Wave] = Wave.WAVE_1
    model: ClassVar[str] = settings.model_pro
    output_schema: ClassVar[type] = MarketResearchResult
    prompt_template: ClassVar[str] = _PROMPT_PATH.read_text(encoding="utf-8")
    requires_grounding: ClassVar[bool] = True
    timeout_seconds: ClassVar[int] = 60
    temperature: ClassVar[float] = 0.3

    @property
    def output_key(self) -> str:
        return "market_research_result"

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

        return self.prompt_template.format(
            polished_idea=polished or state.get("idea_text", ""),
            parsed_idea=parsed_str,
        )


market_research_agent = MarketResearchAgent()
