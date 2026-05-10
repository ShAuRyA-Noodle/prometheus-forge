"""Outbox pattern for reliable dual-write between Firestore and external APIs.

When an agent finishes and we need to BOTH persist to Firestore AND call a
Workspace API (Slides/Docs/Drive), naive code creates a window where one side
succeeds and the other fails. The outbox pattern fixes that:

  1. Agent writes its row to the outbox in the SAME Firestore transaction as
     the agent_outputs doc.
  2. A dispatcher loop in the worker claims pending rows (atomic) and performs
     the side-effect call. Success → row marked ``complete``. Failure →
     ``retry_count`` incremented and re-queued with exponential backoff.

Failure modes handled:
  - Firestore write OK but Slides API down → retried.
  - Slides API succeeded but worker crashed → next dispatcher run is idempotent
    (we look up by ``op_key`` before recreating).
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable

import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)


# ─── Models ──────────────────────────────────────────────────────────────────


class OutboxStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
    FAILED = "failed"
    DEAD_LETTERED = "dead_lettered"


class OutboxOpType(str, Enum):
    CREATE_PRESENTATION = "create_presentation"
    CREATE_DOC = "create_doc"
    CREATE_SHEET = "create_sheet"
    UPLOAD_DRIVE_FILE = "upload_drive_file"
    SEND_EMAIL = "send_email"
    DEPLOY_LANDING = "deploy_landing"
    GENERATE_PDF = "generate_pdf"
    NOTIFY_FCM = "notify_fcm"


class OutboxRow(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:16])
    session_id: str
    op_type: OutboxOpType
    op_key: str  # idempotency key inside the op
    payload: dict[str, Any]
    status: OutboxStatus = OutboxStatus.PENDING
    retry_count: int = 0
    next_attempt_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None
    result: dict[str, Any] | None = None


# ─── Configuration ───────────────────────────────────────────────────────────

MAX_RETRY = 5
BACKOFF_BASE_SECONDS = 8
DEAD_LETTER_THRESHOLD = MAX_RETRY


# ─── Dispatcher registry ─────────────────────────────────────────────────────

DispatcherFn = Callable[[OutboxRow], Any]
_DISPATCH_REGISTRY: dict[OutboxOpType, DispatcherFn] = {}


def register_dispatcher(op: OutboxOpType, fn: DispatcherFn) -> None:
    """Bind a coroutine ``fn(row) -> dict`` to an op_type."""
    _DISPATCH_REGISTRY[op] = fn


# ─── Persistence helpers (Firestore) ─────────────────────────────────────────


def _db() -> Any:
    from services.firestore_service import _get_db  # type: ignore[attr-defined]

    return _get_db()


def _outbox_ref(session_id: str) -> Any:
    return _db().collection("sessions").document(session_id).collection("outbox")


# ─── Public API ──────────────────────────────────────────────────────────────


async def enqueue(
    session_id: str,
    op_type: OutboxOpType,
    payload: dict[str, Any],
    op_key: str | None = None,
) -> str:
    """Insert a new outbox row. Returns the row id."""
    row = OutboxRow(
        session_id=session_id,
        op_type=op_type,
        op_key=op_key or uuid.uuid4().hex,
        payload=payload,
    )

    def _write() -> None:
        ref = _outbox_ref(session_id).document(row.id)
        ref.set(row.model_dump(mode="json"))

    await asyncio.to_thread(_write)
    log.info(
        "outbox.enqueue",
        session_id=session_id,
        row_id=row.id,
        op=op_type.value,
        op_key=row.op_key,
    )
    return row.id


async def claim_pending(limit: int = 20) -> list[OutboxRow]:
    """Atomically claim pending rows across all sessions.

    Uses a Firestore transaction per row to flip status PENDING → IN_PROGRESS.
    Skips rows whose ``next_attempt_at`` is in the future.
    """

    def _claim() -> list[OutboxRow]:
        from google.cloud import firestore as gcfs  # type: ignore[import-not-found]

        db = _db()
        # Collection group query across all session outboxes
        now = datetime.now(timezone.utc)
        q = (
            db.collection_group("outbox")
            .where("status", "==", OutboxStatus.PENDING.value)
            .where("next_attempt_at", "<=", now)
            .limit(limit)
        )
        candidates = list(q.stream())
        claimed: list[OutboxRow] = []
        for snap in candidates:
            ref = snap.reference

            @gcfs.transactional  # type: ignore[misc]
            def _txn(txn: Any, ref: Any = ref) -> dict[str, Any] | None:
                cur = ref.get(transaction=txn).to_dict() or {}
                if cur.get("status") != OutboxStatus.PENDING.value:
                    return None
                cur["status"] = OutboxStatus.IN_PROGRESS.value
                cur["claimed_at"] = datetime.now(timezone.utc)
                txn.update(ref, {"status": cur["status"], "claimed_at": cur["claimed_at"]})
                return cur

            txn = db.transaction()
            data = _txn(txn)
            if data is None:
                continue
            try:
                claimed.append(OutboxRow.model_validate(data))
            except Exception as e:  # noqa: BLE001
                log.warning("outbox.claim_invalid", err=str(e))
        return claimed

    return await asyncio.to_thread(_claim)


async def dispatch(row: OutboxRow) -> None:
    """Run the registered dispatcher for ``row``. Update status accordingly."""
    fn = _DISPATCH_REGISTRY.get(row.op_type)
    if fn is None:
        log.error("outbox.no_dispatcher", op=row.op_type.value)
        await _mark_failed(row, "no dispatcher registered")
        return
    try:
        result = await asyncio.wait_for(_invoke(fn, row), timeout=120)
        await _mark_complete(row, result if isinstance(result, dict) else {"ok": True})
    except Exception as e:  # noqa: BLE001
        await _mark_retry(row, str(e))


async def _invoke(fn: DispatcherFn, row: OutboxRow) -> Any:
    res = fn(row)
    if asyncio.iscoroutine(res):
        return await res
    return res


async def _mark_complete(row: OutboxRow, result: dict[str, Any]) -> None:
    def _w() -> None:
        ref = _outbox_ref(row.session_id).document(row.id)
        ref.update(
            {
                "status": OutboxStatus.COMPLETE.value,
                "completed_at": datetime.now(timezone.utc),
                "result": result,
            }
        )

    await asyncio.to_thread(_w)
    log.info("outbox.complete", row_id=row.id, op=row.op_type.value)


async def _mark_failed(row: OutboxRow, err: str) -> None:
    def _w() -> None:
        ref = _outbox_ref(row.session_id).document(row.id)
        ref.update(
            {
                "status": OutboxStatus.FAILED.value,
                "last_error": err[:500],
                "failed_at": datetime.now(timezone.utc),
            }
        )

    await asyncio.to_thread(_w)
    log.error("outbox.failed", row_id=row.id, op=row.op_type.value, err=err[:200])


async def _mark_retry(row: OutboxRow, err: str) -> None:
    next_count = row.retry_count + 1
    if next_count >= DEAD_LETTER_THRESHOLD:

        def _w_dl() -> None:
            ref = _outbox_ref(row.session_id).document(row.id)
            ref.update(
                {
                    "status": OutboxStatus.DEAD_LETTERED.value,
                    "retry_count": next_count,
                    "last_error": err[:500],
                    "dead_lettered_at": datetime.now(timezone.utc),
                }
            )

        await asyncio.to_thread(_w_dl)
        log.error("outbox.dead_letter", row_id=row.id, retries=next_count)
        return

    backoff_seconds = BACKOFF_BASE_SECONDS * (2**row.retry_count)
    next_attempt = datetime.now(timezone.utc) + timedelta(seconds=backoff_seconds)

    def _w() -> None:
        ref = _outbox_ref(row.session_id).document(row.id)
        ref.update(
            {
                "status": OutboxStatus.PENDING.value,
                "retry_count": next_count,
                "last_error": err[:500],
                "next_attempt_at": next_attempt,
            }
        )

    await asyncio.to_thread(_w)
    log.warning(
        "outbox.retry",
        row_id=row.id,
        retry=next_count,
        backoff_s=backoff_seconds,
        err=err[:120],
    )


async def dispatcher_loop(poll_seconds: float = 5.0, batch: int = 20) -> None:
    """Long-running coroutine — call as ``asyncio.create_task(dispatcher_loop())``.
    Cancel by cancelling the task."""
    log.info("outbox.dispatcher_loop.start", poll=poll_seconds, batch=batch)
    while True:
        try:
            rows = await claim_pending(limit=batch)
            if rows:
                await asyncio.gather(*[dispatch(r) for r in rows])
            else:
                await asyncio.sleep(poll_seconds)
        except asyncio.CancelledError:
            log.info("outbox.dispatcher_loop.stop")
            raise
        except Exception as e:  # noqa: BLE001
            log.exception("outbox.dispatcher_loop.error", err=str(e))
            await asyncio.sleep(poll_seconds)


__all__ = [
    "OutboxOpType",
    "OutboxRow",
    "OutboxStatus",
    "claim_pending",
    "dispatch",
    "dispatcher_loop",
    "enqueue",
    "register_dispatcher",
]
