"""IdempotencyMiddleware.

Only enforced on `POST /api/generate`. Hard contract:

    - Request must carry `Idempotency-Key` header (UUID-like, 16-128 chars).
    - Key is hashed alongside `user.uid` to scope per-user.
    - If a matching session exists in Firestore → short-circuit and return
      the existing GenerateResponse (status from session.status).
    - Otherwise, set `request.state.idempotency_key` for the route handler
      to persist when it creates the new session row.

We do NOT cache full response bodies here; the route handler is responsible
for being idempotent given the resolved key (uniqueness enforced by
firestore_service.find_existing_session_by_idempotency_key).
"""
from __future__ import annotations

import re

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

log = structlog.get_logger("idempotency")

_IDEMP_PATH = "/api/generate"
_KEY_RE = re.compile(r"^[A-Za-z0-9_\-:.]{16,128}$")


class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not (request.method == "POST" and request.url.path == _IDEMP_PATH):
            return await call_next(request)

        rid = getattr(request.state, "request_id", None)
        key = request.headers.get("idempotency-key", "").strip()
        if not key:
            return JSONResponse(
                status_code=400,
                content={
                    "code": "MISSING_IDEMPOTENCY_KEY",
                    "message": "Idempotency-Key header is required on POST /api/generate",
                    "request_id": rid,
                },
            )
        if not _KEY_RE.match(key):
            return JSONResponse(
                status_code=400,
                content={
                    "code": "INVALID_IDEMPOTENCY_KEY",
                    "message": "Idempotency-Key must be 16-128 chars, [A-Za-z0-9_-:.]",
                    "request_id": rid,
                },
            )

        user = getattr(request.state, "user", None)
        if user is None:
            # Auth middleware should have rejected first.
            return JSONResponse(
                status_code=401,
                content={"code": "UNAUTHORIZED", "message": "no user", "request_id": rid},
            )

        from services import firestore_service

        try:
            existing = await firestore_service.find_existing_session_by_idempotency_key(
                uid=user.uid, key=key
            )
        except Exception as e:  # noqa: BLE001
            log.exception("idempotency.lookup_failed", err=str(e))
            existing = None

        if existing is not None:
            log.info("idempotency.hit", uid=user.uid, session_id=existing.session_id)
            return JSONResponse(
                status_code=200,
                content={
                    "session_id": existing.session_id,
                    "status": existing.status.value,
                    "sse_url": f"/sse/sessions/{existing.session_id}",
                    "estimated_completion_seconds": 0,
                },
                headers={"x-idempotency-replayed": "true"},
            )

        request.state.idempotency_key = key
        return await call_next(request)
