"""Unit tests for BusinessModelAgent (Wave 1, Flash)."""
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
    from agents.business_model_agent import business_model_agent
    from models.agent_schemas import BusinessModelResult

    await assert_happy_path(business_model_agent, state, BusinessModelResult)


async def test_validation_retry(monkeypatch, state) -> None:
    from agents.business_model_agent import business_model_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, business_model_agent, state, _default_for_schema("BusinessModelResult")
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.business_model_agent import business_model_agent

    await assert_validation_final_fail(monkeypatch, business_model_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.business_model_agent import business_model_agent

    await assert_safety_blocked(monkeypatch, business_model_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.business_model_agent import business_model_agent

    await assert_timeout(monkeypatch, business_model_agent, state)


async def test_output_key() -> None:
    from agents.business_model_agent import business_model_agent

    assert business_model_agent.output_key == "business_model_result"
