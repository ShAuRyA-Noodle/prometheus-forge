"""Public share endpoints — resolve signed share tokens, track viewer telemetry.

Used by `/share/:token` SharePage on the frontend. Tokens are minted via
services.share_token_service and carry scope (deck, summary, landing) +
session_id + ttl. Verification falls open closed on invalid tokens.

Public route (no auth) but rate-limited via middleware and Cloud Armor.
"""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from services import firestore_service, share_token_service

router = APIRouter(prefix="/share", tags=["share"])
log = structlog.get_logger("api.share")


class ShareResolveResponse(BaseModel):
    session_id: str
    scope: str
    company_name: str | None
    payload: dict[str, Any]
    view_id: str
    expires_at_iso: str | None = None


@router.get("/{token}", response_model=ShareResolveResponse)
async def resolve_share(token: str, request: Request) -> ShareResolveResponse:
    """Verify token, fetch the read-only payload scoped to the token's permission."""
    if not token or len(token) > 4096:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SHARE_TOKEN_INVALID", "message": "missing or oversized token"},
        )

    claims = await share_token_service.verify(token)
    if claims is None:
        log.info("share.token_invalid", token_prefix=token[:8])
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SHARE_TOKEN_EXPIRED_OR_INVALID"},
        )

    session = await firestore_service.read_session(claims.session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SESSION_NOT_FOUND"},
        )

    payload: dict[str, Any] = {}
    scope = claims.scope
    if scope == "deck":
        deck_doc = await firestore_service.read_agent_output(claims.session_id, "pitch_deck")
        payload = {"pitch_deck": (deck_doc or {}).get("result")}
    elif scope == "summary":
        summary_doc = await firestore_service.read_agent_output(claims.session_id, "executive_summary")
        payload = {"executive_summary": (summary_doc or {}).get("result")}
    elif scope == "landing":
        landing_doc = await firestore_service.read_agent_output(claims.session_id, "landing_page")
        payload = {"landing_page": (landing_doc or {}).get("result")}
    elif scope == "full":
        # Investor link — exposes deck + summary + market + business model only.
        payload = {}
        for agent in ("pitch_deck", "executive_summary", "market_research", "business_model"):
            doc = await firestore_service.read_agent_output(claims.session_id, agent)
            if doc and "result" in doc:
                payload[agent] = doc["result"]
    else:
        log.warning("share.unknown_scope", scope=scope)
        payload = {}

    # Pixel-style view tracking is also exposed at POST /share/{token}/view for
    # the SharePage to call after render — but record an initial resolve too.
    viewer_meta = {
        "ua": request.headers.get("user-agent", "")[:200],
        "ip_prefix": (request.client.host if request.client else "").split(".")[0:2],
        "referer": request.headers.get("referer", "")[:300],
    }
    view_id = await share_token_service.track_view(token, viewer_meta)

    return ShareResolveResponse(
        session_id=claims.session_id,
        scope=scope,
        company_name=getattr(session, "company_name", None),
        payload=payload,
        view_id=view_id,
        expires_at_iso=getattr(claims, "expires_at_iso", None),
    )


class ViewBeaconBody(BaseModel):
    slide_index: int | None = None
    dwell_ms: int | None = None
    viewport: dict[str, int] | None = None


@router.post("/{token}/view", status_code=status.HTTP_204_NO_CONTENT)
async def track_view_beacon(token: str, body: ViewBeaconBody, request: Request) -> None:
    """Lightweight beacon endpoint for deck/landing-page view analytics."""
    claims = await share_token_service.verify(token)
    if claims is None:
        # Silent 204 to avoid leaking token validity to scrapers.
        return None
    await share_token_service.track_view(
        token,
        {
            "slide_index": body.slide_index,
            "dwell_ms": body.dwell_ms,
            "viewport": body.viewport,
            "ua": request.headers.get("user-agent", "")[:200],
        },
    )
    return None
