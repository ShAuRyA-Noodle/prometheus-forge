"""Unit tests for TechArchitectureAgent (Wave 1, Flash)."""
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
    from agents.tech_architecture_agent import tech_architecture_agent
    from models.agent_schemas import TechArchitectureResult

    await assert_happy_path(tech_architecture_agent, state, TechArchitectureResult)


async def test_validation_retry(monkeypatch, state) -> None:
    from agents.tech_architecture_agent import tech_architecture_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, tech_architecture_agent, state, _default_for_schema("TechArchitectureResult")
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.tech_architecture_agent import tech_architecture_agent

    await assert_validation_final_fail(monkeypatch, tech_architecture_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.tech_architecture_agent import tech_architecture_agent

    await assert_safety_blocked(monkeypatch, tech_architecture_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.tech_architecture_agent import tech_architecture_agent

    await assert_timeout(monkeypatch, tech_architecture_agent, state)


async def test_output_key() -> None:
    from agents.tech_architecture_agent import tech_architecture_agent

    assert tech_architecture_agent.output_key == "tech_architecture_result"
