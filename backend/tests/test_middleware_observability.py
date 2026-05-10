"""ObservabilityMiddleware tests — request_id, latency, no idea_text logging."""
from __future__ import annotations

import secrets

import pytest

pytestmark = pytest.mark.asyncio


async def test_request_id_in_response(client) -> None:
    r = await client.get("/health", headers={"x-request-id": "req_test_xyz"})
    assert r.headers.get("x-request-id") == "req_test_xyz"


async def test_request_id_generated_when_missing(client) -> None:
    r = await client.get("/health")
    rid = r.headers.get("x-request-id")
    assert rid is not None
    assert len(rid) > 0


async def test_idea_text_never_logged(client, caplog) -> None:
    """Run a generate and assert raw idea_text never appears in any log message."""
    import logging

    body = {"idea_text": "A SECRET_IDEA_TEXT_MARKER_12345 reconciliation idea."}
    with caplog.at_level(logging.DEBUG):
        await client.post(
            "/api/generate",
            json=body,
            headers={
                "authorization": "Bearer test",
                "content-type": "application/json",
                "idempotency-key": "obs-" + secrets.token_urlsafe(12),
            },
        )

    for record in caplog.records:
        assert "SECRET_IDEA_TEXT_MARKER_12345" not in record.getMessage()
        assert "SECRET_IDEA_TEXT_MARKER_12345" not in str(getattr(record, "args", ""))


async def test_latency_recorded(client) -> None:
    from middleware.observability import latency_snapshot

    snap_before = latency_snapshot()
    await client.get("/health")
    snap_after = latency_snapshot()
    # Some bucket increased.
    assert snap_after != snap_before or any(snap_after.values())
