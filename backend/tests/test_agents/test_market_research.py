"""Unit tests for MarketResearchAgent (Wave 1, Pro+grounding)."""
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
    from agents.market_research_agent import market_research_agent
    from models.agent_schemas import MarketResearchResult

    await assert_happy_path(market_research_agent, state, MarketResearchResult)


async def test_validation_retry(monkeypatch, state) -> None:
    from agents.market_research_agent import market_research_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, market_research_agent, state, _default_for_schema("MarketResearchResult")
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.market_research_agent import market_research_agent

    await assert_validation_final_fail(monkeypatch, market_research_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.market_research_agent import market_research_agent

    await assert_safety_blocked(monkeypatch, market_research_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.market_research_agent import market_research_agent

    await assert_timeout(monkeypatch, market_research_agent, state)


async def test_output_key_and_grounding() -> None:
    from agents.market_research_agent import market_research_agent

    assert market_research_agent.output_key == "market_research_result"
    assert market_research_agent.requires_grounding is True
