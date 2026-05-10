"""Tests for /api/session/* endpoints."""
from __future__ import annotations

import secrets
from datetime import UTC, datetime

import pytest

pytestmark = pytest.mark.asyncio


def _make_session(uid: str, sid: str | None = None):
    from models.session_models import Session, SessionStatus

    return Session(
        session_id=sid or f"sess_{secrets.token_urlsafe(8)}",
        user_uid=uid,
        idempotency_key="k_" + secrets.token_urlsafe(8),
        idea_text_hash="0" * 64,
        idea_text="Some idea",
        status=SessionStatus.RUNNING,
        created_at=datetime.now(UTC),
    )


async def test_get_session_happy(client, in_memory_firestore, fake_auth_user) -> None:
    s = _make_session(fake_auth_user.uid)
    in_memory_firestore.sessions[s.session_id] = s

    r = await client.get(f"/api/session/{s.session_id}")
    assert r.status_code == 200
    assert r.json()["session_id"] == s.session_id


async def test_get_session_idor_rejected(client, in_memory_firestore) -> None:
    other = _make_session("uid_attacker")
    in_memory_firestore.sessions[other.session_id] = other

    r = await client.get(f"/api/session/{other.session_id}")
    assert r.status_code == 403


async def test_get_session_404(client) -> None:
    r = await client.get("/api/session/sess_does_not_exist")
    assert r.status_code == 404


async def test_cancel_session(client, in_memory_firestore, fake_auth_user) -> None:
    s = _make_session(fake_auth_user.uid)
    in_memory_firestore.sessions[s.session_id] = s

    r = await client.delete(f"/api/session/{s.session_id}")
    assert r.status_code == 204
    assert s.session_id in in_memory_firestore.canceled


async def test_regen_agent(client, in_memory_firestore, fake_auth_user) -> None:
    from api.routes_generate import _initial_agents
    from models.session_models import AgentName

    s = _make_session(fake_auth_user.uid)
    s.agents = _initial_agents()
    in_memory_firestore.sessions[s.session_id] = s

    payload = {
        "session_id": s.session_id,
        "agent": AgentName.MARKET_RESEARCH.value,
        "propagate_downstream": True,
    }
    r = await client.post(
        f"/api/session/{s.session_id}/regen",
        json=payload,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "regen-key-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 200
    assert r.json()["session_id"] == s.session_id


async def test_branch_session(client, in_memory_firestore, fake_auth_user) -> None:
    parent = _make_session(fake_auth_user.uid)
    in_memory_firestore.sessions[parent.session_id] = parent

    payload = {
        "session_id": parent.session_id,
        "branch_name": "enterprise pivot",
        "steering": "what if we targeted enterprise instead",
    }
    r = await client.post(
        f"/api/session/{parent.session_id}/branch",
        json=payload,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "branch-key-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 200
    new_id = r.json()["session_id"]
    assert new_id != parent.session_id
    assert new_id in in_memory_firestore.sessions


async def test_idor_export_other_users_session(client, in_memory_firestore) -> None:
    s = _make_session("uid_other")
    in_memory_firestore.sessions[s.session_id] = s

    r = await client.post(
        f"/api/session/{s.session_id}/export",
        json={"session_id": s.session_id, "targets": ["json"]},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "iex-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 403
