"""Per-session cost tracking + hard budget enforcement.

* ``record_cost(session_id, agent, cost, in_tokens, out_tokens)`` —
  atomically increments ``costs/{session_id}`` doc.
* ``check_budget(session_id)`` — raises ``CostBudgetExceeded`` if total
  exceeds ``settings.max_cost_usd_per_session``.
* ``get_session_cost(session_id)`` — returns ``CostTelemetry``.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import structlog

from agents.base import CostBudgetExceeded
from config import settings
from models.session_models import AgentName, CostTelemetry

log = structlog.get_logger(__name__)


def _get_db() -> Any:
    from services.firestore_service import _get_db as _internal  # type: ignore[attr-defined]

    return _internal()


# ─── Public API ──────────────────────────────────────────────────────────────


async def record_cost(
    session_id: str,
    agent: AgentName | None,
    cost_usd: float,
    in_tokens: int = 0,
    out_tokens: int = 0,
    *,
    grounding: bool = False,
    workspace: bool = False,
    image: bool = False,
) -> None:
    def _write() -> None:
        from google.cloud import firestore as gcfs  # type: ignore[import-not-found]

        db = _get_db()
        ref = db.collection("costs").document(session_id)
        update: dict[str, Any] = {
            "session_id": session_id,
            "total_input_tokens": gcfs.Increment(in_tokens),
            "total_output_tokens": gcfs.Increment(out_tokens),
            "total_cost_usd": gcfs.Increment(float(cost_usd)),
            "updated_at": datetime.now(timezone.utc),
        }
        if grounding:
            update["grounding_calls"] = gcfs.Increment(1)
        if workspace:
            update["workspace_api_calls"] = gcfs.Increment(1)
        if image:
            update["image_generations"] = gcfs.Increment(1)
        if agent is not None:
            update[f"by_agent.{agent.value}.cost_usd"] = gcfs.Increment(float(cost_usd))
            update[f"by_agent.{agent.value}.input_tokens"] = gcfs.Increment(in_tokens)
            update[f"by_agent.{agent.value}.output_tokens"] = gcfs.Increment(out_tokens)
        ref.set(update, merge=True)

    await asyncio.to_thread(_write)


async def get_session_cost(session_id: str) -> CostTelemetry:
    def _read() -> dict[str, Any]:
        db = _get_db()
        snap = db.collection("costs").document(session_id).get()
        if not snap.exists:
            return {}
        return snap.to_dict() or {}

    data = await asyncio.to_thread(_read)
    return CostTelemetry(
        total_input_tokens=int(data.get("total_input_tokens", 0) or 0),
        total_output_tokens=int(data.get("total_output_tokens", 0) or 0),
        total_cost_usd=float(data.get("total_cost_usd", 0.0) or 0.0),
        grounding_calls=int(data.get("grounding_calls", 0) or 0),
        workspace_api_calls=int(data.get("workspace_api_calls", 0) or 0),
        image_generations=int(data.get("image_generations", 0) or 0),
    )


async def check_budget(session_id: str) -> bool:
    """Returns True if within budget. Raises CostBudgetExceeded on breach."""
    telemetry = await get_session_cost(session_id)
    if telemetry.total_cost_usd > settings.max_cost_usd_per_session:
        log.error(
            "cost.budget_exceeded",
            session_id=session_id,
            cost=telemetry.total_cost_usd,
            cap=settings.max_cost_usd_per_session,
        )
        raise CostBudgetExceeded(
            f"session {session_id} exceeded cap "
            f"${settings.max_cost_usd_per_session:.2f} "
            f"(actual ${telemetry.total_cost_usd:.4f})"
        )
    if telemetry.total_input_tokens + telemetry.total_output_tokens > settings.max_tokens_per_session:
        log.error(
            "cost.token_budget_exceeded",
            session_id=session_id,
            tokens=telemetry.total_input_tokens + telemetry.total_output_tokens,
            cap=settings.max_tokens_per_session,
        )
        raise CostBudgetExceeded(
            f"session {session_id} exceeded token cap {settings.max_tokens_per_session}"
        )
    return True


__all__ = ["check_budget", "get_session_cost", "record_cost"]
