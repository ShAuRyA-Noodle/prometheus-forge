"""AuthMiddleware tests."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_anonymous_routes_pass(client) -> None:
    r = await client.get("/health", headers={})
    assert r.status_code == 200


async def test_protected_route_requires_token(client, monkeypatch) -> None:
    from services import auth_service

    async def _bad(t):
        raise RuntimeError("invalid")

    monkeypatch.setattr(auth_service, "verify_session_jwt", _bad, raising=False)
    monkeypatch.setattr(auth_service, "verify_id_token", _bad, raising=False)

    r = await client.get("/api/me", headers={})
    assert r.status_code == 401


async def test_session_jwt_path(client) -> None:
    """Default conftest setup verifies session JWT successfully."""
    r = await client.get("/api/me", headers={"authorization": "Bearer test.session.jwt"})
    # Default mock + ensure_user shim returns the user.
    assert r.status_code in {200, 404}  # ensure_user might not have been called yet


async def test_firebase_id_token_fallback(client, monkeypatch) -> None:
    """Session JWT verifier raises → falls back to Firebase ID."""
    from services import auth_service

    async def _bad_session(t):
        raise RuntimeError("not a session jwt")

    async def _good_id(t):
        return {
            "sub": "uid_fb_test",
            "uid": "uid_fb_test",
            "email": "fb@example.com",
            "firebase": {"sign_in_provider": "password"},
        }

    monkeypatch.setattr(auth_service, "verify_session_jwt", _bad_session, raising=False)
    monkeypatch.setattr(auth_service, "verify_id_token", _good_id, raising=False)

    r = await client.get("/api/me", headers={"authorization": "Bearer firebase.id.token"})
    assert r.status_code in {200, 404}


async def test_invalid_token(client, monkeypatch) -> None:
    from services import auth_service

    async def _bad(_t):
        raise RuntimeError("invalid")

    monkeypatch.setattr(auth_service, "verify_session_jwt", _bad, raising=False)
    monkeypatch.setattr(auth_service, "verify_id_token", _bad, raising=False)

    r = await client.get("/api/me", headers={"authorization": "Bearer bad"})
    assert r.status_code == 401
    assert r.json()["code"] == "INVALID_AUTH"
