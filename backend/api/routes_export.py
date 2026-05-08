"""Export a session bundle to user-owned destinations (Drive, Notion, etc.)."""
from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from models import ExportRequest

from ._dependencies import get_current_user

router = APIRouter(prefix="/session", tags=["export"])
log = structlog.get_logger("api.export")


class ExportTargetResult(BaseModel):
    target: str
    ok: bool
    url: str | None = None
    detail: str | None = None


class ExportResponse(BaseModel):
    session_id: str
    results: list[ExportTargetResult]


_SUPPORTED = {"drive", "notion", "markdown_zip", "pptx", "json"}


@router.post(
    "/{session_id}/export",
    response_model=ExportResponse,
    summary="Export a completed session to one or more destinations.",
)
async def export_session(
    session_id: str,
    payload: ExportRequest,
    user=Depends(get_current_user),
) -> ExportResponse:
    from services import (
        export_service,
        firestore_service,
    )

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

    bad = [t for t in payload.targets if t not in _SUPPORTED]
    if bad:
        raise HTTPException(
            status_code=400,
            detail={"code": "BAD_TARGETS", "message": f"unsupported targets: {bad}", "supported": list(_SUPPORTED)},
        )

    target_to_fn = {
        "drive": export_service.export_to_drive,
        "notion": export_service.export_to_notion,
        "markdown_zip": export_service.export_to_markdown_zip,
        "pptx": export_service.export_to_pptx,
        "json": export_service.export_to_json,
    }

    async def _run(target: str) -> ExportTargetResult:
        try:
            res = await target_to_fn[target](session_id=session_id, uid=user.uid)
        except Exception as e:  # noqa: BLE001
            log.exception("export.target_failed", target=target, session_id=session_id)
            return ExportTargetResult(target=target, ok=False, detail=str(e))
        url = getattr(res, "url", None) or (res.get("url") if isinstance(res, dict) else None)
        return ExportTargetResult(target=target, ok=True, url=url)

    results = await asyncio.gather(*[_run(t) for t in payload.targets])
    return ExportResponse(session_id=session_id, results=list(results))
