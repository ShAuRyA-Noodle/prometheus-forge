"""Unit tests for IdeaParserAgent."""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

pytestmark = pytest.mark.asyncio


@pytest.fixture
def state() -> dict[str, Any]:
    return {"idea_text": "A SaaS that reconciles inventory across e-commerce channels."}


async def test_idea_parser_happy_path(mock_gemini, state) -> None:
    from agents.idea_parser_agent import idea_parser_agent
    from models.agent_schemas import ParsedIdea
    from models.session_models import AgentStatusValue

    result = await idea_parser_agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED
    assert isinstance(result.output, ParsedIdea)
    assert result.retry_count == 0
    assert result.input_tokens > 0
    assert idea_parser_agent.output_key == "parsed_idea"


async def test_idea_parser_validation_retry(monkeypatch, mock_gemini, state) -> None:
    """First call returns invalid, second valid → retry_count=1, COMPLETED."""
    from agents.idea_parser_agent import idea_parser_agent
    from models.session_models import AgentStatusValue
    from services import gemini_client
    from tests.conftest import _default_for_schema

    calls = {"n": 0}
    valid = _default_for_schema("ParsedIdea")

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        calls["n"] += 1
        if calls["n"] == 1:
            return {"idea_summary": "x"}, 100, 50, False  # too short → invalid
        return valid, 100, 50, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)

    result = await idea_parser_agent.run(state)
    assert calls["n"] == 2
    assert result.status == AgentStatusValue.COMPLETED
    assert result.retry_count == 1


async def test_idea_parser_validation_final_fail(monkeypatch, state) -> None:
    from agents.base import AgentValidationError
    from agents.idea_parser_agent import idea_parser_agent
    from models.session_models import AgentStatusValue
    from services import gemini_client

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return {"idea_summary": "x"}, 100, 50, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)

    result = await idea_parser_agent.run(state)
    assert result.status == AgentStatusValue.ERROR
    assert result.error_code == AgentValidationError.code


async def test_idea_parser_safety_blocked(monkeypatch, state) -> None:
    from agents.idea_parser_agent import idea_parser_agent
    from models.session_models import AgentStatusValue
    from services import gemini_client

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return {}, 0, 0, True

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)

    result = await idea_parser_agent.run(state)
    assert result.status == AgentStatusValue.SAFETY_BLOCKED
    assert result.error_code == "SAFETY_BLOCKED"


async def test_idea_parser_timeout(monkeypatch, state) -> None:
    from agents.base import AgentTimeoutError
    from agents.idea_parser_agent import idea_parser_agent
    from models.session_models import AgentStatusValue
    from services import gemini_client

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)

    result = await idea_parser_agent.run(state)
    assert result.status == AgentStatusValue.ERROR
    assert result.error_code == AgentTimeoutError.code


async def test_idea_parser_output_key() -> None:
    from agents.idea_parser_agent import idea_parser_agent

    assert idea_parser_agent.output_key == "parsed_idea"
