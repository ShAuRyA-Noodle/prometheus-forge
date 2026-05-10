"""Unit tests for RiskAnalysisAgent (Wave 1, Flash)."""
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
    from agents.risk_analysis_agent import risk_analysis_agent
    from models.agent_schemas import RiskAnalysisResult

    await assert_happy_path(risk_analysis_agent, state, RiskAnalysisResult)


async def test_validation_retry(monkeypatch, state) -> None:
    from agents.risk_analysis_agent import risk_analysis_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, risk_analysis_agent, state, _default_for_schema("RiskAnalysisResult")
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.risk_analysis_agent import risk_analysis_agent

    await assert_validation_final_fail(monkeypatch, risk_analysis_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.risk_analysis_agent import risk_analysis_agent

    await assert_safety_blocked(monkeypatch, risk_analysis_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.risk_analysis_agent import risk_analysis_agent

    await assert_timeout(monkeypatch, risk_analysis_agent, state)


async def test_output_key() -> None:
    from agents.risk_analysis_agent import risk_analysis_agent

    assert risk_analysis_agent.output_key == "risk_analysis_result"
