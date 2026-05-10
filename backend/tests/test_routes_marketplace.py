"""Marketplace route tests."""
from __future__ import annotations

import secrets
from typing import Any

import pytest

pytestmark = pytest.mark.asyncio


async def test_create_order_lawyer_review(client, monkeypatch) -> None:
    from services import billing_service

    class _CO:
        url = "https://stripe.test/co/abc"

    async def _co(**_kw):
        return _CO()

    monkeypatch.setattr(
        billing_service, "create_marketplace_checkout", _co, raising=False
    )

    r = await client.post(
        "/api/marketplace/order",
        json={"job_type": "lawyer_review", "company_id": "co_abc", "notes": "n"},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "mkt-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["job_type"] == "lawyer_review"
    assert body["price_usd"] == 199.0
    assert body["status"] == "awaiting_payment"
    assert body["checkout_url"].startswith("https://")


async def test_create_order_unknown_type_422(client) -> None:
    r = await client.post(
        "/api/marketplace/order",
        json={"job_type": "unknown_kind", "company_id": "co_abc"},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "mkt-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code in {400, 422}


async def test_create_order_brand_polish_pricing(client, monkeypatch) -> None:
    from services import billing_service

    async def _co(**_kw):
        class _C:
            url = "https://stripe.test/co"
        return _C()

    monkeypatch.setattr(billing_service, "create_marketplace_checkout", _co, raising=False)

    r = await client.post(
        "/api/marketplace/order",
        json={"job_type": "brand_polish", "company_id": "co_abc"},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "mkt-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 200
    assert r.json()["price_usd"] == 149.0
