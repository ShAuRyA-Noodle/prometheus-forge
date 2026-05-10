"""Unit tests for ArticulationAgent (Pre-wave, Flash)."""
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
    s = populated_state()
    return s


async def test_happy(mock_gemini, state) -> None:
    from agents.articulation_agent import articulation_agent
    from models.agent_schemas import ArticulationOutput

    await assert_happy_path(articulation_agent, state, ArticulationOutput)


async def test_validation_retry(monkeypatch, state) -> None:
    from agents.articulation_agent import articulation_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, articulation_agent, state, _default_for_schema("ArticulationOutput")
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.articulation_agent import articulation_agent

    await assert_validation_final_fail(monkeypatch, articulation_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.articulation_agent import articulation_agent

    await assert_safety_blocked(monkeypatch, articulation_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.articulation_agent import articulation_agent

    await assert_timeout(monkeypatch, articulation_agent, state)


async def test_output_key() -> None:
    from agents.articulation_agent import articulation_agent

    assert articulation_agent.output_key == "articulation"
