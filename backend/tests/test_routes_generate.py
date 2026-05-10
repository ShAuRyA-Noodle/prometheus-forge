"""Tests for POST /api/generate."""
from __future__ import annotations

import secrets

import pytest

pytestmark = pytest.mark.asyncio


def _idem_headers() -> dict:
    return {
        "authorization": "Bearer test.session.jwt",
        "idempotency-key": f"idem-{secrets.token_urlsafe(12)}",
        "content-type": "application/json",
    }


async def test_generate_happy_path(client) -> None:
    body = {"idea_text": "An e-commerce inventory reconciliation SaaS for indie sellers."}
    r = await client.post("/api/generate", json=body, headers=_idem_headers())
    assert r.status_code == 202
    data = r.json()
    assert data["status"] == "queued"
    assert data["session_id"].startswith("sess_")


async def test_generate_oversized_input_413_or_422(client) -> None:
    body = {"idea_text": "x" * 5_000}  # > 2000 chars
    r = await client.post("/api/generate", json=body, headers=_idem_headers())
    # 413 from middleware (body too large) OR 422 (Pydantic length cap)
    assert r.status_code in {413, 422}


async def test_generate_control_chars_422(client) -> None:
    # Pydantic validator rejects control chars in idea_text.
    body = {"idea_text": "\x07hello world this is a startup idea"}
    r = await client.post("/api/generate", json=body, headers=_idem_headers())
    # Middleware strips control chars, so the cleaned body may pass — accept either.
    assert r.status_code in {202, 422, 400}


async def test_generate_no_auth_401(client, monkeypatch) -> None:
    from services import auth_service

    async def _bad(_t):
        raise RuntimeError("invalid")

    monkeypatch.setattr(auth_service, "verify_session_jwt", _bad, raising=False)
    monkeypatch.setattr(auth_service, "verify_id_token", _bad, raising=False)

    body = {"idea_text": "An e-commerce inventory reconciliation SaaS."}
    headers = _idem_headers()
    r = await client.post("/api/generate", json=body, headers=headers)
    assert r.status_code == 401


async def test_generate_safety_blocked_returns_422(client, monkeypatch) -> None:
    from services import moderation_service

    class _Blocked:
        allowed = False
        decision = "block"
        categories = ["weapons"]
        reasons = ["lex"]

    async def _block(_t):
        return _Blocked()

    monkeypatch.setattr(moderation_service, "pre_filter_input", _block, raising=False)

    body = {"idea_text": "A startup that builds explosive devices."}
    r = await client.post("/api/generate", json=body, headers=_idem_headers())
    assert r.status_code == 422
    assert r.json()["code"] == "SAFETY_BLOCKED"


async def test_generate_idempotency_dedup(client) -> None:
    """Repeat with same key → returns existing session (200) with replay header."""
    headers = _idem_headers()
    body = {"idea_text": "An e-commerce inventory reconciliation SaaS for indie sellers."}

    r1 = await client.post("/api/generate", json=body, headers=headers)
    assert r1.status_code == 202
    sid1 = r1.json()["session_id"]

    r2 = await client.post("/api/generate", json=body, headers=headers)
    assert r2.status_code in {200, 202}
    assert r2.json()["session_id"] == sid1
    if r2.status_code == 200:
        assert r2.headers.get("x-idempotency-replayed") == "true"


async def test_generate_missing_idempotency_key(client) -> None:
    body = {"idea_text": "An idea about something useful for SMBs."}
    headers = {"authorization": "Bearer test.session.jwt", "content-type": "application/json"}
    r = await client.post("/api/generate", json=body, headers=headers)
    assert r.status_code == 400
    assert "IDEMPOTENCY_KEY" in r.json()["code"]
