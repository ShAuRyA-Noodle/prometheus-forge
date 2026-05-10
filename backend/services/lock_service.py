"""Distributed lock for session concurrency control.

Implementation: Firestore transactional create-if-not-exists with TTL.
Goal: prevent two workers from running the same ``session_id`` if Cloud Tasks
delivers a duplicate.

Locks live in ``locks/{key}`` with ``{token, expires_at, owner}``. ``acquire``
returns a fresh token if (a) no doc exists, (b) the existing doc is expired.
"""
from __future__ import annotations

import asyncio
import secrets
import socket
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator

import structlog

log = structlog.get_logger(__name__)


# ─── Internals ───────────────────────────────────────────────────────────────


def _db() -> Any:
    from services.firestore_service import _get_db  # type: ignore[attr-defined]

    return _get_db()


def _hostname() -> str:
    try:
        return socket.gethostname()
    except Exception:  # noqa: BLE001
        return "worker"


# ─── API ─────────────────────────────────────────────────────────────────────


async def acquire(key: str, ttl_seconds: int = 300, owner: str | None = None) -> str | None:
    """Atomically acquire ``locks/{key}``. Returns a token on success, ``None`` if held."""
    token = secrets.token_urlsafe(16)
    owner = owner or _hostname()

    def _txn() -> str | None:
        from google.cloud import firestore as gcfs  # type: ignore[import-not-found]

        db = _db()
        ref = db.collection("locks").document(key)
        now = datetime.now(timezone.utc)
        expires = now + timedelta(seconds=ttl_seconds)

        @gcfs.transactional  # type: ignore[misc]
        def _go(txn: Any) -> str | None:
            snap = ref.get(transaction=txn)
            if snap.exists:
                d = snap.to_dict() or {}
                exp = d.get("expires_at")
                # If expired, steal it
                if exp is None or (
                    isinstance(exp, datetime) and exp < now
                ):
                    txn.set(ref, {"token": token, "owner": owner, "expires_at": expires, "acquired_at": now})
                    return token
                return None
            txn.set(ref, {"token": token, "owner": owner, "expires_at": expires, "acquired_at": now})
            return token

        return _go(db.transaction())

    res = await asyncio.to_thread(_txn)
    if res is None:
        log.info("lock.busy", key=key)
    else:
        log.info("lock.acquired", key=key, owner=owner, ttl=ttl_seconds)
    return res


async def release(key: str, token: str) -> bool:
    """Release ``locks/{key}`` only if our token matches. Returns True on success."""

    def _txn() -> bool:
        from google.cloud import firestore as gcfs  # type: ignore[import-not-found]

        db = _db()
        ref = db.collection("locks").document(key)

        @gcfs.transactional  # type: ignore[misc]
        def _go(txn: Any) -> bool:
            snap = ref.get(transaction=txn)
            if not snap.exists:
                return False
            d = snap.to_dict() or {}
            if d.get("token") != token:
                return False
            txn.delete(ref)
            return True

        return _go(db.transaction())

    res = await asyncio.to_thread(_txn)
    if res:
        log.info("lock.released", key=key)
    else:
        log.warning("lock.release_token_mismatch", key=key)
    return res


async def renew(key: str, token: str, ttl_seconds: int = 300) -> bool:
    """Extend the TTL of an active lock. Useful for long-running sessions."""

    def _txn() -> bool:
        from google.cloud import firestore as gcfs  # type: ignore[import-not-found]

        db = _db()
        ref = db.collection("locks").document(key)

        @gcfs.transactional  # type: ignore[misc]
        def _go(txn: Any) -> bool:
            snap = ref.get(transaction=txn)
            if not snap.exists:
                return False
            d = snap.to_dict() or {}
            if d.get("token") != token:
                return False
            txn.update(
                ref,
                {"expires_at": datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)},
            )
            return True

        return _go(db.transaction())

    return await asyncio.to_thread(_txn)


@asynccontextmanager
async def with_lock(key: str, ttl_seconds: int = 300, owner: str | None = None) -> AsyncIterator[str]:
    """Async context manager; raises ``RuntimeError`` if lock cannot be acquired."""
    token = await acquire(key, ttl_seconds=ttl_seconds, owner=owner)
    if token is None:
        raise RuntimeError(f"lock_busy:{key}")
    try:
        yield token
    finally:
        try:
            await release(key, token)
        except Exception as e:  # noqa: BLE001
            log.warning("lock.release_failed", key=key, err=str(e))


__all__ = ["acquire", "release", "renew", "with_lock"]
