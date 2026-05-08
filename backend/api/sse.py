"""SSE streaming endpoint. /sse/sessions/{id} streams agent events.

Event format (RFC EventSource):
    event: <event_type>
    id: <monotonic-int>
    data: <json>
    \n\n

Heartbeat: `: keepalive\n\n` every 15s.

Stream terminates when:
- session.status is terminal (COMPLETED, ERROR, CANCELED, SAFETY_BLOCKED, BUDGET_EXCEEDED, PARTIAL).
- client disconnects (StreamingResponse handles this).
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from middleware.auth import AuthedUser
from models.session_models import SessionStatus

router = APIRouter(prefix="/sse", tags=["sse"])
log = structlog.get_logger("api.sse")


_TERMINAL_STATES = {
    SessionStatus.COMPLETED,
    SessionStatus.ERROR,
    SessionStatus.CANCELED,
    SessionStatus.SAFETY_BLOCKED,
    SessionStatus.BUDGET_EXCEEDED,
    SessionStatus.PARTIAL,
}

_HEARTBEAT_SECONDS = 15.0


def _format_sse(*, event: str, data: dict | str, eid: int | None = None) -> bytes:
    if isinstance(data, dict):
        body = json.dumps(data, default=str)
    else:
        body = str(data)
    parts: list[str] = []
    if eid is not None:
        parts.append(f"id: {eid}")
    parts.append(f"event: {event}")
    for line in body.splitlines() or [""]:
        parts.append(f"data: {line}")
    parts.append("")
    parts.append("")
    return "\n".join(parts).encode("utf-8")


@router.get(
    "/sessions/{session_id}",
    response_class=StreamingResponse,
    summary="Server-Sent Events stream for a single session's pipeline progress.",
)
async def stream_session(session_id: str, request: Request) -> StreamingResponse:
    from services import firestore_service, sse_service

    user: AuthedUser | None = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "auth required for SSE"},
        )

    session = await firestore_service.read_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SESSION_NOT_FOUND", "message": "no session"},
        )
    if session.user_uid != user.uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "session belongs to another user"},
        )

    async def event_gen() -> AsyncIterator[bytes]:
        eid = 0
        # Initial snapshot.
        snapshot = {
            "session_id": session.session_id,
            "status": session.status.value,
            "agents": {k.value: v.status.value for k, v in session.agents.items()},
        }
        yield _format_sse(event="snapshot", data=snapshot, eid=eid)
        eid += 1

        if session.status in _TERMINAL_STATES:
            yield _format_sse(event="terminal", data={"status": session.status.value}, eid=eid)
            return

        sub_iter = sse_service.subscribe(session_id)
        sub_task: asyncio.Task | None = None

        try:
            while True:
                if await request.is_disconnected():
                    log.info("sse.client_disconnected", session_id=session_id)
                    return

                if sub_task is None:
                    sub_task = asyncio.create_task(_anext_safe(sub_iter))

                done, _pending = await asyncio.wait(
                    {sub_task},
                    timeout=_HEARTBEAT_SECONDS,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if not done:
                    yield b": keepalive\n\n"
                    continue

                evt = sub_task.result()
                sub_task = None
                if evt is None:
                    yield _format_sse(event="terminal", data={"status": "stream_closed"}, eid=eid)
                    return

                yield _format_sse(
                    event=evt.get("event", "message"),
                    data=evt.get("data", {}),
                    eid=eid,
                )
                eid += 1

                if evt.get("event") == "terminal":
                    return
                if evt.get("data", {}).get("status") in {s.value for s in _TERMINAL_STATES}:
                    yield _format_sse(
                        event="terminal",
                        data={"status": evt["data"]["status"]},
                        eid=eid,
                    )
                    return
        finally:
            if sub_task and not sub_task.done():
                sub_task.cancel()
            close = getattr(sub_iter, "aclose", None)
            if callable(close):
                try:
                    await close()
                except Exception:  # noqa: BLE001
                    pass

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Type": "text/event-stream; charset=utf-8",
    }
    return StreamingResponse(event_gen(), media_type="text/event-stream", headers=headers)


async def _anext_safe(it):  # type: ignore[no-untyped-def]
    try:
        return await it.__anext__()
    except StopAsyncIteration:
        return None
