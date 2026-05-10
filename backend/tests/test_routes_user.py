"""User profile + GDPR export route tests."""
from __future__ import annotations

import io
import secrets
import zipfile

import pytest

pytestmark = pytest.mark.asyncio


async def test_get_me(client, in_memory_firestore, fake_auth_user) -> None:
    await in_memory_firestore.ensure_user(uid=fake_auth_user.uid, email=fake_auth_user.email)
    r = await client.get("/api/me")
    assert r.status_code == 200
    body = r.json()
    assert body["uid"] == fake_auth_user.uid


async def test_patch_me_updates_consent(client, in_memory_firestore, fake_auth_user) -> None:
    await in_memory_firestore.ensure_user(uid=fake_auth_user.uid, email=fake_auth_user.email)
    r = await client.patch(
        "/api/me",
        json={"consent_gdpr": True, "consent_marketing": False, "locale": "fr-FR"},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "me-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["locale"] == "fr-FR"
    assert body["consent"].get("gdpr") is True


async def test_gdpr_export_returns_zip(client, in_memory_firestore, fake_auth_user) -> None:
    await in_memory_firestore.ensure_user(uid=fake_auth_user.uid, email=fake_auth_user.email)

    r = await client.get("/api/me/export")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = z.namelist()
    assert "user.json" in names
    assert "sessions.json" in names


async def test_companies_list(client, in_memory_firestore, fake_auth_user) -> None:
    from datetime import UTC, datetime

    from models.session_models import Session, SessionStatus

    sess = Session(
        session_id="sess_user_test_1",
        user_uid=fake_auth_user.uid,
        idempotency_key="k",
        idea_text_hash="0" * 64,
        idea_text="x",
        status=SessionStatus.COMPLETED,
        created_at=datetime.now(UTC),
        company_name="Tally",
    )
    in_memory_firestore.sessions[sess.session_id] = sess

    r = await client.get("/api/me/companies")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) >= 1
    assert any(row["company_name"] == "Tally" for row in rows)
