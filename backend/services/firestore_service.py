"""Async Firestore wrappers.

Backed by ``firebase_admin.firestore``. Every blocking call is wrapped with
``asyncio.to_thread``. We never log ``idea_text`` here — only ``idea_text_hash``.

Collections:
  - ``users/{uid}``                                   → User
  - ``sessions/{session_id}``                         → Session (TTL 30d)
  - ``sessions/{session_id}/agent_outputs/{agent}``  → raw agent payloads
  - ``sessions/{session_id}/events/{event_id}``      → SSE replication
  - ``companies/{company_id}``                        → finalized companies
  - ``usage/{uid}_{period}``                          → daily/monthly counters
  - ``costs/{session_id}``                            → CostTelemetry doc
  - ``idempotency/{uid}_{idem_key}``                  → session_id mapping
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from pydantic import BaseModel

from config import settings
from models.session_models import (
    AgentName,
    AgentRecord,
    AgentStatusValue,
    CostTelemetry,
    Session,
    SessionStatus,
)
from models.user_models import User

log = structlog.get_logger(__name__)

_TTL_DAYS = 30


# ─── Firestore client (lazy, single instance) ────────────────────────────────


_db: Any | None = None


def _get_db() -> Any:
    global _db
    if _db is not None:
        return _db
    import firebase_admin  # type: ignore[import-not-found]
    from firebase_admin import firestore  # type: ignore[import-not-found]

    if not firebase_admin._apps:
        try:
            # Workload Identity / ADC
            firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})
        except Exception as e:  # noqa: BLE001
            log.warning("firestore.init_default_failed", err=str(e))
            firebase_admin.initialize_app()

    _db = firestore.client(database_id=settings.firestore_database)
    return _db


def _to_jsonable(obj: Any) -> Any:
    """Convert pydantic / datetime / enum into Firestore-safe values."""
    if isinstance(obj, BaseModel):
        return _to_jsonable(obj.model_dump(mode="json"))
    if isinstance(obj, dict):
        return {str(k): _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_jsonable(x) for x in obj]
    return obj


def _expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=_TTL_DAYS)


# ─── Users ───────────────────────────────────────────────────────────────────


async def get_user(uid: str) -> User | None:
    def _read() -> dict[str, Any] | None:
        db = _get_db()
        snap = db.collection("users").document(uid).get()
        if not snap.exists:
            return None
        return snap.to_dict()

    data = await asyncio.to_thread(_read)
    if data is None:
        return None
    try:
        return User.model_validate(data)
    except Exception as e:  # noqa: BLE001
        log.warning("firestore.user.invalid_record", uid=uid, err=str(e))
        return None


async def upsert_user(user: User) -> None:
    def _write() -> None:
        db = _get_db()
        db.collection("users").document(user.uid).set(_to_jsonable(user), merge=True)

    await asyncio.to_thread(_write)
    log.info("firestore.user.upsert", uid=user.uid)


# ─── Sessions ────────────────────────────────────────────────────────────────


async def create_session(s: Session) -> None:
    def _write() -> None:
        db = _get_db()
        payload = _to_jsonable(s)
        payload["expires_at"] = _expires_at()  # for Firestore TTL policy
        db.collection("sessions").document(s.session_id).set(payload)
        # Idempotency map
        idem_key = f"{s.user_uid}_{s.idempotency_key}"
        db.collection("idempotency").document(idem_key).set(
            {
                "session_id": s.session_id,
                "user_uid": s.user_uid,
                "created_at": datetime.now(timezone.utc),
                "expires_at": _expires_at(),
            }
        )

    await asyncio.to_thread(_write)
    log.info(
        "firestore.session.create",
        session_id=s.session_id,
        uid=s.user_uid,
        idea_hash=s.idea_text_hash,
    )


async def update_session_status(sid: str, status: SessionStatus) -> None:
    def _write() -> None:
        db = _get_db()
        db.collection("sessions").document(sid).update(
            {
                "status": status.value,
                "updated_at": datetime.now(timezone.utc),
                **(
                    {"completed_at": datetime.now(timezone.utc)}
                    if status
                    in (
                        SessionStatus.COMPLETED,
                        SessionStatus.PARTIAL,
                        SessionStatus.ERROR,
                        SessionStatus.SAFETY_BLOCKED,
                        SessionStatus.BUDGET_EXCEEDED,
                    )
                    else {}
                ),
                **(
                    {"started_at": datetime.now(timezone.utc)}
                    if status == SessionStatus.RUNNING
                    else {}
                ),
            }
        )

    await asyncio.to_thread(_write)
    log.info("firestore.session.status", sid=sid, status=status.value)


async def update_agent_status(
    sid: str,
    agent: AgentName,
    status: AgentStatusValue,
    extras: dict[str, Any] | None = None,
) -> None:
    def _write() -> None:
        db = _get_db()
        update: dict[str, Any] = {
            f"agents.{agent.value}.status": status.value,
            f"agents.{agent.value}.updated_at": datetime.now(timezone.utc),
        }
        if status == AgentStatusValue.RUNNING:
            update[f"agents.{agent.value}.started_at"] = datetime.now(timezone.utc)
        if status in (
            AgentStatusValue.COMPLETED,
            AgentStatusValue.ERROR,
            AgentStatusValue.GATE_REJECTED,
            AgentStatusValue.SAFETY_BLOCKED,
        ):
            update[f"agents.{agent.value}.completed_at"] = datetime.now(timezone.utc)
        if extras:
            for k, v in extras.items():
                update[f"agents.{agent.value}.{k}"] = _to_jsonable(v)
        db.collection("sessions").document(sid).update(update)

    await asyncio.to_thread(_write)


async def write_agent_output(sid: str, agent: AgentName, payload: Any) -> str:
    """Write the full JSON output to ``sessions/{sid}/agent_outputs/{agent}``.
    Returns the doc id."""

    def _write() -> str:
        db = _get_db()
        ref = (
            db.collection("sessions")
            .document(sid)
            .collection("agent_outputs")
            .document(agent.value)
        )
        ref.set(
            {
                "agent": agent.value,
                "payload": _to_jsonable(payload),
                "written_at": datetime.now(timezone.utc),
                "expires_at": _expires_at(),
            }
        )
        return agent.value

    doc_id = await asyncio.to_thread(_write)
    log.info("firestore.agent_output.write", sid=sid, agent=agent.value)
    return doc_id


async def read_session(sid: str) -> Session | None:
    def _read() -> dict[str, Any] | None:
        db = _get_db()
        snap = db.collection("sessions").document(sid).get()
        if not snap.exists:
            return None
        return snap.to_dict()

    data = await asyncio.to_thread(_read)
    if data is None:
        return None
    # strip Firestore-only fields
    data.pop("expires_at", None)
    data.pop("updated_at", None)
    try:
        # Coerce agents map to typed records
        agents_raw = data.get("agents") or {}
        coerced: dict[str, Any] = {}
        for k, v in agents_raw.items():
            try:
                coerced[k] = AgentRecord.model_validate(v).model_dump(mode="json")
            except Exception:
                coerced[k] = v
        data["agents"] = coerced
        return Session.model_validate(data)
    except Exception as e:  # noqa: BLE001
        log.warning("firestore.session.invalid_record", sid=sid, err=str(e))
        return None


async def read_agent_output(sid: str, agent: AgentName) -> dict[str, Any] | None:
    def _read() -> dict[str, Any] | None:
        db = _get_db()
        snap = (
            db.collection("sessions")
            .document(sid)
            .collection("agent_outputs")
            .document(agent.value)
            .get()
        )
        if not snap.exists:
            return None
        return snap.to_dict()

    return await asyncio.to_thread(_read)


async def find_existing_session_by_idempotency_key(uid: str, key: str) -> str | None:
    """Lookup ``idempotency/{uid}_{key}`` and return session_id, or None."""

    def _read() -> str | None:
        db = _get_db()
        snap = db.collection("idempotency").document(f"{uid}_{key}").get()
        if not snap.exists:
            return None
        d = snap.to_dict() or {}
        return d.get("session_id")

    return await asyncio.to_thread(_read)


async def cancel_session(sid: str) -> None:
    def _write() -> None:
        db = _get_db()
        db.collection("sessions").document(sid).update(
            {
                "status": SessionStatus.CANCELED.value,
                "canceled_at": datetime.now(timezone.utc),
            }
        )

    await asyncio.to_thread(_write)
    log.info("firestore.session.cancel", sid=sid)


async def get_user_companies(uid: str) -> list[dict[str, Any]]:
    def _read() -> list[dict[str, Any]]:
        db = _get_db()
        q = db.collection("companies").where("owner_uid", "==", uid).limit(200)
        return [doc.to_dict() | {"id": doc.id} for doc in q.stream()]

    return await asyncio.to_thread(_read)


async def get_session_branches(parent_id: str) -> list[dict[str, Any]]:
    def _read() -> list[dict[str, Any]]:
        db = _get_db()
        q = (
            db.collection("sessions")
            .where("parent_session_id", "==", parent_id)
            .limit(50)
        )
        return [doc.to_dict() | {"id": doc.id} for doc in q.stream()]

    return await asyncio.to_thread(_read)


async def record_usage(uid: str, period: str, tokens: int, cost: float) -> None:
    """Atomically increment usage counters for a (uid, period)."""

    def _write() -> None:
        from google.cloud import firestore as gcfs  # type: ignore[import-not-found]

        db = _get_db()
        ref = db.collection("usage").document(f"{uid}_{period}")
        ref.set(
            {
                "uid": uid,
                "period": period,
                "tokens": gcfs.Increment(tokens),
                "cost_usd": gcfs.Increment(cost),
                "generations": gcfs.Increment(1),
                "updated_at": datetime.now(timezone.utc),
            },
            merge=True,
        )

    await asyncio.to_thread(_write)


async def write_cost_telemetry(sid: str, telemetry: CostTelemetry) -> None:
    def _write() -> None:
        db = _get_db()
        db.collection("costs").document(sid).set(_to_jsonable(telemetry), merge=True)

    await asyncio.to_thread(_write)


async def tombstone_session(sid: str) -> None:
    """GDPR / right-to-be-forgotten: replace idea_text with empty string,
    drop agent outputs, keep skeletal record for audit."""

    def _write() -> None:
        db = _get_db()
        sess_ref = db.collection("sessions").document(sid)
        # Delete agent outputs subcollection
        outs = sess_ref.collection("agent_outputs").stream()
        for snap in outs:
            snap.reference.delete()
        events = sess_ref.collection("events").stream()
        for snap in events:
            snap.reference.delete()
        sess_ref.update(
            {
                "idea_text": "",
                "tombstoned": True,
                "tombstoned_at": datetime.now(timezone.utc),
                "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
            }
        )

    await asyncio.to_thread(_write)
    log.info("firestore.session.tombstone", sid=sid)


__all__ = [
    "cancel_session",
    "create_session",
    "find_existing_session_by_idempotency_key",
    "get_session_branches",
    "get_user",
    "get_user_companies",
    "read_agent_output",
    "read_session",
    "record_usage",
    "tombstone_session",
    "update_agent_status",
    "update_session_status",
    "upsert_user",
    "write_agent_output",
    "write_cost_telemetry",
]
