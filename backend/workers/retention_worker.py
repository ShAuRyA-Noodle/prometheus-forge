"""Retention worker — Cloud Scheduler hits this weekly.

Iterates active companies and calls services.retention_service.weekly_market_diff
to re-grade market data, send email summaries, and refresh dashboards.
"""
from __future__ import annotations

import asyncio
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request, status

from config import settings

log = structlog.get_logger("worker.retention")

router = APIRouter(prefix="/internal/retention", tags=["internal", "retention"])


async def run_weekly_market_diffs() -> dict[str, Any]:
    from services import firestore_service, retention_service

    log.info("retention.start")

    active_companies: list = []
    list_active = getattr(firestore_service, "list_active_companies", None)
    if callable(list_active):
        active_companies = await list_active()

    if not active_companies:
        log.info("retention.no_active_companies")
        return {"processed": 0, "errors": 0}

    sem = asyncio.Semaphore(8)
    results: list[bool] = []

    async def _one(company_id: str) -> bool:
        async with sem:
            try:
                await retention_service.weekly_market_diff(company_id=company_id)
                return True
            except Exception:  # noqa: BLE001
                log.exception("retention.company_failed", company_id=company_id)
                return False

    tasks = [_one(c.company_id) for c in active_companies if getattr(c, "company_id", None)]
    results = await asyncio.gather(*tasks)
    summary = {
        "processed": len(results),
        "errors": sum(1 for r in results if not r),
    }
    log.info("retention.done", **summary)
    return summary


@router.post("/run", include_in_schema=False)
async def http_run(request: Request) -> dict[str, Any]:
    # Cloud Scheduler with OIDC auth — re-use OIDC validation if invoker SA configured.
    if settings.cloud_tasks_invoker_sa:
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing OIDC")
    return await run_weekly_market_diffs()
