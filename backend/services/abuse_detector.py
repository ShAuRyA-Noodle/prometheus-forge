"""Abuse detector — anomaly detection on per-uid / per-IP activity.

Hooks the gateway to track requests/min, cost spikes, latency anomalies, and
repeated safety blocks. When a signal fires, it can escalate to:
  - Cloud Armor blocklist (IP-level, 1h)
  - User-disabled flag in Firestore (1h)

Designed to be cheap and lock-free: per-key ring buffers in process memory
plus a Firestore mirror for persistence across worker restarts.
"""
from __future__ import annotations

import asyncio
import os
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

import httpx
import structlog
from pydantic import BaseModel, Field

from config import settings
from services.pii_scrubber import hash_for_log

log = structlog.get_logger(__name__)


# ─── Thresholds ──────────────────────────────────────────────────────────────

WINDOW_SECONDS = 60
MAX_REQUESTS_PER_MIN = 30
COST_SPIKE_MULTIPLIER = 5.0
LATENCY_P99_ABS_MS = 60_000  # 60s
SAFETY_BLOCKS_THRESHOLD = 3
ABUSE_BLOCK_DURATION_S = 3600  # 1 hour
RING_SIZE = 256


# ─── Models ──────────────────────────────────────────────────────────────────


class AbuseReason(str, Enum):
    RATE = "rate_burst"
    COST = "cost_spike"
    LATENCY = "latency_anomaly"
    SAFETY = "safety_blocks_repeated"
    MULTI = "multiple_signals"


class AbuseSignal(BaseModel):
    uid: str | None
    ip: str | None
    reason: AbuseReason
    severity: float = Field(..., ge=0.0, le=1.0)
    samples: int
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    context: dict[str, Any] = Field(default_factory=dict)


# ─── Ring buffers ────────────────────────────────────────────────────────────


class _Sample(BaseModel):
    ts: float
    cost_usd: float
    latency_ms: float
    safety_blocked: bool = False


_buffers_uid: dict[str, deque[_Sample]] = defaultdict(lambda: deque(maxlen=RING_SIZE))
_buffers_ip: dict[str, deque[_Sample]] = defaultdict(lambda: deque(maxlen=RING_SIZE))
_baseline_cost: dict[str, float] = {}


def record_request(
    uid: str | None,
    ip: str | None,
    cost_usd: float = 0.0,
    latency_ms: float = 0.0,
    safety_blocked: bool = False,
) -> None:
    """Append a sample to the ring buffer for ``uid`` and ``ip``. O(1)."""
    sample = _Sample(
        ts=time.time(),
        cost_usd=cost_usd,
        latency_ms=latency_ms,
        safety_blocked=safety_blocked,
    )
    if uid:
        _buffers_uid[uid].append(sample)
        prev = _baseline_cost.get(uid, 0.0)
        _baseline_cost[uid] = prev * 0.9 + cost_usd * 0.1
    if ip:
        _buffers_ip[ip].append(sample)


def _recent(buf: deque[_Sample], window_s: int) -> list[_Sample]:
    cutoff = time.time() - window_s
    return [s for s in buf if s.ts >= cutoff]


def detect(uid: str | None = None, ip: str | None = None) -> AbuseSignal | None:
    """Examine the buffers for ``uid``/``ip`` and return the highest-severity signal."""
    reasons: list[AbuseReason] = []
    severity = 0.0
    samples = 0
    ctx: dict[str, Any] = {}

    if uid:
        recent = _recent(_buffers_uid[uid], WINDOW_SECONDS)
        samples += len(recent)
        if len(recent) > MAX_REQUESTS_PER_MIN:
            reasons.append(AbuseReason.RATE)
            severity = max(severity, min(1.0, len(recent) / (MAX_REQUESTS_PER_MIN * 2)))
            ctx["req_per_min"] = len(recent)

        if recent:
            avg_cost = sum(s.cost_usd for s in recent) / max(1, len(recent))
            base = _baseline_cost.get(uid, 0.0)
            if base > 0 and avg_cost > base * COST_SPIKE_MULTIPLIER:
                reasons.append(AbuseReason.COST)
                severity = max(severity, 0.8)
                ctx["avg_cost"] = round(avg_cost, 4)
                ctx["baseline_cost"] = round(base, 4)

            if recent:
                p99 = sorted(s.latency_ms for s in recent)[max(0, int(len(recent) * 0.99) - 1)]
                if p99 > LATENCY_P99_ABS_MS:
                    reasons.append(AbuseReason.LATENCY)
                    severity = max(severity, 0.5)
                    ctx["p99_latency_ms"] = round(p99, 1)

            blocks = sum(1 for s in recent if s.safety_blocked)
            if blocks >= SAFETY_BLOCKS_THRESHOLD:
                reasons.append(AbuseReason.SAFETY)
                severity = max(severity, 0.95)
                ctx["safety_blocks"] = blocks

    if ip:
        recent_ip = _recent(_buffers_ip[ip], WINDOW_SECONDS)
        samples += len(recent_ip)
        if len(recent_ip) > MAX_REQUESTS_PER_MIN * 2:
            reasons.append(AbuseReason.RATE)
            severity = max(severity, 1.0)
            ctx.setdefault("ip_req_per_min", len(recent_ip))

    if not reasons:
        return None

    reason = AbuseReason.MULTI if len(reasons) > 1 else reasons[0]
    sig = AbuseSignal(
        uid=uid,
        ip=ip,
        reason=reason,
        severity=severity,
        samples=samples,
        context=ctx,
    )
    log.warning(
        "abuse.detected",
        reason=reason.value,
        severity=severity,
        uid_hash=hash_for_log(uid) if uid else None,
        ip_hash=hash_for_log(ip) if ip else None,
    )
    return sig


# ─── Escalation ──────────────────────────────────────────────────────────────


async def escalate(signal: AbuseSignal) -> None:
    """Apply mitigations: Cloud Armor IP block + user-disabled flag in Firestore.

    Both calls are best-effort; a failure here logs but does not raise."""
    tasks: list[asyncio.Task[Any]] = []
    if signal.ip:
        tasks.append(asyncio.create_task(_cloud_armor_block(signal.ip)))
    if signal.uid:
        tasks.append(asyncio.create_task(_disable_user(signal.uid)))
    tasks.append(asyncio.create_task(_persist_signal(signal)))
    await asyncio.gather(*tasks, return_exceptions=True)


async def _cloud_armor_block(ip: str) -> None:
    """Add ``ip`` to a Cloud Armor security policy via REST. Requires
    ``cloudarmor.securityPolicies.update`` on the worker SA."""
    project = settings.google_cloud_project
    policy_name = os.environ.get("CLOUD_ARMOR_POLICY", "prometheus-abuse-deny")
    url = (
        f"https://compute.googleapis.com/compute/v1/projects/{project}"
        f"/global/securityPolicies/{policy_name}/addRule"
    )
    body = {
        "action": "deny(403)",
        "priority": 1000,
        "match": {"versionedExpr": "SRC_IPS_V1", "config": {"srcIpRanges": [f"{ip}/32"]}},
        "description": f"prometheus_abuse_block:{int(time.time())}:expires_in_{ABUSE_BLOCK_DURATION_S}s",
    }
    try:
        token = await _adc_token()
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(url, json=body, headers={"Authorization": f"Bearer {token}"})
            if r.status_code >= 400:
                log.warning("abuse.cloud_armor_failed", status=r.status_code, body=r.text[:200])
            else:
                log.info("abuse.cloud_armor_blocked", ip_hash=hash_for_log(ip))
    except Exception as e:  # noqa: BLE001
        log.warning("abuse.cloud_armor_error", err=str(e))


async def _disable_user(uid: str) -> None:
    """Set ``users/{uid}.disabled_until`` and ``disabled_reason``."""

    def _w() -> None:
        from services.firestore_service import _get_db  # type: ignore[attr-defined]

        db = _get_db()
        until = datetime.now(timezone.utc) + timedelta(seconds=ABUSE_BLOCK_DURATION_S)
        db.collection("users").document(uid).set(
            {
                "disabled_until": until,
                "disabled_reason": "abuse_detector",
                "disabled_at": datetime.now(timezone.utc),
            },
            merge=True,
        )

    try:
        await asyncio.to_thread(_w)
        log.info("abuse.user_disabled", uid_hash=hash_for_log(uid))
    except Exception as e:  # noqa: BLE001
        log.warning("abuse.user_disable_failed", err=str(e))


async def _persist_signal(signal: AbuseSignal) -> None:
    def _w() -> None:
        from services.firestore_service import _get_db  # type: ignore[attr-defined]

        db = _get_db()
        db.collection("abuse_signals").add(signal.model_dump(mode="json"))

    try:
        await asyncio.to_thread(_w)
    except Exception as e:  # noqa: BLE001
        log.warning("abuse.persist_failed", err=str(e))


async def _adc_token() -> str:
    """Fetch an ADC access token via google-auth (run in thread)."""

    def _t() -> str:
        import google.auth  # type: ignore[import-not-found]
        import google.auth.transport.requests  # type: ignore[import-not-found]

        creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        creds.refresh(google.auth.transport.requests.Request())
        return creds.token  # type: ignore[no-any-return]

    return await asyncio.to_thread(_t)


__all__ = [
    "AbuseReason",
    "AbuseSignal",
    "detect",
    "escalate",
    "record_request",
]
