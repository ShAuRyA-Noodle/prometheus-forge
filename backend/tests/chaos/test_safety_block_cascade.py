"""Chaos: Wave 1 safety block on a single agent should NOT cascade beyond what's required."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

pytestmark = pytest.mark.asyncio


async def test_safety_block_on_one_wave1_agent_keeps_session_partial(monkeypatch) -> None:
    """One Wave-1 agent gets SAFETY_BLOCKED → gate likely rejects → partial."""
    from agents import market_research_agent as mr_mod
    from agents.orchestrator import build_orchestrator
    from models.session_models import (
        AgentName,
        AgentStatusValue,
        Session,
        SessionStatus,
    )
    from services import gemini_client
    from tests.conftest import _default_for_schema
    from tests.test_pipeline import _patch_after_model_services

    _patch_after_model_services(monkeypatch)

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        if response_schema.__name__ == "MarketResearchResult":
            return {}, 0, 0, True  # safety blocked
        return _default_for_schema(response_schema.__name__), 100, 100, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)

    s = Session(
        session_id="sess_sb_cascade",
        user_uid="uid",
        idempotency_key="k",
        idea_text_hash="0" * 64,
        idea_text="x",
        status=SessionStatus.QUEUED,
        created_at=datetime.now(UTC),
    )
    state = {"session": s, "idea_text": s.idea_text}
    orch = build_orchestrator(state)
    session = await orch.run()

    # Market research blocked.
    assert session.agents[AgentName.MARKET_RESEARCH].status == AgentStatusValue.SAFETY_BLOCKED
    # Wave 2/3 agents skipped (gate rejected).
    assert session.status in {SessionStatus.PARTIAL, SessionStatus.ERROR}
    assert session.agents[AgentName.PITCH_DECK].status == AgentStatusValue.SKIPPED
