"""Abuse: user B cannot read user A's session."""
from __future__ import annotations

import secrets
from datetime import UTC, datetime

import pytest

pytestmark = pytest.mark.asyncio


async def test_user_b_cannot_read_user_a_session(client, in_memory_firestore) -> None:
    from models.session_models import Session, SessionStatus

    s = Session(
        session_id=f"sess_a_{secrets.token_urlsafe(8)}",
        user_uid="uid_user_A",
        idempotency_key="k",
        idea_text_hash="0" * 64,
        idea_text="x",
        status=SessionStatus.RUNNING,
        created_at=datetime.now(UTC),
    )
    in_memory_firestore.sessions[s.session_id] = s

    # Default conftest user is uid_test_123 — not uid_user_A.
    r = await client.get(f"/api/session/{s.session_id}")
    assert r.status_code == 403
