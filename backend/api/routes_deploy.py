"""Deploy generated landing page to a domain."""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from models import DeployRequest

from ._dependencies import get_current_user

router = APIRouter(prefix="/session", tags=["deploy"])
log = structlog.get_logger("api.deploy")


class DeployResponse(BaseModel):
    session_id: str
    deploy_url: str
    custom_domain: str | None = None
    domain_purchased: bool = False


@router.post(
    "/{session_id}/deploy",
    response_model=DeployResponse,
    summary="Deploy landing page (Cloudflare Pages) optionally with a custom/purchased domain.",
)
async def deploy_session(
    session_id: str,
    payload: DeployRequest,
    user=Depends(get_current_user),
) -> DeployResponse:
    from services import deploy_service, firestore_service

    if payload.session_id != session_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "BAD_REQUEST", "message": "session_id mismatch"},
        )

    session = await firestore_service.read_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "no session"})
    if session.user_uid != user.uid:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "not your session"})

    purchased = False
    custom = payload.domain
    if payload.purchase_domain and payload.domain:
        try:
            await deploy_service.provision_domain(domain=payload.domain, uid=user.uid)
            purchased = True
        except Exception as e:  # noqa: BLE001
            log.exception("deploy.provision_failed", domain=payload.domain)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={"code": "DOMAIN_PROVISION_FAILED", "message": str(e)},
            ) from e

    try:
        result = await deploy_service.deploy_landing_page(
            session_id=session_id,
            uid=user.uid,
            custom_domain=custom,
        )
    except Exception as e:  # noqa: BLE001
        log.exception("deploy.failed", session_id=session_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "DEPLOY_FAILED", "message": str(e)},
        ) from e

    deploy_url = getattr(result, "url", None) or (
        result.get("url") if isinstance(result, dict) else None
    )
    if not deploy_url:
        raise HTTPException(
            status_code=502,
            detail={"code": "DEPLOY_FAILED", "message": "deploy_service returned no url"},
        )

    return DeployResponse(
        session_id=session_id,
        deploy_url=deploy_url,
        custom_domain=custom,
        domain_purchased=purchased,
    )
