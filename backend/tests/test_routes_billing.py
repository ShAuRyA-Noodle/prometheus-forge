"""Billing route tests — checkout, webhook signature, portal."""
from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock

import pytest

pytestmark = pytest.mark.asyncio


async def test_checkout_returns_url(client, monkeypatch) -> None:
    from config import settings
    from services import billing_service

    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_xxx", raising=False)

    class _CO:
        url = "https://stripe.test/checkout/abc"
        id = "cs_test_abc"

    async def _create(**_kw):
        return _CO()

    monkeypatch.setattr(
        billing_service, "create_checkout_session", _create, raising=False
    )

    payload = {
        "tier": "founder",
        "seats": 1,
        "success_url": "https://app.example/success",
        "cancel_url": "https://app.example/cancel",
    }
    r = await client.post(
        "/api/billing/checkout",
        json=payload,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "co-key-1234567890ab"},
    )
    assert r.status_code == 200
    assert r.json()["url"] == "https://stripe.test/checkout/abc"


async def test_webhook_invalid_signature(client) -> None:
    r = await client.post(
        "/api/billing/webhook",
        content=b'{"type": "test"}',
        headers={"content-type": "application/json", "stripe-signature": "garbage"},
    )
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_SIGNATURE"


async def test_webhook_missing_signature(client) -> None:
    r = await client.post(
        "/api/billing/webhook",
        content=b"{}",
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 400


async def test_webhook_valid_signature(client, monkeypatch) -> None:
    """Mock construct_event so signature passes; assert handler dispatched."""
    import stripe

    monkeypatch.setattr(
        stripe.Webhook,
        "construct_event",
        lambda payload, sig_header, secret: {
            "id": "evt_test_1",
            "type": "checkout.session.completed",
            "data": {},
            "created": 1,
            "livemode": False,
        },
        raising=False,
    )
    handled: list[str] = []

    from workers import billing_worker

    async def _handle(event):
        handled.append(event["type"])

    monkeypatch.setattr(billing_worker, "handle_stripe_event", _handle, raising=False)

    r = await client.post(
        "/api/billing/webhook",
        content=b"{}",
        headers={"content-type": "application/json", "stripe-signature": "valid"},
    )
    assert r.status_code == 200
    assert handled == ["checkout.session.completed"]


async def test_portal_no_customer_returns_404(client, in_memory_firestore, fake_auth_user) -> None:
    """User has no stripe_customer_id → 404."""
    await in_memory_firestore.ensure_user(uid=fake_auth_user.uid, email=fake_auth_user.email)

    r = await client.get("/api/billing/portal")
    assert r.status_code == 404
    assert r.json()["code"] == "NO_CUSTOMER"
