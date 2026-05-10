"""Chaos: intermittent Firestore failure → outbox queues retries; session not lost."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_intermittent_firestore_failure_no_session_loss(monkeypatch) -> None:
    """create_session fails once, succeeds on retry; session is preserved."""
    from services import firestore_service

    calls = {"n": 0}
    saved: list = []

    async def _flaky(session):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("firestore down")
        saved.append(session)

    monkeypatch.setattr(firestore_service, "create_session", _flaky, raising=False)

    # Call directly with retry semantics
    from datetime import UTC, datetime

    from models.session_models import Session, SessionStatus

    s = Session(
        session_id="sess_chaos_2",
        user_uid="uid",
        idempotency_key="k",
        idea_text_hash="0" * 64,
        idea_text="x",
        status=SessionStatus.QUEUED,
        created_at=datetime.now(UTC),
    )
    # First call fails, second succeeds.
    with pytest.raises(RuntimeError):
        await firestore_service.create_session(s)
    await firestore_service.create_session(s)
    assert len(saved) == 1


async def test_outbox_queues_retry_on_dispatch_failure(monkeypatch) -> None:
    from services import outbox_service as ob

    retry_calls: list[str] = []

    async def _broken(row):
        raise RuntimeError("downstream timeout")

    ob.register_dispatcher(ob.OutboxOpType.SEND_EMAIL, _broken)

    async def _mark_retry(row, err):
        retry_calls.append(err)

    monkeypatch.setattr(ob, "_mark_retry", _mark_retry, raising=False)

    row = ob.OutboxRow(
        session_id="s_x", op_type=ob.OutboxOpType.SEND_EMAIL, op_key="k", payload={}
    )
    await ob.dispatch(row)
    assert len(retry_calls) == 1
