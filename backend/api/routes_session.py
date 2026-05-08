"""Session lifecycle: read, cancel, regen, branch, list outputs."""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from config import settings
from logging_setup import hash_idea
from models import (
    AgentOutputResponse,
    BranchRequest,
    GenerateResponse,
    RegenRequest,
    SessionResponse,
)
from models.session_models import (
    AgentName,
    AgentRecord,
    Session,
    SessionStatus,
    Wave,
)

from ._dependencies import get_current_user, get_request_id
from .routes_generate import _WAVE_OF_AGENT, _initial_agents, _new_session_id

router = APIRouter(prefix="/session", tags=["session"])
log = structlog.get_logger("api.session")


def _ensure_owner(session: Session, uid: str) -> None:
    if session.user_uid != uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "session belongs to another user"},
        )


@router.get(
    "/{session_id}",
    response_model=SessionResponse,
    summary="Fetch session metadata + per-agent records.",
)
async def get_session(
    session_id: str,
    user=Depends(get_current_user),
) -> SessionResponse:
    from services import firestore_service

    session = await firestore_service.read_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "SESSION_NOT_FOUND", "message": "session does not exist"},
        )
    _ensure_owner(session, user.uid)

    return SessionResponse(
        session_id=session.session_id,
        status=session.status,
        created_at=session.created_at,
        started_at=session.started_at,
        completed_at=session.completed_at,
        company_name=session.company_name,
        agents={k.value: v for k, v in session.agents.items()},
        cost=session.cost,
        error_code=session.error_code,
    )


@router.get(
    "/{session_id}/outputs/{agent}",
    response_model=AgentOutputResponse,
    summary="Fetch a single agent's output for a session.",
)
async def get_agent_output(
    session_id: str,
    agent: str,
    user=Depends(get_current_user),
) -> AgentOutputResponse:
    from services import firestore_service

    session = await firestore_service.read_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "no session"})
    _ensure_owner(session, user.uid)

    try:
        agent_enum = AgentName(agent)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": "BAD_AGENT", "message": f"unknown agent '{agent}'"},
        ) from e

    record = session.agents.get(agent_enum)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "AGENT_NOT_FOUND", "message": "agent not part of this session"},
        )

    payload = await firestore_service.read_agent_output(session_id, agent_enum)
    return AgentOutputResponse(
        agent=agent_enum.value,
        status=record.status.value,
        completed_at=record.completed_at,
        result=payload or {},
        cost_usd=record.cost_usd,
    )


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel an in-flight session.",
)
async def cancel_session(
    session_id: str,
    user=Depends(get_current_user),
) -> None:
    from services import firestore_service

    session = await firestore_service.read_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "no session"})
    _ensure_owner(session, user.uid)

    if session.status in {
        SessionStatus.COMPLETED,
        SessionStatus.ERROR,
        SessionStatus.CANCELED,
        SessionStatus.SAFETY_BLOCKED,
        SessionStatus.BUDGET_EXCEEDED,
    }:
        return None

    await firestore_service.cancel_session(session_id)
    log.info("session.canceled", session_id=session_id, uid=user.uid)
    return None


@router.get(
    "/{session_id}/branches",
    summary="List branches (child sessions) created from this session.",
)
async def list_branches(
    session_id: str,
    user=Depends(get_current_user),
) -> dict:
    from services import firestore_service

    session = await firestore_service.read_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "no session"})
    _ensure_owner(session, user.uid)

    children: list = []
    list_branches_fn = getattr(firestore_service, "list_branches_for_session", None)
    if callable(list_branches_fn):
        children = await list_branches_fn(session_id)

    return {
        "parent_session_id": session_id,
        "branches": [
            {
                "session_id": c.session_id,
                "branch_id": c.branch_id,
                "status": c.status.value,
                "created_at": c.created_at.isoformat(),
                "steering": c.metadata.get("branch_steering"),
            }
            for c in children
        ],
    }


@router.post(
    "/{session_id}/regen",
    response_model=GenerateResponse,
    summary="Regenerate a single agent (and optionally propagate downstream).",
)
async def regen_agent(
    session_id: str,
    payload: RegenRequest,
    request: Request,
    user=Depends(get_current_user),
    request_id: str = Depends(get_request_id),
) -> GenerateResponse:
    from services import firestore_service

    if payload.session_id != session_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "BAD_REQUEST", "message": "session_id mismatch"},
        )

    session = await firestore_service.read_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "no session"})
    _ensure_owner(session, user.uid)

    record = session.agents.get(payload.agent)
    if record is None:
        raise HTTPException(
            status_code=400,
            detail={"code": "BAD_AGENT", "message": f"agent {payload.agent} not in session"},
        )

    # Mark agent and (optionally) downstream agents pending again.
    agents_to_reset = [payload.agent]
    if payload.propagate_downstream:
        target_wave = _WAVE_OF_AGENT[payload.agent]
        for name, wave in _WAVE_OF_AGENT.items():
            if _wave_index(wave) > _wave_index(target_wave):
                agents_to_reset.append(name)

    for name in agents_to_reset:
        await firestore_service.update_agent_status(
            session_id=session_id,
            agent=name,
            status="pending",
        )

    await firestore_service.update_session_status(session_id, SessionStatus.QUEUED)

    from .routes_generate import _enqueue_pipeline_task

    await _enqueue_pipeline_task(
        session_id=session_id,
        idea_text=session.idea_text,
        request_id=request_id,
    )

    return GenerateResponse(
        session_id=session_id,
        status=SessionStatus.QUEUED,
        sse_url=f"/sse/sessions/{session_id}",
        estimated_completion_seconds=60,
    )


@router.post(
    "/{session_id}/branch",
    response_model=GenerateResponse,
    summary="Create a child session steered from a parent (branching).",
)
async def branch_session(
    session_id: str,
    payload: BranchRequest,
    request: Request,
    user=Depends(get_current_user),
    request_id: str = Depends(get_request_id),
) -> GenerateResponse:
    from services import firestore_service

    if payload.session_id != session_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "BAD_REQUEST", "message": "session_id mismatch"},
        )

    parent = await firestore_service.read_session(session_id)
    if parent is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "no session"})
    _ensure_owner(parent, user.uid)

    now = datetime.now(tz=timezone.utc)
    new_id = _new_session_id()
    branch_id = f"branch_{secrets.token_urlsafe(8)}"

    child = Session(
        session_id=new_id,
        user_uid=user.uid,
        parent_session_id=session_id,
        branch_id=branch_id,
        idempotency_key=f"branch:{session_id}:{branch_id}",
        idea_text_hash=hash_idea(parent.idea_text),
        idea_text=parent.idea_text,
        status=SessionStatus.QUEUED,
        created_at=now,
        agents=_initial_agents(),
        metadata={
            **parent.metadata,
            "branch_name": payload.branch_name,
            "branch_steering": payload.steering,
            "request_id": request_id,
        },
    )
    await firestore_service.create_session(child)

    from .routes_generate import _enqueue_pipeline_task

    await _enqueue_pipeline_task(
        session_id=new_id,
        idea_text=parent.idea_text,
        request_id=request_id,
    )

    return GenerateResponse(
        session_id=new_id,
        status=SessionStatus.QUEUED,
        sse_url=f"/sse/sessions/{new_id}",
        estimated_completion_seconds=120,
    )


def _wave_index(w: Wave) -> int:
    order = {Wave.PRE: 0, Wave.WAVE_1: 1, Wave.WAVE_2: 2, Wave.WAVE_3: 3}
    return order.get(w, 99)
