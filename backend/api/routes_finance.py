"""Finance: deterministic /api/finance/recompute for live scenario sliders.

Wraps services.finance_engine.compute_projections so the FinancialModel UI can
debounce slider edits and re-render P&L/cash/runway charts without rerunning
the full LLM pipeline. Pure deterministic math — no Gemini calls.
"""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from models.agent_schemas import FinancialModelResult
from services import finance_engine

from ._dependencies import get_current_user

router = APIRouter(prefix="/finance", tags=["finance"])
log = structlog.get_logger("api.finance")


# Realistic guardrails so the slider can't push the engine into nonsense
# territory (NaN/inf cascades downstream charts).
_RANGES: dict[str, tuple[float, float]] = {
    "starting_users": (0, 10_000_000),
    "growth_rate_monthly": (-0.5, 1.0),
    "churn_monthly": (0.0, 0.5),
    "arpu_usd": (0.0, 100_000.0),
    "cac_usd": (0.0, 100_000.0),
    "gross_margin_pct": (0.0, 1.0),
    "headcount_year_1": (0, 1_000),
    "headcount_year_2": (0, 5_000),
    "headcount_year_3": (0, 20_000),
    "salary_loaded_avg": (0.0, 500_000.0),
    "fixed_opex_monthly": (0.0, 10_000_000.0),
    "marketing_pct_of_revenue": (0.0, 2.0),
    "tax_rate": (0.0, 0.6),
    "seed_funding_usd": (0.0, 1_000_000_000.0),
}


class RecomputeRequest(BaseModel):
    assumptions: dict[str, float | int] = Field(default_factory=dict)
    seed_funding_usd: float = Field(default=0.0, ge=0.0, le=1_000_000_000.0)

    @field_validator("assumptions")
    @classmethod
    def clamp_to_safe_ranges(cls, v: dict[str, float | int]) -> dict[str, float | int]:
        out: dict[str, float | int] = {}
        for key, val in v.items():
            lo, hi = _RANGES.get(key, (-float("inf"), float("inf")))
            if not isinstance(val, (int, float)):
                raise ValueError(f"assumption {key!r} must be numeric")
            out[key] = max(lo, min(hi, float(val)))
        return out


@router.post("/recompute", response_model=FinancialModelResult)
async def recompute_projections(
    req: RecomputeRequest,
    user: Any = Depends(get_current_user),
) -> FinancialModelResult:
    """Live recompute of 3-year projections from user-edited assumptions.

    Reconciliation invariants are enforced in finance_engine; if any assertion
    fails, the response carries `reconciliation_passed=False` so the UI can
    surface a banner instead of rendering nonsense charts.
    """
    log.info(
        "finance.recompute",
        uid=getattr(user, "uid", "anon"),
        keys=list(req.assumptions.keys()),
    )
    try:
        result = await finance_engine.compute_projections(
            req.assumptions,
            seed_funding_usd=req.seed_funding_usd,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("finance.recompute_failed", error=str(e)[:200])
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "FINANCE_RECOMPUTE_FAILED", "message": str(e)[:200]},
        ) from e

    return result
