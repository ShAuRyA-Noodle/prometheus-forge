"""Chaos: tiny per-session budget → BUDGET_EXCEEDED mid-run."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

pytestmark = pytest.mark.asyncio


async def test_session_cost_cap_enforced(monkeypatch) -> None:
    from agents.orchestrator import build_orchestrator
    from config import settings
    from models.session_models import Session, SessionStatus
    from services import gemini_client

    monkeypatch.setattr(settings, "max_cost_usd_per_session", 0.0001)

    async def _expensive(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        from tests.conftest import _default_for_schema

        return _default_for_schema(response_schema.__name__), 1_000_000, 1_000_000, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _expensive, raising=False)

    s = Session(
        session_id="sess_budget",
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
    assert session.status == SessionStatus.BUDGET_EXCEEDED
    assert session.error_code == "COST_BUDGET_EXCEEDED"
