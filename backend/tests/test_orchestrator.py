"""Orchestrator unit tests — build, callbacks, budget enforcement."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

pytestmark = pytest.mark.asyncio


def _state() -> dict[str, Any]:
    from models.session_models import Session, SessionStatus

    s = Session(
        session_id="sess_orch_test",
        user_uid="uid",
        idempotency_key="key",
        idea_text_hash="0" * 64,
        idea_text="An idea.",
        status=SessionStatus.QUEUED,
        created_at=datetime.now(UTC),
    )
    return {"session": s, "idea_text": s.idea_text}


async def test_build_orchestrator_requires_session() -> None:
    from agents.orchestrator import build_orchestrator

    with pytest.raises(ValueError):
        build_orchestrator({})


async def test_build_orchestrator_attaches_idea_text() -> None:
    from agents.orchestrator import build_orchestrator

    state = _state()
    state.pop("idea_text", None)
    orch = build_orchestrator(state)
    assert orch.state["idea_text"] == state["session"].idea_text


async def test_callbacks_fire(monkeypatch, mock_gemini) -> None:
    from agents.orchestrator import build_orchestrator
    from tests.test_pipeline import _patch_after_model_services

    _patch_after_model_services(monkeypatch)

    seen_agent: list[str] = []
    seen_gate: list[str] = []
    seen_complete: list[str] = []

    async def _on_agent(record):
        seen_agent.append(record.name.value)

    async def _on_gate(gate):
        seen_gate.append(gate.wave)

    async def _on_complete(session):
        seen_complete.append(session.status.value)

    state = _state()
    state["_on_agent_update"] = _on_agent
    state["_on_gate_result"] = _on_gate
    state["_on_pipeline_complete"] = _on_complete

    orch = build_orchestrator(state)
    await orch.run()

    # Agent callback fires twice per agent (RUNNING then terminal); >= 14 unique agent names.
    assert len(set(seen_agent)) >= 14
    assert seen_gate == ["wave_1", "wave_2", "wave_3"]
    assert len(seen_complete) == 1


async def test_budget_guard_aborts_mid_pipeline(monkeypatch, mock_gemini) -> None:
    """Force a session-cost cap that's exceeded after the very first agent."""
    from agents.orchestrator import build_orchestrator
    from config import settings
    from models.session_models import SessionStatus

    monkeypatch.setattr(settings, "max_cost_usd_per_session", 0.0001)

    from services import gemini_client

    async def _expensive(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        # Massive token counts → cost > 0.0001
        from tests.conftest import _default_for_schema

        return _default_for_schema(response_schema.__name__), 1_000_000, 1_000_000, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _expensive, raising=False)

    state = _state()
    orch = build_orchestrator(state)
    session = await orch.run()

    assert session.status == SessionStatus.BUDGET_EXCEEDED
    assert session.error_code == "COST_BUDGET_EXCEEDED"
