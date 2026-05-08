"""Stripe webhook event dispatcher.

Idempotent — Stripe may deliver any event multiple times. We use the event id
as a Firestore lock key.
"""
from __future__ import annotations

from typing import Any

import structlog

log = structlog.get_logger("worker.billing")


async def handle_stripe_event(event: dict[str, Any]) -> None:
    from services import billing_service, firestore_service

    event_id = event["id"]
    event_type = event["type"]

    # Idempotent processing — if already handled, skip.
    seen_check = getattr(firestore_service, "stripe_event_already_processed", None)
    if callable(seen_check):
        if await seen_check(event_id):
            log.info("stripe.duplicate_event", event_id=event_id, type=event_type)
            return

    log.info("stripe.event", event_id=event_id, type=event_type)

    handler_method = getattr(billing_service, "handle_webhook", None)
    if callable(handler_method):
        try:
            await handler_method(event)
        except Exception as e:  # noqa: BLE001
            log.exception("stripe.handler_failed", event_id=event_id, type=event_type)
            raise

    mark_seen = getattr(firestore_service, "mark_stripe_event_processed", None)
    if callable(mark_seen):
        try:
            await mark_seen(event_id, event_type)
        except Exception:  # noqa: BLE001
            log.warning("stripe.mark_seen_failed", event_id=event_id)
