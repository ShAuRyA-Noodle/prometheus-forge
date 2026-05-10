"""Idempotent replay — same key+uid → same session_id, no rerun."""
from __future__ import annotations

import secrets

import pytest

pytestmark = pytest.mark.asyncio


async def test_replay_returns_same_session(client) -> None:
    body = {"idea_text": "An idea about reconciliation tools."}
    h = {
        "authorization": "Bearer test",
        "content-type": "application/json",
        "idempotency-key": "replay-key-1234567890ab",
    }

    r1 = await client.post("/api/generate", json=body, headers=h)
    r2 = await client.post("/api/generate", json=body, headers=h)
    assert r1.status_code == 202
    assert r2.status_code in {200, 202}
    assert r1.json()["session_id"] == r2.json()["session_id"]


async def test_different_users_same_key_different_sessions(client, monkeypatch) -> None:
    """Same idempotency key from a DIFFERENT user → distinct session."""
    body = {"idea_text": "An idea about gardens."}
    key = "shared-key-1234567890ab"

    # First user.
    r1 = await client.post(
        "/api/generate",
        json=body,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": key},
    )
    sid1 = r1.json()["session_id"]

    # Switch to user B by patching auth_service.
    from services import auth_service

    async def _verify_session(_t):
        return {"sub": "uid_user_B", "uid": "uid_user_B", "email": "b@example.com",
                "tier": "founder", "role": "user"}

    monkeypatch.setattr(auth_service, "verify_session_jwt", _verify_session, raising=False)

    r2 = await client.post(
        "/api/generate",
        json=body,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": key},
    )
    assert r2.status_code == 202
    assert r2.json()["session_id"] != sid1
