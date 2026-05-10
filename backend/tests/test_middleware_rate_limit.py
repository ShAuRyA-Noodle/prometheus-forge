"""RateLimitMiddleware tests."""
from __future__ import annotations

import secrets

import pytest

pytestmark = pytest.mark.asyncio


async def test_under_limit_passes(client) -> None:
    body = {"idea_text": "An idea about plants."}
    r = await client.post(
        "/api/generate",
        json=body,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "rl-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 202


async def test_hourly_limit_exceeded(client, monkeypatch) -> None:
    """Force the limiter to refuse all hits → 429 returned."""
    from middleware import rate_limit

    async def _hit(*a, **kw):
        return False

    # Patch the limiter on every middleware instance — simulate cap exceeded.
    for app_mw in client._transport.app.user_middleware:  # type: ignore[attr-defined]
        cls = getattr(app_mw, "cls", None)
        if cls is rate_limit.RateLimitMiddleware:
            # We can't easily get the instance; instead patch the class attribute.
            pass
    # Easier approach: patch the global hit method on MovingWindowRateLimiter.
    monkeypatch.setattr(
        rate_limit.MovingWindowRateLimiter, "hit", _hit, raising=False
    )

    r = await client.post(
        "/api/generate",
        json={"idea_text": "Idea two."},
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "rl2-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 429
    assert r.json()["code"] == "RATE_LIMITED"


async def test_get_method_bypasses(client) -> None:
    """GETs don't hit the rate limiter (only mutating methods do)."""
    r = await client.get("/api/me")
    assert r.status_code in {200, 404}  # not 429
