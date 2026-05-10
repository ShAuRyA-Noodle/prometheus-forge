"""IdempotencyMiddleware tests."""
from __future__ import annotations

import secrets

import pytest

pytestmark = pytest.mark.asyncio


async def test_same_key_same_session(client) -> None:
    headers = {
        "authorization": "Bearer test",
        "content-type": "application/json",
        "idempotency-key": "same-key-1234567890ab",
    }
    body = {"idea_text": "An idea about reconciliation."}

    r1 = await client.post("/api/generate", json=body, headers=headers)
    r2 = await client.post("/api/generate", json=body, headers=headers)
    assert r1.status_code == 202
    assert r2.status_code in {200, 202}
    assert r1.json()["session_id"] == r2.json()["session_id"]


async def test_different_keys_different_sessions(client) -> None:
    body = {"idea_text": "An idea about reconciliation."}

    h1 = {"authorization": "Bearer test", "content-type": "application/json",
          "idempotency-key": "k1-" + secrets.token_urlsafe(12)}
    h2 = {"authorization": "Bearer test", "content-type": "application/json",
          "idempotency-key": "k2-" + secrets.token_urlsafe(12)}
    r1 = await client.post("/api/generate", json=body, headers=h1)
    r2 = await client.post("/api/generate", json=body, headers=h2)
    assert r1.json()["session_id"] != r2.json()["session_id"]


async def test_invalid_key_rejected(client) -> None:
    body = {"idea_text": "An idea."}
    h = {"authorization": "Bearer test", "content-type": "application/json",
         "idempotency-key": "short"}  # too short
    r = await client.post("/api/generate", json=body, headers=h)
    assert r.status_code == 400
    assert r.json()["code"] == "INVALID_IDEMPOTENCY_KEY"


async def test_missing_key_rejected(client) -> None:
    body = {"idea_text": "An idea."}
    h = {"authorization": "Bearer test", "content-type": "application/json"}
    r = await client.post("/api/generate", json=body, headers=h)
    assert r.status_code == 400
    assert r.json()["code"] == "MISSING_IDEMPOTENCY_KEY"
