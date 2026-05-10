"""Chaos: Slides batchUpdate fails mid-deck → outbox replays."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_workspace_outage_does_not_crash_pitch_deck_after_model(monkeypatch, mock_gemini) -> None:
    """Pitch-deck after_model gracefully tolerates workspace outage and returns base output."""
    from agents import _summarize
    from agents.pitch_deck_agent import pitch_deck_agent
    from models.session_models import AgentStatusValue
    from services import google_workspace
    from tests.test_agents._helpers import populated_state

    async def _summarize_all(state, keys):
        return {f"{k.replace('_result','')}_summary": "x" for k in keys}

    async def _broken_workspace(**_kw):
        raise RuntimeError("Slides 503")

    monkeypatch.setattr(_summarize, "summarize_all", _summarize_all, raising=False)
    monkeypatch.setattr(
        google_workspace,
        "create_presentation_from_template",
        _broken_workspace,
        raising=False,
    )

    state = populated_state()
    result = await pitch_deck_agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED
    # Base output preserved (no presentation_url).
    assert result.output is not None
    assert result.output.presentation_url is None


async def test_outbox_replay_on_workspace_failure(monkeypatch) -> None:
    """Outbox dispatcher replays a CREATE_PRESENTATION op until success."""
    from services import outbox_service as ob

    attempts = {"n": 0}

    async def _flaky(row):
        attempts["n"] += 1
        if attempts["n"] < 2:
            raise RuntimeError("transient 503")
        return {"presentation_id": "p1"}

    ob.register_dispatcher(ob.OutboxOpType.CREATE_PRESENTATION, _flaky)

    retry_calls: list[str] = []
    completed: list[dict] = []

    async def _mark_retry(row, err):
        retry_calls.append(err)

    async def _mark_complete(row, result):
        completed.append(result)

    monkeypatch.setattr(ob, "_mark_retry", _mark_retry, raising=False)
    monkeypatch.setattr(ob, "_mark_complete", _mark_complete, raising=False)

    row = ob.OutboxRow(
        session_id="s",
        op_type=ob.OutboxOpType.CREATE_PRESENTATION,
        op_key="k",
        payload={},
    )

    # First call fails → retry queued
    await ob.dispatch(row)
    assert retry_calls == ["transient 503"]
    # Second call succeeds → complete
    await ob.dispatch(row)
    assert len(completed) == 1
