"""Pipeline worker — orchestrator runner.

Called by /internal/run (Cloud Tasks delivery) and by the dev inline-dispatch
path in routes_generate.py. Single source of truth for "running a session".

Responsibilities:
    1. Read session row (must exist; 404 → log + ignore — task likely retried after delete).
    2. Mark session RUNNING.
    3. Publish kickoff SSE event.
    4. Call agents.orchestrator.run_pipeline(session_id, idea_text).
    5. Persist final session state and per-agent outputs (orchestrator does most of this
       internally; we double-check tombstone state).
    6. Publish terminal SSE event.
    7. Trigger completion notification.

Errors are caught and converted to SessionStatus.ERROR — Cloud Tasks ack the task
either way (retries are useful only for transient infra errors which we re-raise).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog

from config import settings
from logging_setup import hash_idea
from models.session_models import SessionStatus

log = structlog.get_logger("worker.pipeline")


async def run_pipeline_for_task(*, session_id: str, idea_text: str) -> None:
    """Run the full pipeline for one session id."""
    from agents.orchestrator import run_pipeline
    from services import (
        analytics_service,
        cost_service,
        firestore_service,
        notification_service,
        sse_service,
    )

    log.info("worker.start", session_id=session_id, idea_hash=hash_idea(idea_text))

    session = await firestore_service.read_session(session_id)
    if session is None:
        log.warning("worker.missing_session", session_id=session_id)
        return

    if session.status in {
        SessionStatus.COMPLETED,
        SessionStatus.CANCELED,
        SessionStatus.SAFETY_BLOCKED,
        SessionStatus.BUDGET_EXCEEDED,
    }:
        log.info("worker.already_terminal", session_id=session_id, status=session.status.value)
        return

    await firestore_service.update_session_status(session_id, SessionStatus.RUNNING)
    await sse_service.publish(
        session_id,
        {"event": "session.started", "data": {"session_id": session_id, "status": "running"}},
    )

    try:
        result_session = await asyncio.wait_for(
            run_pipeline(session_id=session_id, idea_text=idea_text),
            timeout=settings.pipeline_timeout_seconds,
        )
        final_status = result_session.status
    except asyncio.TimeoutError:
        log.error("worker.timeout", session_id=session_id, timeout=settings.pipeline_timeout_seconds)
        final_status = SessionStatus.ERROR
        await firestore_service.update_session_status(
            session_id, SessionStatus.ERROR, error_code="PIPELINE_TIMEOUT",
            error_message=f"pipeline timed out after {settings.pipeline_timeout_seconds}s",
        )
    except Exception as e:  # noqa: BLE001
        log.exception("worker.error", session_id=session_id)
        final_status = SessionStatus.ERROR
        await firestore_service.update_session_status(
            session_id, SessionStatus.ERROR, error_code="PIPELINE_FAILURE", error_message=str(e),
        )

    # Final cost stamp.
    try:
        cost = await cost_service.get_session_cost(session_id)
        await firestore_service.update_session_status(
            session_id,
            final_status,
            completed_at=datetime.now(tz=timezone.utc),
            extra={"cost.total_cost_usd": cost} if cost else None,
        )
    except Exception:  # noqa: BLE001
        log.warning("worker.cost_stamp_failed", session_id=session_id)

    await sse_service.publish(
        session_id,
        {
            "event": "terminal",
            "data": {"session_id": session_id, "status": final_status.value},
        },
    )

    # Non-blocking notification + analytics.
    try:
        s = await firestore_service.read_session(session_id)
        if s is not None and s.user_uid:
            email_to_use = None
            user_fetch = getattr(firestore_service, "get_user", None)
            if callable(user_fetch):
                user = await user_fetch(s.user_uid)
                email_to_use = user.email if user else None
            if email_to_use:
                await notification_service.send_completion_email(
                    to=email_to_use,
                    session_id=session_id,
                    company_name=s.company_name,
                    status=final_status.value,
                )
            await analytics_service.track(
                event="generate_completed",
                uid=s.user_uid,
                properties={
                    "session_id": session_id,
                    "status": final_status.value,
                    "cost_usd": s.cost.total_cost_usd,
                },
            )
    except Exception as e:  # noqa: BLE001
        log.warning("worker.post_complete_hook_failed", err=str(e))

    log.info("worker.finish", session_id=session_id, status=final_status.value)
