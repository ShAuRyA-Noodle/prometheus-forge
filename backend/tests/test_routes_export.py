"""Export route tests."""
from __future__ import annotations

import secrets
from datetime import UTC, datetime

import pytest

pytestmark = pytest.mark.asyncio


def _session_for(uid: str):
    from models.session_models import Session, SessionStatus

    return Session(
        session_id=f"sess_{secrets.token_urlsafe(8)}",
        user_uid=uid,
        idempotency_key=secrets.token_urlsafe(12),
        idea_text_hash="0" * 64,
        idea_text="x",
        status=SessionStatus.COMPLETED,
        created_at=datetime.now(UTC),
    )


async def test_export_multi_target(client, in_memory_firestore, fake_auth_user) -> None:
    s = _session_for(fake_auth_user.uid)
    in_memory_firestore.sessions[s.session_id] = s

    payload = {"session_id": s.session_id, "targets": ["json", "drive", "notion"]}
    r = await client.post(
        f"/api/session/{s.session_id}/export",
        json=payload,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "exp-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["session_id"] == s.session_id
    targets = {row["target"] for row in body["results"]}
    assert targets == {"json", "drive", "notion"}


async def test_export_unknown_target_400(client, in_memory_firestore, fake_auth_user) -> None:
    s = _session_for(fake_auth_user.uid)
    in_memory_firestore.sessions[s.session_id] = s

    r = await client.post(
        f"/api/session/{s.session_id}/export",
        json={"session_id": s.session_id, "targets": ["bogus_target"]},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "exp-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_TARGETS"


async def test_export_idor_403(client, in_memory_firestore) -> None:
    s = _session_for("uid_other")
    in_memory_firestore.sessions[s.session_id] = s

    r = await client.post(
        f"/api/session/{s.session_id}/export",
        json={"session_id": s.session_id, "targets": ["json"]},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "exp-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 403
