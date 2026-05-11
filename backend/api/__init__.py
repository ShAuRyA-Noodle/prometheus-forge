"""HTTP API routers. main.py mounts each one under its prefix."""
from __future__ import annotations

from fastapi import APIRouter

from .routes_auth import router as auth_router
from .routes_billing import router as billing_router
from .routes_deploy import router as deploy_router
from .routes_export import router as export_router
from .routes_finance import router as finance_router
from .routes_generate import router as generate_router
from .routes_internal import router as internal_router
from .routes_marketplace import router as marketplace_router
from .routes_session import router as session_router
from .routes_share import router as share_router
from .routes_speech import router as speech_router
from .routes_user import router as user_router
from .sse import router as sse_router


def build_api_router() -> APIRouter:
    """All routes that live under the /api prefix."""
    r = APIRouter()
    r.include_router(generate_router)
    r.include_router(session_router)
    r.include_router(auth_router)
    r.include_router(user_router)
    r.include_router(billing_router)
    r.include_router(export_router)
    r.include_router(deploy_router)
    r.include_router(speech_router)
    r.include_router(marketplace_router)
    r.include_router(finance_router)
    r.include_router(share_router)
    return r


__all__ = [
    "auth_router",
    "billing_router",
    "build_api_router",
    "deploy_router",
    "export_router",
    "finance_router",
    "generate_router",
    "internal_router",
    "marketplace_router",
    "session_router",
    "share_router",
    "speech_router",
    "sse_router",
    "user_router",
]
