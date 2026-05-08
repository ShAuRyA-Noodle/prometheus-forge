"""RateLimitMiddleware.

Per-uid sliding-window limiter using `limits` library.
- Redis storage when REDIS_URL is configured (multi-instance Cloud Run).
- In-memory storage as fallback (single-instance dev/CI).

Anonymous-route paths bypass. /sse and /health bypass.

Limits (from settings):
- hourly_rate_limit_per_uid (default 3)
- daily_rate_limit_per_uid  (default 20)
"""
from __future__ import annotations

import os
from typing import Any

import structlog
from limits import RateLimitItemPerDay, RateLimitItemPerHour
from limits.aio.storage import MemoryStorage, RedisStorage
from limits.aio.strategies import MovingWindowRateLimiter
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from config import settings

log = structlog.get_logger("rate_limit")


_BYPASS_EXACT = {"/", "/health", "/api/auth/anon", "/api/auth/verify", "/api/billing/webhook"}
_BYPASS_PREFIXES = ("/sse/", "/internal/", "/openapi", "/docs", "/redoc")

# Methods that mutate or consume model budget.
_LIMITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _build_storage() -> Any:
    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        log.info("rate_limit.storage", backend="redis")
        return RedisStorage(redis_url)
    log.info("rate_limit.storage", backend="memory")
    return MemoryStorage()


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: Any) -> None:
        super().__init__(app)
        self._storage = _build_storage()
        self._limiter = MovingWindowRateLimiter(self._storage)
        self._hourly = RateLimitItemPerHour(settings.hourly_rate_limit_per_uid)
        self._daily = RateLimitItemPerDay(settings.daily_rate_limit_per_uid)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if path in _BYPASS_EXACT or any(path.startswith(p) for p in _BYPASS_PREFIXES):
            return await call_next(request)
        if request.method not in _LIMITED_METHODS:
            return await call_next(request)

        user = getattr(request.state, "user", None)
        if user is None:
            return await call_next(request)

        # Internal SA bypass.
        if user.role == "internal":
            return await call_next(request)

        scope = f"uid:{user.uid}:{request.method}:{_route_template(path)}"

        ok_h = await self._limiter.hit(self._hourly, scope, "hourly")
        ok_d = await self._limiter.hit(self._daily, scope, "daily")
        if not (ok_h and ok_d):
            log.warning(
                "rate_limit.exceeded",
                uid=user.uid,
                path=path,
                hourly_ok=ok_h,
                daily_ok=ok_d,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "code": "RATE_LIMITED",
                    "message": "rate limit exceeded; retry after the window resets",
                    "request_id": getattr(request.state, "request_id", None),
                },
                headers={"Retry-After": "60"},
            )

        return await call_next(request)


def _route_template(path: str) -> str:
    """Group all session ids into a single bucket so a user spamming N session lookups
    is rate-limited as one scope, not bypassing via varied paths."""
    parts = path.split("/")
    out: list[str] = []
    for p in parts:
        # crude: anything 8+ chars with hex/uuidish shape → :id
        if len(p) >= 16 and all(c.isalnum() or c in "-_" for c in p):
            out.append(":id")
        else:
            out.append(p)
    return "/".join(out)
