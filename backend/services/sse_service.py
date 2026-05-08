"""Server-Sent-Events pub/sub bus.

Per-session ``asyncio.Queue`` in-process for sub-millisecond fan-out, plus
Firestore eventual replication so a different Cloud Run instance can pick up
events on reconnect.

Public API:
  * ``publish(session_id, event_type, payload)``
  * ``subscribe(session_id) -> AsyncIterator[dict]`` — yields events in order.

Event types are documented in ``EVENT_TYPES``.
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

import structlog

log = structlog.get_logger(__name__)


EVENT_TYPES = (
    "agent_started",
    "agent_token",
    "agent_completed",
    "agent_failed",
    "gate_passed",
    "gate_failed",
    "pipeline_started",
    "pipeline_completed",
    "pipeline_failed",
    "cost_update",
)


# ─── In-process queues ───────────────────────────────────────────────────────


_queues: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}
_lock = asyncio.Lock()
_max_queue_size = 1024


def _get_db() -> Any:
    from services.firestore_service import _get_db as _internal  # type: ignore[attr-defined]

    return _internal()


# ─── Publish ────────────────────────────────────────────────────────────────


async def publish(session_id: str, event_type: str, payload: dict[str, Any] | None = None) -> None:
    if event_type not in EVENT_TYPES:
        log.warning("sse.unknown_event_type", event_type=event_type)

    event = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "type": event_type,
        "ts": datetime.now(timezone.utc).isoformat(),
        "payload": payload or {},
    }

    # In-process fan-out
    async with _lock:
        queues = list(_queues.get(session_id, []))
    for q in queues:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            log.warning("sse.queue_full_drop", session_id=session_id)

    # Best-effort Firestore replication for cross-instance subscribers
    asyncio.create_task(_replicate_to_firestore(session_id, event))


async def _replicate_to_firestore(session_id: str, event: dict[str, Any]) -> None:
    def _write() -> None:
        from datetime import timedelta

        try:
            db = _get_db()
            db.collection("sessions").document(session_id).collection("events").document(
                event["id"]
            ).set(
                {
                    **event,
                    "expires_at": datetime.now(timezone.utc) + timedelta(days=2),
                }
            )
        except Exception as e:  # noqa: BLE001
            log.warning("sse.replicate_err", err=str(e))

    try:
        await asyncio.to_thread(_write)
    except Exception:  # noqa: BLE001
        pass


# ─── Subscribe ──────────────────────────────────────────────────────────────


async def subscribe(
    session_id: str,
    *,
    heartbeat_seconds: float = 15.0,
    max_idle_seconds: float = 600.0,
) -> AsyncIterator[dict[str, Any]]:
    """Yields events for a session. Sends a periodic heartbeat. Caller is
    expected to format SSE wire format (``data: {json}\\n\\n``)."""
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=_max_queue_size)

    async with _lock:
        _queues.setdefault(session_id, []).append(queue)

    last_event_at = time.monotonic()

    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=heartbeat_seconds)
                last_event_at = time.monotonic()
                yield event
                if event["type"] in (
                    "pipeline_completed",
                    "pipeline_failed",
                ):
                    break
            except asyncio.TimeoutError:
                if (time.monotonic() - last_event_at) > max_idle_seconds:
                    yield {
                        "id": str(uuid.uuid4()),
                        "session_id": session_id,
                        "type": "pipeline_failed",
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "payload": {"reason": "stream_idle_timeout"},
                    }
                    break
                yield {
                    "id": str(uuid.uuid4()),
                    "session_id": session_id,
                    "type": "heartbeat",
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "payload": {},
                }
    finally:
        async with _lock:
            queues = _queues.get(session_id, [])
            if queue in queues:
                queues.remove(queue)
            if not queues:
                _queues.pop(session_id, None)


def format_sse(event: dict[str, Any]) -> bytes:
    """Format an event as SSE wire bytes."""
    data = json.dumps(event, default=str)
    return f"event: {event.get('type', 'message')}\ndata: {data}\nid: {event.get('id', '')}\n\n".encode(
        "utf-8"
    )


__all__ = ["EVENT_TYPES", "format_sse", "publish", "subscribe"]
