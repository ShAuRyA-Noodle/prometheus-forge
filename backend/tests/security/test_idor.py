"""IDOR regression — user A can never read user B's session."""
from __future__ import annotations

import secrets
from datetime import UTC, datetime

import pytest

pytestmark = [pytest.mark.security, pytest.mark.asyncio]


def _session_for(uid: str):
    from models.session_models import Session, SessionStatus

    return Session(
        session_id=f"sess_{secrets.token_urlsafe(8)}",
        user_uid=uid,
        idempotency_key=secrets.token_urlsafe(12),
        idea_text_hash="0" * 64,
        idea_text="x",
        status=SessionStatus.RUNNING,
        created_at=datetime.now(UTC),
    )


async def test_get_session_other_user_403(client, in_memory_firestore) -> None:
    s = _session_for("uid_attacker_target")
    in_memory_firestore.sessions[s.session_id] = s
    r = await client.get(f"/api/session/{s.session_id}")
    assert r.status_code == 403


async def test_cancel_other_user_403(client, in_memory_firestore) -> None:
    s = _session_for("uid_other")
    in_memory_firestore.sessions[s.session_id] = s
    r = await client.delete(f"/api/session/{s.session_id}")
    assert r.status_code == 403


async def test_branches_other_user_403(client, in_memory_firestore) -> None:
    s = _session_for("uid_other")
    in_memory_firestore.sessions[s.session_id] = s
    r = await client.get(f"/api/session/{s.session_id}/branches")
    assert r.status_code == 403


async def test_export_other_user_403(client, in_memory_firestore) -> None:
    s = _session_for("uid_other")
    in_memory_firestore.sessions[s.session_id] = s
    r = await client.post(
        f"/api/session/{s.session_id}/export",
        json={"session_id": s.session_id, "targets": ["json"]},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "i-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 403


async def test_deploy_other_user_403(client, in_memory_firestore) -> None:
    s = _session_for("uid_other")
    in_memory_firestore.sessions[s.session_id] = s
    r = await client.post(
        f"/api/session/{s.session_id}/deploy",
        json={"session_id": s.session_id, "domain": None, "purchase_domain": False},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "i-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 403


async def test_sse_other_user_403(client, in_memory_firestore) -> None:
    s = _session_for("uid_other")
    in_memory_firestore.sessions[s.session_id] = s
    r = await client.get(
        f"/sse/sessions/{s.session_id}",
        headers={"authorization": "Bearer test"},
    )
    assert r.status_code == 403
