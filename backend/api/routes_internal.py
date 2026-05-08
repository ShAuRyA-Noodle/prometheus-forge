"""Internal Cloud Tasks worker entry: /internal/run.

Cloud Tasks delivers a POST with our payload + an OIDC token in the
Authorization header. We MUST verify:
  - issuer == https://accounts.google.com
  - audience == cloud_tasks_worker_url
  - email == cloud_tasks_invoker_sa
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Header, HTTPException, Request, status
from google.auth.transport import requests as google_auth_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel, Field

from config import settings

router = APIRouter(prefix="/internal", tags=["internal"])
log = structlog.get_logger("api.internal")


class RunTaskPayload(BaseModel):
    session_id: str = Field(..., min_length=4, max_length=128)
    idea_text: str = Field(..., min_length=1, max_length=4000)


class RunTaskAck(BaseModel):
    session_id: str
    accepted: bool
    detail: str | None = None


def _verify_oidc(token: str) -> dict:
    """Verify the OIDC token from Cloud Tasks. Returns claims dict or raises."""
    audience = settings.cloud_tasks_worker_url or settings.backend_url
    request_obj = google_auth_requests.Request()
    claims = google_id_token.verify_oauth2_token(
        token, request_obj, audience=audience
    )
    if claims.get("iss") not in {"https://accounts.google.com", "accounts.google.com"}:
        raise ValueError("bad_iss")
    if settings.cloud_tasks_invoker_sa:
        if claims.get("email") != settings.cloud_tasks_invoker_sa:
            raise ValueError("bad_email")
        if not claims.get("email_verified"):
            raise ValueError("email_unverified")
    return claims


@router.post(
    "/run",
    response_model=RunTaskAck,
    summary="Cloud Tasks invocation point. Runs the orchestrator pipeline for one session.",
    include_in_schema=False,
)
async def run_task(
    payload: RunTaskPayload,
    request: Request,
    authorization: str | None = Header(default=None),
) -> RunTaskAck:
    # 1. Verify caller is Cloud Tasks (skip in dev when no invoker SA configured).
    if settings.cloud_tasks_invoker_sa:
        if not authorization or not authorization.lower().startswith("bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "UNAUTHORIZED", "message": "missing OIDC bearer"},
            )
        token = authorization[7:].strip()
        try:
            _verify_oidc(token)
        except Exception as e:  # noqa: BLE001
            log.warning("internal.oidc_failed", err=str(e))
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_AUTH", "message": "OIDC verification failed"},
            ) from e
    else:
        # Dev: only allow loopback or X-Internal-Auth header for safety.
        client_host = (request.client.host if request.client else "")
        if client_host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
            log.warning("internal.dev_blocked_remote", client=client_host)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "UNAUTHORIZED", "message": "dev /internal allows loopback only"},
            )

    # 2. Hand off to the worker handler. Run synchronously so Cloud Tasks
    #    sees a 2xx (ack) only when work has at least started; the heavy
    #    pipeline executes in-process.
    from workers.pipeline_worker import run_pipeline_for_task

    try:
        await run_pipeline_for_task(
            session_id=payload.session_id, idea_text=payload.idea_text
        )
    except Exception as e:  # noqa: BLE001
        log.exception("internal.pipeline_failed", session_id=payload.session_id)
        # Returning 500 lets Cloud Tasks retry per queue config. Worker is
        # responsible for marking the session ERROR if retries are exhausted.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "PIPELINE_FAILED", "message": str(e)},
        ) from e

    return RunTaskAck(session_id=payload.session_id, accepted=True)
