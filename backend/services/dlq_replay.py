"""Dead-letter queue replay.

When a session fails the orchestrator may write it to ``failed_sessions``. This
module exposes admin tools to:

  - list failed sessions by time range / reason
  - replay one or many sessions (re-enqueues a Cloud Task targeting the worker)
  - prune very old DLQ entries (soft delete; hard-delete preserves audit window)
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from pydantic import BaseModel, Field

from config import settings
from services.pii_scrubber import hash_for_log

log = structlog.get_logger(__name__)


# ─── Models ──────────────────────────────────────────────────────────────────


class FailedSession(BaseModel):
    session_id: str
    user_uid: str
    failed_at: datetime
    error_code: str | None = None
    error_message: str | None = None
    wave: str | None = None
    agent: str | None = None
    retry_count: int = 0
    last_replayed_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReplayResult(BaseModel):
    session_id: str
    enqueued: bool
    task_name: str | None = None
    error: str | None = None


# ─── Firestore helpers ───────────────────────────────────────────────────────


def _db() -> Any:
    from services.firestore_service import _get_db  # type: ignore[attr-defined]

    return _get_db()


# ─── API ─────────────────────────────────────────────────────────────────────


async def list_failed(
    since: timedelta = timedelta(hours=24),
    limit: int = 100,
    reason_contains: str | None = None,
) -> list[FailedSession]:
    """Read failed_sessions docs newer than ``now - since``."""

    def _read() -> list[dict[str, Any]]:
        cutoff = datetime.now(timezone.utc) - since
        q = (
            _db()
            .collection("failed_sessions")
            .where("failed_at", ">=", cutoff)
            .order_by("failed_at", direction="DESCENDING")
            .limit(limit)
        )
        return [d.to_dict() | {"id": d.id} for d in q.stream()]

    rows = await asyncio.to_thread(_read)
    out: list[FailedSession] = []
    for raw in rows:
        try:
            fs = FailedSession.model_validate({**raw, "session_id": raw.get("session_id") or raw["id"]})
            if reason_contains and reason_contains not in (fs.error_message or ""):
                continue
            out.append(fs)
        except Exception as e:  # noqa: BLE001
            log.warning("dlq.invalid_record", err=str(e))
    return out


async def replay(session_id: str, reason: str = "manual") -> ReplayResult:
    """Re-enqueue a Cloud Task for ``session_id`` and mark the DLQ row."""
    try:
        task_name = await _enqueue_worker_task(session_id, reason)
    except Exception as e:  # noqa: BLE001
        log.error("dlq.replay_enqueue_failed", sid=session_id, err=str(e))
        return ReplayResult(session_id=session_id, enqueued=False, error=str(e))

    def _w() -> None:
        ref = _db().collection("failed_sessions").document(session_id)
        ref.set(
            {
                "last_replayed_at": datetime.now(timezone.utc),
                "replay_reason": reason,
                "replay_task": task_name,
            },
            merge=True,
        )

    await asyncio.to_thread(_w)
    log.info("dlq.replay", sid=session_id, task=task_name, reason=reason)
    return ReplayResult(session_id=session_id, enqueued=True, task_name=task_name)


async def bulk_replay(
    since: timedelta = timedelta(hours=24),
    reason_contains: str | None = None,
    limit: int = 50,
    dry_run: bool = False,
) -> list[ReplayResult]:
    """Replay every failed session matching the filter (subject to ``limit``)."""
    rows = await list_failed(since=since, limit=limit, reason_contains=reason_contains)
    results: list[ReplayResult] = []
    for fs in rows:
        if dry_run:
            results.append(ReplayResult(session_id=fs.session_id, enqueued=False, error="dry_run"))
        else:
            results.append(await replay(fs.session_id, reason="bulk"))
            await asyncio.sleep(0.05)  # gentle throttle
    return results


async def prune(older_than: timedelta = timedelta(days=30)) -> int:
    """Soft-delete (mark) DLQ rows older than ``older_than``. Returns count."""

    def _w() -> int:
        cutoff = datetime.now(timezone.utc) - older_than
        q = (
            _db()
            .collection("failed_sessions")
            .where("failed_at", "<", cutoff)
            .limit(500)
        )
        n = 0
        for d in q.stream():
            d.reference.update({"pruned": True, "pruned_at": datetime.now(timezone.utc)})
            n += 1
        return n

    n = await asyncio.to_thread(_w)
    log.info("dlq.prune", count=n, older_than_days=older_than.days)
    return n


async def record_failure(
    session_id: str,
    user_uid: str,
    error_code: str,
    error_message: str,
    wave: str | None = None,
    agent: str | None = None,
) -> None:
    """Helper for orchestrator to add a row to the DLQ."""

    def _w() -> None:
        _db().collection("failed_sessions").document(session_id).set(
            {
                "session_id": session_id,
                "user_uid": user_uid,
                "user_uid_hash": hash_for_log(user_uid),
                "failed_at": datetime.now(timezone.utc),
                "error_code": error_code,
                "error_message": (error_message or "")[:1000],
                "wave": wave,
                "agent": agent,
                "retry_count": 0,
            },
            merge=True,
        )

    await asyncio.to_thread(_w)


# ─── Cloud Tasks enqueue ─────────────────────────────────────────────────────


async def _enqueue_worker_task(session_id: str, reason: str) -> str:
    """POST a Cloud Task to the worker URL for the given session."""

    def _enqueue() -> str:
        from google.cloud import tasks_v2  # type: ignore[import-not-found]

        client = tasks_v2.CloudTasksClient()
        parent = client.queue_path(
            settings.google_cloud_project,
            settings.cloud_tasks_location,
            settings.cloud_tasks_queue,
        )
        url = settings.cloud_tasks_worker_url
        if not url:
            raise RuntimeError("cloud_tasks_worker_url not configured")
        body = (
            b'{"session_id":"' + session_id.encode() + b'","reason":"' + reason.encode() + b'"}'
        )
        task: dict[str, Any] = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": url,
                "headers": {"Content-Type": "application/json"},
                "body": body,
            }
        }
        if settings.cloud_tasks_invoker_sa:
            task["http_request"]["oidc_token"] = {
                "service_account_email": settings.cloud_tasks_invoker_sa,
                "audience": url,
            }
        resp = client.create_task(parent=parent, task=task)
        return str(resp.name)

    return await asyncio.to_thread(_enqueue)


__all__ = [
    "FailedSession",
    "ReplayResult",
    "bulk_replay",
    "list_failed",
    "prune",
    "record_failure",
    "replay",
]
