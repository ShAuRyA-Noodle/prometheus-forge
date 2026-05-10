"""Unit tests for CompetitiveAnalysisAgent (Wave 1, Pro+grounding)."""
from __future__ import annotations

import pytest

from tests.test_agents._helpers import (
    assert_happy_path,
    assert_safety_blocked,
    assert_timeout,
    assert_validation_final_fail,
    assert_validation_retry,
    populated_state,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture
def state():
    return populated_state()


async def test_happy(mock_gemini, state) -> None:
    from agents.competitive_analysis_agent import competitive_analysis_agent
    from models.agent_schemas import CompetitiveAnalysisResult

    await assert_happy_path(competitive_analysis_agent, state, CompetitiveAnalysisResult)


async def test_validation_retry(monkeypatch, state) -> None:
    from agents.competitive_analysis_agent import competitive_analysis_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch,
        competitive_analysis_agent,
        state,
        _default_for_schema("CompetitiveAnalysisResult"),
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.competitive_analysis_agent import competitive_analysis_agent

    await assert_validation_final_fail(monkeypatch, competitive_analysis_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.competitive_analysis_agent import competitive_analysis_agent

    await assert_safety_blocked(monkeypatch, competitive_analysis_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.competitive_analysis_agent import competitive_analysis_agent

    await assert_timeout(monkeypatch, competitive_analysis_agent, state)


async def test_output_key_and_grounding() -> None:
    from agents.competitive_analysis_agent import competitive_analysis_agent

    assert competitive_analysis_agent.output_key == "competitive_analysis_result"
    assert competitive_analysis_agent.requires_grounding is True
