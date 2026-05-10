"""Unit tests for GoToMarketAgent (Wave 2, Flash)."""
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
    from agents.go_to_market_agent import go_to_market_agent
    from models.agent_schemas import GoToMarketResult

    await assert_happy_path(go_to_market_agent, state, GoToMarketResult)


async def test_validation_retry(monkeypatch, state) -> None:
    from agents.go_to_market_agent import go_to_market_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, go_to_market_agent, state, _default_for_schema("GoToMarketResult")
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.go_to_market_agent import go_to_market_agent

    await assert_validation_final_fail(monkeypatch, go_to_market_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.go_to_market_agent import go_to_market_agent

    await assert_safety_blocked(monkeypatch, go_to_market_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.go_to_market_agent import go_to_market_agent

    await assert_timeout(monkeypatch, go_to_market_agent, state)


async def test_output_key() -> None:
    from agents.go_to_market_agent import go_to_market_agent

    assert go_to_market_agent.output_key == "go_to_market_result"
