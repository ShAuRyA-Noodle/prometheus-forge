"""Unit tests for ExecutiveSummaryAgent (Wave 3, Pro) — coherence_service + workspace."""
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
def stub_after_model(monkeypatch):
    from agents import _summarize
    from services import coherence_service, google_workspace

    calls = {"summarize_all": 0, "coherence": 0, "doc": 0}

    async def _summarize_all(state, keys):
        calls["summarize_all"] += 1
        return {f"{k.replace('_result', '')}_summary": "x" for k in keys}

    async def _score(all_outputs):
        calls["coherence"] += 1
        return 0.91

    async def _doc(**kw):
        calls["doc"] += 1
        return {"doc_id": "doc_abc", "doc_url": "https://docs.example/exec"}

    monkeypatch.setattr(_summarize, "summarize_all", _summarize_all, raising=False)
    monkeypatch.setattr(coherence_service, "score", _score, raising=False)
    monkeypatch.setattr(
        google_workspace, "create_executive_summary_doc", _doc, raising=False
    )
    return calls


async def test_happy_path_runs_after_model(mock_gemini, stub_after_model, state) -> None:
    from agents.executive_summary_agent import executive_summary_agent
    from models.agent_schemas import ExecutiveSummaryResult
    from models.session_models import AgentStatusValue

    result = await executive_summary_agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED
    assert isinstance(result.output, ExecutiveSummaryResult)
    assert stub_after_model["coherence"] == 1
    assert stub_after_model["doc"] == 1
    # Coherence injected.
    assert abs(result.output.coherence_score - 0.91) < 1e-6


async def test_validation_retry(monkeypatch, stub_after_model, state) -> None:
    from agents.executive_summary_agent import executive_summary_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, executive_summary_agent, state, _default_for_schema("ExecutiveSummaryResult")
    )


async def test_validation_final_fail(monkeypatch, stub_after_model, state) -> None:
    from agents.executive_summary_agent import executive_summary_agent

    await assert_validation_final_fail(monkeypatch, executive_summary_agent, state)


async def test_safety_blocked(monkeypatch, stub_after_model, state) -> None:
    from agents.executive_summary_agent import executive_summary_agent

    await assert_safety_blocked(monkeypatch, executive_summary_agent, state)


async def test_timeout(monkeypatch, stub_after_model, state) -> None:
    from agents.executive_summary_agent import executive_summary_agent

    await assert_timeout(monkeypatch, executive_summary_agent, state)


async def test_output_key() -> None:
    from agents.executive_summary_agent import executive_summary_agent

    assert executive_summary_agent.output_key == "executive_summary_result"
