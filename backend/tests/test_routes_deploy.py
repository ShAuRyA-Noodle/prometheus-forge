"""Deploy route tests."""
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


async def test_deploy_default_subdomain(client, in_memory_firestore, fake_auth_user) -> None:
    s = _session_for(fake_auth_user.uid)
    in_memory_firestore.sessions[s.session_id] = s

    payload = {"session_id": s.session_id, "domain": None, "purchase_domain": False}
    r = await client.post(
        f"/api/session/{s.session_id}/deploy",
        json=payload,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "dep-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["domain_purchased"] is False


async def test_deploy_with_domain_purchase(client, in_memory_firestore, fake_auth_user) -> None:
    s = _session_for(fake_auth_user.uid)
    in_memory_firestore.sessions[s.session_id] = s

    payload = {"session_id": s.session_id, "domain": "tally.io", "purchase_domain": True}
    r = await client.post(
        f"/api/session/{s.session_id}/deploy",
        json=payload,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "dep-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["domain_purchased"] is True


async def test_deploy_idor_403(client, in_memory_firestore) -> None:
    s = _session_for("uid_other")
    in_memory_firestore.sessions[s.session_id] = s

    r = await client.post(
        f"/api/session/{s.session_id}/deploy",
        json={"session_id": s.session_id, "domain": None, "purchase_domain": False},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "dep-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 403
