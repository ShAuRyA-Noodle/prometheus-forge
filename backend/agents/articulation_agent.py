"""Articulation Agent — Pre-Wave, Flash. Polishes mush ideas into ArticulationOutput."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, ClassVar

from pydantic import BaseModel

from config import settings
from models.agent_schemas import ArticulationOutput, ParsedIdea
from models.session_models import AgentName, Wave

from .base import PrometheusAgent

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "articulation.txt"


def _stringify(value: Any) -> str:
    """Render an upstream pydantic model (or dict) into a compact JSON string for prompt injection."""
    if isinstance(value, BaseModel):
        return value.model_dump_json(indent=2)
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, indent=2, default=str)
    except (TypeError, ValueError):
        return str(value)


class ArticulationAgent(PrometheusAgent[ArticulationOutput]):
    name: ClassVar[AgentName] = AgentName.ARTICULATION
    wave: ClassVar[Wave] = Wave.PRE
    model: ClassVar[str] = settings.model_flash
    output_schema: ClassVar[type] = ArticulationOutput
    prompt_template: ClassVar[str] = _PROMPT_PATH.read_text(encoding="utf-8")
    requires_grounding: ClassVar[bool] = False
    timeout_seconds: ClassVar[int] = 8
    temperature: ClassVar[float] = 0.3

    @property
    def output_key(self) -> str:
        return "articulation"

    def render_prompt(self, state: dict[str, Any]) -> str:
        parsed = state.get("parsed_idea")
        if isinstance(parsed, ParsedIdea):
            parsed_str = parsed.model_dump_json(indent=2)
        else:
            parsed_str = _stringify(parsed or {})
        return self.prompt_template.format(
            idea_text=state.get("idea_text", ""),
            parsed_idea=parsed_str,
        )


articulation_agent = ArticulationAgent()
