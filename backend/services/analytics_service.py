"""Server-side PostHog analytics client.

Thin async wrapper around the synchronous ``posthog`` SDK. All calls are
deferred to a thread so they never block the event loop. If PostHog is not
configured (or the library is unavailable), every method becomes a no-op
that emits a structured log line — never raises.

Public surface
--------------
- ``track(event, properties, distinct_id, groups=None)``
- ``identify(distinct_id, properties)``
- ``capture_feature_flag(flag, distinct_id, properties=None)``
- ``set_group(group_type, group_key, properties=None)``
- ``shutdown()``  -- best-effort flush, used in pytest teardown.

The signatures intentionally accept BOTH ``uid=...`` and
``distinct_id=...`` because routes in this codebase pass either form.
"""
from __future__ import annotations

import asyncio
from typing import Any

import structlog

from config import settings

log = structlog.get_logger(__name__)


# ─── Lazy client init ────────────────────────────────────────────────────────


_client: Any | None = None
_client_lock = asyncio.Lock()
_disabled: bool = False


def _is_configured() -> bool:
    return bool(settings.posthog_key)


async def _get_client() -> Any | None:
    """Return a configured Posthog client instance or ``None`` if disabled."""
    global _client, _disabled

    if _disabled:
        return None
    if _client is not None:
        return _client
    if not _is_configured():
        log.info("analytics.disabled", reason="no_posthog_key")
        _disabled = True
        return None

    async with _client_lock:
        if _client is not None:
            return _client
        try:
            from posthog import Posthog  # type: ignore[import-not-found]
        except Exception as exc:  # noqa: BLE001
            log.warning("analytics.posthog_import_failed", err=str(exc))
            _disabled = True
            return None

        try:
            _client = Posthog(
                project_api_key=settings.posthog_key,
                host=settings.posthog_host,
                enable_exception_autocapture=False,
                debug=False,
                # Reasonable defaults: small batch + short flush so dev sees data fast,
                # prod throughput still fine.
                max_queue_size=1000,
                flush_at=20,
                flush_interval=2.0,
            )
            return _client
        except Exception as exc:  # noqa: BLE001
            log.warning("analytics.posthog_init_failed", err=str(exc))
            _disabled = True
            return None


# ─── Helpers ────────────────────────────────────────────────────────────────


def _resolve_distinct_id(
    distinct_id: str | None = None,
    uid: str | None = None,
) -> str:
    """Both ``distinct_id`` and ``uid`` are accepted by callers — normalize.

    Falls back to ``"anonymous"`` rather than raising; PostHog rejects empty
    distinct_id and we'd rather log + drop the event.
    """
    return distinct_id or uid or "anonymous"


def _normalize_props(props: dict[str, Any] | None) -> dict[str, Any]:
    if not props:
        return {}
    cleaned: dict[str, Any] = {}
    for k, v in props.items():
        if v is None:
            continue
        # Stringify enums for downstream tooling; PostHog accepts JSON-serializable.
        if hasattr(v, "value") and not isinstance(v, (bytes, bytearray)):
            cleaned[k] = getattr(v, "value", v)
        else:
            cleaned[k] = v
    return cleaned


# ─── Public API ──────────────────────────────────────────────────────────────


async def track(
    event: str,
    properties: dict[str, Any] | None = None,
    distinct_id: str | None = None,
    *,
    uid: str | None = None,
    groups: dict[str, str] | None = None,
    props: dict[str, Any] | None = None,
) -> None:
    """Capture an event."""
    client = await _get_client()
    did = _resolve_distinct_id(distinct_id, uid)
    payload = _normalize_props(properties or props)
    if client is None:
        log.info("analytics.track.noop", event=event, distinct_id=did)
        return

    def _capture() -> None:
        try:
            client.capture(
                distinct_id=did,
                event=event,
                properties=payload,
                groups=groups or {},
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("analytics.track_failed", event=event, err=str(exc))

    try:
        await asyncio.to_thread(_capture)
    except Exception as exc:  # noqa: BLE001
        log.warning("analytics.track_thread_failed", event=event, err=str(exc))


async def identify(
    distinct_id: str | None = None,
    properties: dict[str, Any] | None = None,
    *,
    uid: str | None = None,
    props: dict[str, Any] | None = None,
) -> None:
    client = await _get_client()
    did = _resolve_distinct_id(distinct_id, uid)
    payload = _normalize_props(properties or props)
    if client is None:
        log.info("analytics.identify.noop", distinct_id=did)
        return

    def _identify() -> None:
        try:
            client.identify(distinct_id=did, properties=payload)
        except Exception as exc:  # noqa: BLE001
            log.warning("analytics.identify_failed", err=str(exc))

    try:
        await asyncio.to_thread(_identify)
    except Exception as exc:  # noqa: BLE001
        log.warning("analytics.identify_thread_failed", err=str(exc))


async def capture_feature_flag(
    flag: str,
    distinct_id: str | None = None,
    properties: dict[str, Any] | None = None,
    *,
    uid: str | None = None,
) -> bool | str | None:
    """Returns the flag's variant for ``distinct_id`` or ``None``.

    Also fires a ``$feature_flag_called`` event for PostHog's funnels.
    """
    client = await _get_client()
    did = _resolve_distinct_id(distinct_id, uid)
    if client is None:
        return None

    def _check() -> bool | str | None:
        try:
            value = client.get_feature_flag(
                key=flag,
                distinct_id=did,
                person_properties=_normalize_props(properties),
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("analytics.feature_flag_failed", flag=flag, err=str(exc))
            return None

        try:
            client.capture(
                distinct_id=did,
                event="$feature_flag_called",
                properties={"$feature_flag": flag, "$feature_flag_response": value},
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("analytics.flag_capture_failed", flag=flag, err=str(exc))
        return value

    try:
        return await asyncio.to_thread(_check)
    except Exception as exc:  # noqa: BLE001
        log.warning("analytics.flag_thread_failed", flag=flag, err=str(exc))
        return None


async def set_group(
    group_type: str,
    group_key: str,
    properties: dict[str, Any] | None = None,
) -> None:
    client = await _get_client()
    if client is None:
        return

    def _set() -> None:
        try:
            client.group_identify(
                group_type=group_type,
                group_key=group_key,
                properties=_normalize_props(properties),
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("analytics.group_identify_failed", err=str(exc))

    try:
        await asyncio.to_thread(_set)
    except Exception as exc:  # noqa: BLE001
        log.warning("analytics.group_thread_failed", err=str(exc))


async def shutdown() -> None:
    """Best-effort flush (used in tests / shutdown lifecycle)."""
    global _client, _disabled
    if _client is None:
        return
    client = _client

    def _flush() -> None:
        try:
            client.flush()
            client.shutdown()
        except Exception:  # noqa: BLE001
            pass

    try:
        await asyncio.to_thread(_flush)
    finally:
        _client = None
        _disabled = False


__all__ = [
    "capture_feature_flag",
    "identify",
    "set_group",
    "shutdown",
    "track",
]
