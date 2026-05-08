"""User profile, companies list, GDPR data export."""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from models.user_models import User

from ._dependencies import get_current_user

router = APIRouter(prefix="/me", tags=["user"])
log = structlog.get_logger("api.user")


class UserPatch(BaseModel):
    locale: str | None = Field(default=None, max_length=16)
    region: str | None = Field(default=None, max_length=8)
    consent_gdpr: bool | None = None
    consent_marketing: bool | None = None
    consent_retention: bool | None = None
    display_name: str | None = Field(default=None, max_length=80)


class CompanySummary(BaseModel):
    company_id: str | None = None
    session_id: str
    company_name: str | None = None
    status: str
    created_at: datetime


@router.get("", response_model=User, summary="Fetch current user profile.")
async def get_me(user=Depends(get_current_user)) -> User:
    from services import firestore_service

    fetch = getattr(firestore_service, "get_user", None)
    if callable(fetch):
        record = await fetch(user.uid)
        if record is not None:
            return record

    return User(
        uid=user.uid,
        email=user.email,
        role=user.role,  # type: ignore[arg-type]
        tier=user.tier,  # type: ignore[arg-type]
        created_at=datetime.now(tz=timezone.utc),
    )


@router.patch("", response_model=User, summary="Patch locale, region, consent.")
async def patch_me(payload: UserPatch, user=Depends(get_current_user)) -> User:
    from services import firestore_service

    updates: dict = {}
    if payload.locale is not None:
        updates["locale"] = payload.locale
    if payload.region is not None:
        updates["region"] = payload.region
    if payload.display_name is not None:
        updates["display_name"] = payload.display_name
    consent: dict[str, bool] = {}
    if payload.consent_gdpr is not None:
        consent["gdpr"] = payload.consent_gdpr
    if payload.consent_marketing is not None:
        consent["marketing"] = payload.consent_marketing
    if payload.consent_retention is not None:
        consent["retention"] = payload.consent_retention
    if consent:
        updates["consent"] = consent

    update_fn = getattr(firestore_service, "update_user", None)
    if callable(update_fn):
        return await update_fn(user.uid, updates)

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={"code": "NOT_IMPLEMENTED", "message": "user update not configured"},
    )


@router.get(
    "/companies",
    response_model=list[CompanySummary],
    summary="List user's companies / past sessions.",
)
async def list_companies(user=Depends(get_current_user)) -> list[CompanySummary]:
    from services import firestore_service

    rows = await firestore_service.get_user_companies(user.uid)
    out: list[CompanySummary] = []
    for r in rows or []:
        out.append(CompanySummary(
            company_id=r.company_id,
            session_id=r.session_id,
            company_name=r.company_name,
            status=r.status.value,
            created_at=r.created_at,
        ))
    return out


@router.get(
    "/export",
    summary="GDPR Article 20 data export. Returns ZIP with JSON of all user data.",
)
async def export_my_data(user=Depends(get_current_user)) -> Response:
    from services import firestore_service

    bundle = await _gather_user_data(user.uid)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in bundle.items():
            z.writestr(name, json.dumps(content, default=str, indent=2))

    log.info("gdpr.export", uid=user.uid, files=len(bundle))
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="prometheus-export-{user.uid}.zip"',
        },
    )


async def _gather_user_data(uid: str) -> dict[str, dict]:
    from services import firestore_service

    out: dict[str, dict] = {}
    user_fetch = getattr(firestore_service, "get_user", None)
    if callable(user_fetch):
        u = await user_fetch(uid)
        if u is not None:
            out["user.json"] = u.model_dump(mode="json")

    sessions = await firestore_service.get_user_companies(uid)
    out["sessions.json"] = {
        "sessions": [s.model_dump(mode="json") for s in (sessions or [])]
    }
    return out
