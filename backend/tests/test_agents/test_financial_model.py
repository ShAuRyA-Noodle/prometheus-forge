"""Unit tests for FinancialModelAgent (Wave 2, Pro) — has after_model deterministic engine."""
from __future__ import annotations

import pytest

from tests.test_agents._helpers import (
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


@pytest.fixture
def stub_finance_engine(monkeypatch):
    from services import finance_engine

    calls = {"n": 0}

    async def _compute_projections(*, assumptions, seed_funding_usd):
        calls["n"] += 1
        from tests.conftest import _default_for_schema
        from models.agent_schemas import FinancialModelResult

        payload = _default_for_schema("FinancialModelResult")
        return FinancialModelResult.model_validate(payload)

    monkeypatch.setattr(finance_engine, "compute_projections", _compute_projections, raising=False)
    return calls


async def test_happy_path_runs_after_model(mock_gemini, stub_finance_engine, state) -> None:
    from agents.financial_model_agent import financial_model_agent
    from models.agent_schemas import FinancialModelResult
    from models.session_models import AgentStatusValue

    result = await financial_model_agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED
    assert isinstance(result.output, FinancialModelResult)
    # Engine fired.
    assert stub_finance_engine["n"] == 1
    assert result.output.reconciliation_passed is True


async def test_after_model_handles_engine_failure(monkeypatch, mock_gemini, state) -> None:
    from agents.financial_model_agent import financial_model_agent
    from models.session_models import AgentStatusValue
    from services import finance_engine

    async def _broken(**_kw):
        raise RuntimeError("engine boom")

    monkeypatch.setattr(finance_engine, "compute_projections", _broken, raising=False)
    result = await financial_model_agent.run(state)
    # Agent surfaces failure via reconciliation_passed=False, status COMPLETED.
    assert result.status == AgentStatusValue.COMPLETED
    assert result.output is not None
    assert result.output.reconciliation_passed is False


async def test_validation_retry(monkeypatch, stub_finance_engine, state) -> None:
    from agents.financial_model_agent import financial_model_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, financial_model_agent, state, _default_for_schema("FinancialModelResult")
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.financial_model_agent import financial_model_agent

    await assert_validation_final_fail(monkeypatch, financial_model_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.financial_model_agent import financial_model_agent

    await assert_safety_blocked(monkeypatch, financial_model_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.financial_model_agent import financial_model_agent

    await assert_timeout(monkeypatch, financial_model_agent, state)


async def test_output_key() -> None:
    from agents.financial_model_agent import financial_model_agent

    assert financial_model_agent.output_key == "financial_model_result"
