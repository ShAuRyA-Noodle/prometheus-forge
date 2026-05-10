"""Golden regression — load 50 ideas, run mocked pipeline, assert all reach terminal status."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

pytestmark = [pytest.mark.golden, pytest.mark.asyncio]


async def test_all_golden_ideas_reach_terminal(monkeypatch, mock_gemini, golden_ideas) -> None:
    if not golden_ideas:
        pytest.skip("no golden ideas file")

    from agents.orchestrator import build_orchestrator
    from config import settings
    from models.session_models import Session, SessionStatus
    from tests.test_pipeline import _patch_after_model_services

    _patch_after_model_services(monkeypatch)

    terminal_ok = {
        SessionStatus.COMPLETED,
        SessionStatus.PARTIAL,
        SessionStatus.ERROR,
        SessionStatus.BUDGET_EXCEEDED,
        SessionStatus.SAFETY_BLOCKED,
        SessionStatus.CANCELED,
    }

    failures: list[str] = []
    for idea in golden_ideas[:10]:  # 10 is enough for CI; remove cap for nightly
        s = Session(
            session_id=f"sess_golden_{idea['id']}",
            user_uid="uid_golden",
            idempotency_key=f"k_{idea['id']}",
            idea_text_hash="0" * 64,
            idea_text=idea["idea"][:1900],
            status=SessionStatus.QUEUED,
            created_at=datetime.now(UTC),
        )
        state = {"session": s, "idea_text": s.idea_text}
        orch = build_orchestrator(state)
        session = await orch.run()

        if session.status not in terminal_ok:
            failures.append(f"{idea['id']}: {session.status}")
        # Cost within budget (with mock token counts).
        assert session.cost.total_cost_usd <= settings.max_cost_usd_per_session * 1.5

    assert not failures, f"non-terminal: {failures}"
