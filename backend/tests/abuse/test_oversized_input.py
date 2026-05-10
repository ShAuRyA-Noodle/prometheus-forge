"""Abuse: oversized idea_text → 413/422."""
from __future__ import annotations

import secrets

import pytest

pytestmark = pytest.mark.asyncio


async def test_megabyte_idea_text_rejected(client) -> None:
    body = {"idea_text": "X" * 500_000}
    r = await client.post(
        "/api/generate",
        json=body,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "ov-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code in {413, 422}


async def test_3000_char_idea_text_rejected(client) -> None:
    body = {"idea_text": "X" * 3000}
    r = await client.post(
        "/api/generate",
        json=body,
        headers={"authorization": "Bearer test", "content-type": "application/json",
                 "idempotency-key": "ov-" + secrets.token_urlsafe(12)},
    )
    assert r.status_code == 422
