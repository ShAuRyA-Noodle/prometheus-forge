"""POST /api/generate — kick off a pipeline run."""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from google.api_core.exceptions import GoogleAPICallError
from google.cloud import tasks_v2

from config import settings
from logging_setup import hash_idea
from models import GenerateRequest, GenerateResponse
from models.session_models import (
    AgentName,
    AgentRecord,
    Session,
    SessionStatus,
    Wave,
)

from ._dependencies import get_current_user, get_request_id

router = APIRouter(tags=["generate"])
log = structlog.get_logger("api.generate")


_WAVE_OF_AGENT: dict[AgentName, Wave] = {
    AgentName.IDEA_PARSER: Wave.PRE,
    AgentName.ARTICULATION: Wave.PRE,
    AgentName.MARKET_RESEARCH: Wave.WAVE_1,
    AgentName.COMPETITIVE_ANALYSIS: Wave.WAVE_1,
    AgentName.BUSINESS_MODEL: Wave.WAVE_1,
    AgentName.BRAND_IDENTITY: Wave.WAVE_1,
    AgentName.RISK_ANALYSIS: Wave.WAVE_1,
    AgentName.TECH_ARCHITECTURE: Wave.WAVE_1,
    AgentName.FINANCIAL_MODEL: Wave.WAVE_2,
    AgentName.LANDING_PAGE: Wave.WAVE_2,
    AgentName.LEGAL_DOCUMENTS: Wave.WAVE_2,
    AgentName.GO_TO_MARKET: Wave.WAVE_2,
    AgentName.PITCH_DECK: Wave.WAVE_3,
    AgentName.EXECUTIVE_SUMMARY: Wave.WAVE_3,
}


def _new_session_id() -> str:
    return f"sess_{secrets.token_urlsafe(16)}"


def _initial_agents() -> dict[AgentName, AgentRecord]:
    return {
        name: AgentRecord(name=name, wave=wave)
        for name, wave in _WAVE_OF_AGENT.items()
    }


@router.post(
    "/generate",
    response_model=GenerateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Kick off a multi-agent pipeline for a startup idea.",
)
async def generate(
    payload: GenerateRequest,
    request: Request,
    user=Depends(get_current_user),
    request_id: str = Depends(get_request_id),
) -> GenerateResponse:
    from services import analytics_service, firestore_service, moderation_service

    idempotency_key = getattr(request.state, "idempotency_key", None)
    if not idempotency_key:
        # IdempotencyMiddleware should have either replayed or set this.
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_IDEMPOTENCY_KEY", "message": "internal: idempotency key missing"},
        )

    idea_hash = hash_idea(payload.idea_text)
    log.info(
        "generate.received",
        request_id=request_id,
        uid=user.uid,
        idea_hash=idea_hash,
        mode=payload.mode,
        has_branch_parent=bool(payload.branch_from_session_id),
    )

    # Vertex AI Safety pre-filter on idea_text (CSAM, weapons, IP, fraud).
    moderation = await moderation_service.pre_filter_input(payload.idea_text)
    if not moderation.allowed:
        log.warning(
            "generate.safety_blocked",
            request_id=request_id,
            uid=user.uid,
            idea_hash=idea_hash,
            categories=moderation.categories,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "SAFETY_BLOCKED",
                "message": "idea content was blocked by safety filters",
                "categories": list(moderation.categories),
                "request_id": request_id,
            },
        )

    now = datetime.now(tz=timezone.utc)
    session_id = _new_session_id()

    session = Session(
        session_id=session_id,
        user_uid=user.uid,
        idempotency_key=idempotency_key,
        idea_text_hash=idea_hash,
        idea_text=payload.idea_text,
        status=SessionStatus.QUEUED,
        created_at=now,
        agents=_initial_agents(),
        parent_session_id=payload.branch_from_session_id,
        metadata={
            "locale": payload.locale,
            "region": payload.region,
            "mode": payload.mode,
            "target_jurisdictions": payload.target_jurisdictions,
            "branch_steering": payload.branch_steering,
            "request_id": request_id,
        },
    )

    await firestore_service.create_session(session)

    await _enqueue_pipeline_task(
        session_id=session_id,
        idea_text=payload.idea_text,
        request_id=request_id,
    )

    try:
        await analytics_service.track(
            event="generate_started",
            uid=user.uid,
            properties={
                "session_id": session_id,
                "mode": payload.mode,
                "tier": user.tier,
                "is_anonymous": user.is_anonymous,
            },
        )
    except Exception as e:  # noqa: BLE001
        log.warning("analytics.track_failed", err=str(e))

    return GenerateResponse(
        session_id=session_id,
        status=SessionStatus.QUEUED,
        sse_url=f"/sse/sessions/{session_id}",
        estimated_completion_seconds=120,
    )


async def _enqueue_pipeline_task(*, session_id: str, idea_text: str, request_id: str) -> None:
    """Queue Cloud Task pointing at /internal/run.

    In dev/test (no cloud_tasks_worker_url), invoke the worker handler in-process.
    """
    if not settings.cloud_tasks_worker_url:
        # Dev path — run worker logic asynchronously without going through Cloud Tasks.
        import asyncio

        from workers.pipeline_worker import run_pipeline_for_task

        async def _run() -> None:
            try:
                await run_pipeline_for_task(session_id=session_id, idea_text=idea_text)
            except Exception:  # noqa: BLE001
                log.exception("dev_inline_worker.failed", session_id=session_id)

        asyncio.create_task(_run())
        log.info("generate.dev_inline_dispatch", session_id=session_id)
        return

    body = json.dumps({"session_id": session_id, "idea_text": idea_text}).encode("utf-8")
    parent = (
        f"projects/{settings.google_cloud_project}"
        f"/locations/{settings.cloud_tasks_location}"
        f"/queues/{settings.cloud_tasks_queue}"
    )
    task: dict = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": settings.cloud_tasks_worker_url,
            "headers": {
                "Content-Type": "application/json",
                "X-Request-Id": request_id,
            },
            "body": body,
        }
    }
    if settings.cloud_tasks_invoker_sa:
        task["http_request"]["oidc_token"] = {
            "service_account_email": settings.cloud_tasks_invoker_sa,
            "audience": settings.cloud_tasks_worker_url,
        }

    client = tasks_v2.CloudTasksAsyncClient()
    try:
        await client.create_task(parent=parent, task=task)
    except GoogleAPICallError:
        log.exception("cloud_tasks.create_failed", session_id=session_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "QUEUE_UNAVAILABLE", "message": "could not enqueue pipeline task"},
        )
