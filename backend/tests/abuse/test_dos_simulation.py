"""Abuse: rapid POSTs trigger rate-limit 429."""
from __future__ import annotations

import secrets

import pytest

pytestmark = pytest.mark.asyncio


async def test_burst_returns_429(client, monkeypatch) -> None:
    from middleware import rate_limit

    # Force the limiter to refuse on every hit so we don't depend on timing.
    async def _hit(*a, **kw):
        return False

    monkeypatch.setattr(
        rate_limit.MovingWindowRateLimiter, "hit", _hit, raising=False
    )

    body = {"idea_text": "An idea about something."}
    r = await client.post(
        "/api/generate",
        json=body,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "dos-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 429
    assert r.json()["code"] == "RATE_LIMITED"
    assert r.headers.get("Retry-After") is not None
