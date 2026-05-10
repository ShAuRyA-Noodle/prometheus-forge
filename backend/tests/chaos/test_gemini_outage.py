"""Chaos: Gemini fails after N calls → pipeline degrades to PARTIAL/ERROR, no fabrication."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

pytestmark = pytest.mark.asyncio


def _state() -> dict[str, Any]:
    from models.session_models import Session, SessionStatus

    s = Session(
        session_id="sess_chaos_1",
        user_uid="uid",
        idempotency_key="k",
        idea_text_hash="0" * 64,
        idea_text="An idea.",
        status=SessionStatus.QUEUED,
        created_at=datetime.now(UTC),
    )
    return {"session": s, "idea_text": s.idea_text}


async def test_gemini_outage_after_n_calls(monkeypatch) -> None:
    from agents.orchestrator import build_orchestrator
    from models.session_models import SessionStatus
    from services import gemini_client
    from tests.conftest import _default_for_schema
    from tests.test_pipeline import _patch_after_model_services

    _patch_after_model_services(monkeypatch)

    calls = {"n": 0}

    async def _flaky(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        calls["n"] += 1
        if calls["n"] > 3:
            raise RuntimeError("gemini outage")
        return _default_for_schema(response_schema.__name__), 100, 100, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _flaky, raising=False)

    orch = build_orchestrator(_state())
    session = await orch.run()

    # Expect a non-COMPLETED terminal state — no fabrication.
    assert session.status in {
        SessionStatus.PARTIAL,
        SessionStatus.ERROR,
        SessionStatus.BUDGET_EXCEEDED,
    }
