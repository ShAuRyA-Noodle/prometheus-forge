"""ObservabilityMiddleware.

- Generates / propagates `X-Request-Id`.
- Wraps each request in an OpenTelemetry span.
- Emits structured JSON logs (NO idea_text, NO Authorization).
- Records latency histogram bucketed by route template + status code.
"""
from __future__ import annotations

import time
import uuid
from typing import Any

import structlog
from opentelemetry import trace
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

log = structlog.get_logger("http")
_tracer = trace.get_tracer("prometheus.gateway")

# In-process histogram (handed off to Cloud Monitoring exporter when wired).
_latency_buckets_ms: list[float] = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000]
_latency_counts: dict[str, dict[float, int]] = {}


def _record_latency(route: str, status: int, duration_ms: float) -> None:
    key = f"{route} {status // 100}xx"
    bucket = _latency_buckets_ms[-1]
    for b in _latency_buckets_ms:
        if duration_ms <= b:
            bucket = b
            break
    _latency_counts.setdefault(key, {}).setdefault(bucket, 0)
    _latency_counts[key][bucket] += 1


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id

        route_template = request.url.path  # replaced by route name once router resolves
        method = request.method
        client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?")
        client_ip = client_ip.split(",")[0].strip()

        log_ctx: dict[str, Any] = {
            "request_id": request_id,
            "method": method,
            "path": route_template,
            "ip": client_ip,
        }

        started = time.perf_counter()
        status = 500
        try:
            with _tracer.start_as_current_span(
                f"{method} {route_template}",
                attributes={
                    "http.method": method,
                    "http.target": route_template,
                    "request_id": request_id,
                    "client.ip": client_ip,
                },
            ) as span:
                response = await call_next(request)
                status = response.status_code
                span.set_attribute("http.status_code", status)
                response.headers["x-request-id"] = request_id
                return response
        except Exception:
            log.exception("http.unhandled", **log_ctx)
            raise
        finally:
            duration_ms = (time.perf_counter() - started) * 1000
            _record_latency(route_template, status, duration_ms)
            log.info(
                "http.request",
                status=status,
                duration_ms=round(duration_ms, 2),
                **log_ctx,
            )


def latency_snapshot() -> dict[str, dict[float, int]]:
    """Test/diagnostic helper."""
    return {k: dict(v) for k, v in _latency_counts.items()}
