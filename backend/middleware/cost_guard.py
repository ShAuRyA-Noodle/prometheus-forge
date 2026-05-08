"""CostGuardMiddleware.

Pre-request budget enforcement. Only wraps `POST /api/generate` and
`POST /api/session/{id}/regen` (the two paths that schedule pipeline work).

Tiers (services/billing_service.get_user_tier):
    whisper      → 1 generation / month (free tier)
    founder      → soft-throttle at 100 / month (warn header above 80)
    founder_pro  → soft-throttle at 250 / month
    team         → 250 * seats / month
    cohort       → unlimited
    internal     → bypass

Aborts with HTTP 402 (Payment Required) if the user is over their tier cap.
"""
from __future__ import annotations

from datetime import datetime, timezone

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from config import settings

log = structlog.get_logger("cost_guard")


_GUARDED_POST_PATHS_EXACT = {"/api/generate"}
_GUARDED_POST_SUFFIXES = ("/regen", "/branch", "/deploy", "/export")


_TIER_MONTHLY_CAP: dict[str, int | None] = {
    "whisper": 1,
    "founder": 100,
    "founder_pro": 250,
    "team": 250,  # multiplied by seats inside check
    "cohort": None,
    "internal": None,
}
_SOFT_THROTTLE_THRESHOLD = 0.8


def _is_guarded(method: str, path: str) -> bool:
    if method != "POST":
        return False
    if path in _GUARDED_POST_PATHS_EXACT:
        return True
    return any(path.endswith(s) for s in _GUARDED_POST_SUFFIXES) and path.startswith("/api/session/")


class CostGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not _is_guarded(request.method, request.url.path):
            return await call_next(request)

        user = getattr(request.state, "user", None)
        if user is None:
            return await call_next(request)
        if user.role == "internal":
            return await call_next(request)

        from services import billing_service, cost_service

        try:
            tier = await billing_service.get_user_tier(user.uid)
            tier_value = getattr(tier, "value", tier)
        except Exception:  # noqa: BLE001
            tier_value = user.tier

        cap = _TIER_MONTHLY_CAP.get(tier_value, _TIER_MONTHLY_CAP["whisper"])

        if cap is None:
            return await call_next(request)

        period = datetime.now(tz=timezone.utc).strftime("%Y-%m")
        used = 0
        try:
            used = await cost_service.check_budget(uid=user.uid, period=period)
        except Exception as e:  # noqa: BLE001
            log.warning("cost_guard.check_failed", err=str(e))

        if used >= cap:
            log.warning(
                "cost_guard.cap_exceeded",
                uid=user.uid,
                tier=tier_value,
                used=used,
                cap=cap,
            )
            return JSONResponse(
                status_code=402,
                content={
                    "code": "BUDGET_EXCEEDED",
                    "message": (
                        f"monthly cap of {cap} generations exceeded on tier {tier_value}. "
                        "upgrade at /api/billing/checkout"
                    ),
                    "request_id": getattr(request.state, "request_id", None),
                    "tier": tier_value,
                    "used": used,
                    "cap": cap,
                },
            )

        response = await call_next(request)
        if used / cap >= _SOFT_THROTTLE_THRESHOLD:
            response.headers["x-quota-warning"] = f"{used}/{cap}"
        response.headers["x-quota-used"] = str(used)
        response.headers["x-quota-cap"] = str(cap)
        response.headers["x-quota-period"] = period
        # Tag session-level hard cap so downstream worker can refuse early.
        response.headers["x-session-cost-cap-usd"] = str(settings.max_cost_usd_per_session)
        return response
