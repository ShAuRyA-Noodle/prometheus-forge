"""Tech Architecture Agent — Wave 1, Flash. Returns TechArchitectureResult."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, ClassVar

from pydantic import BaseModel

from config import settings
from models.agent_schemas import (
    ArticulationOutput,
    ParsedIdea,
    RiskAnalysisResult,
    TechArchitectureResult,
)
from models.session_models import AgentName, Wave

from .base import PrometheusAgent

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "tech_architecture.txt"


def _stringify(value: Any) -> str:
    if isinstance(value, BaseModel):
        return value.model_dump_json(indent=2)
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, indent=2, default=str)
    except (TypeError, ValueError):
        return str(value)


class TechArchitectureAgent(PrometheusAgent[TechArchitectureResult]):
    name: ClassVar[AgentName] = AgentName.TECH_ARCHITECTURE
    wave: ClassVar[Wave] = Wave.WAVE_1
    model: ClassVar[str] = settings.model_flash
    output_schema: ClassVar[type] = TechArchitectureResult
    prompt_template: ClassVar[str] = _PROMPT_PATH.read_text(encoding="utf-8")
    requires_grounding: ClassVar[bool] = False
    timeout_seconds: ClassVar[int] = 30
    temperature: ClassVar[float] = 0.3

    @property
    def output_key(self) -> str:
        return "tech_architecture_result"

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

        risk = state.get("risk_analysis_result")
        risk_str = (
            risk.model_dump_json(indent=2)
            if isinstance(risk, RiskAnalysisResult)
            else _stringify(risk or {})
        )

        return self.prompt_template.format(
            polished_idea=polished or state.get("idea_text", ""),
            parsed_idea=parsed_str,
            risk_analysis_result=risk_str,
        )


tech_architecture_agent = TechArchitectureAgent()
