"""Top-level error registry for HTTP→domain mapping.

`PrometheusError` and friends are also defined in `agents/base.py` for agent
internals; we re-export them here as the canonical names so middleware,
routes, and workers don't have to reach into the agents package for typing.
"""
from __future__ import annotations

from agents.base import (
    AgentSafetyBlocked,
    AgentTimeoutError,
    AgentValidationError,
    CostBudgetExceeded,
    GateRejectedError,
    PrometheusError,
)

__all__ = [
    "AgentSafetyBlocked",
    "AgentTimeoutError",
    "AgentValidationError",
    "CostBudgetExceeded",
    "GateRejectedError",
    "IdempotencyConflict",
    "InvalidAuth",
    "PrometheusError",
    "RateLimited",
    "RequestPayloadTooLarge",
    "SessionNotFound",
    "Unauthorized",
]


class Unauthorized(PrometheusError):
    code = "UNAUTHORIZED"


class InvalidAuth(PrometheusError):
    code = "INVALID_AUTH"


class RateLimited(PrometheusError):
    code = "RATE_LIMITED"


class IdempotencyConflict(PrometheusError):
    code = "IDEMPOTENCY_CONFLICT"


class SessionNotFound(PrometheusError):
    code = "SESSION_NOT_FOUND"


class RequestPayloadTooLarge(PrometheusError):
    code = "PAYLOAD_TOO_LARGE"
