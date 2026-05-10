"""Abuse: adversarial input causes parse failures → budget guard kicks in."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

pytestmark = pytest.mark.asyncio


async def test_repeated_parse_failures_eventually_terminate(monkeypatch) -> None:
    """Many invalid Gemini responses → agents ERROR → pipeline does not loop forever."""
    from agents.orchestrator import build_orchestrator
    from models.session_models import Session, SessionStatus
    from services import gemini_client

    async def _bad(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return {"unrelated": "garbage"}, 100, 100, False  # never validates

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _bad, raising=False)

    s = Session(
        session_id="sess_amp",
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

    assert session.status in {SessionStatus.PARTIAL, SessionStatus.ERROR}


async def test_cost_amplification_triggers_budget_cap(monkeypatch) -> None:
    """Even with adversarial token bloat, the per-session cap hard-stops."""
    from agents.orchestrator import build_orchestrator
    from config import settings
    from models.session_models import Session, SessionStatus
    from services import gemini_client
    from tests.conftest import _default_for_schema

    monkeypatch.setattr(settings, "max_cost_usd_per_session", 0.001)

    async def _huge(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return _default_for_schema(response_schema.__name__), 5_000_000, 5_000_000, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _huge, raising=False)

    s = Session(
        session_id="sess_amp2",
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
