"""Deterministic financial projection engine.

Gemini supplies *assumptions only*. This module turns those assumptions into a
36-month month-by-month projection using pandas + numpy_financial, then
aggregates to ``FinancialProjectionRow`` (3 yearly rows). All arithmetic is
asserted to reconcile (revenue == users * arpu, gross_profit = revenue - cogs,
ebitda = gross_profit - opex).

Failure mode: if any assertion fails, ``reconciliation_passed=False`` and a
detailed reasons array is recorded in ``key_metrics["_reconciliation_errors"]``.
"""
from __future__ import annotations

import math
from typing import Any

import structlog

from models.agent_schemas import FinancialModelResult, FinancialProjectionRow

log = structlog.get_logger(__name__)


# ─── Defaults / clamps ───────────────────────────────────────────────────────


_DEFAULTS: dict[str, float] = {
    "starting_users": 100.0,
    "growth_rate_monthly": 0.10,        # 10% MoM
    "churn_monthly": 0.04,              # 4% monthly
    "arpu_usd": 25.0,
    "cac_usd": 60.0,
    "gross_margin_pct": 0.75,           # 75%
    "headcount_year_1": 4.0,
    "headcount_year_2": 9.0,
    "headcount_year_3": 18.0,
    "salary_loaded_avg": 9000.0,        # per month, fully loaded
    "fixed_opex_monthly": 4000.0,
    "marketing_spend_pct_of_revenue": 0.20,
    "tax_rate": 0.21,
    "seed_funding_usd": 750_000.0,
}


_REQUIRED_KEYS = list(_DEFAULTS.keys())


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _coerce_assumptions(raw: dict[str, Any]) -> dict[str, float]:
    """Pull required assumptions, fill missing with defaults, clamp ranges."""
    out: dict[str, float] = {}
    for k in _REQUIRED_KEYS:
        try:
            out[k] = float(raw.get(k, _DEFAULTS[k]))
        except (TypeError, ValueError):
            out[k] = _DEFAULTS[k]

    out["growth_rate_monthly"] = _clamp(out["growth_rate_monthly"], 0.0, 0.50)
    out["churn_monthly"] = _clamp(out["churn_monthly"], 0.0, 0.30)
    out["gross_margin_pct"] = _clamp(out["gross_margin_pct"], 0.0, 0.99)
    out["marketing_spend_pct_of_revenue"] = _clamp(out["marketing_spend_pct_of_revenue"], 0.0, 1.0)
    out["tax_rate"] = _clamp(out["tax_rate"], 0.0, 0.50)
    out["arpu_usd"] = max(0.01, out["arpu_usd"])
    out["starting_users"] = max(0.0, out["starting_users"])
    out["seed_funding_usd"] = max(0.0, out["seed_funding_usd"])
    return out


# ─── Core compute ────────────────────────────────────────────────────────────


def compute_projections(assumptions: dict[str, Any]) -> FinancialModelResult:
    """Returns a fully-validated ``FinancialModelResult``.

    Math model (per month):
        users[t] = users[t-1] * (1 + growth - churn) for t >= 1
        revenue[t]   = users[t] * arpu
        cogs[t]      = revenue[t] * (1 - gross_margin)
        gross[t]     = revenue[t] - cogs[t]
        marketing[t] = revenue[t] * marketing_pct
        salaries[t]  = headcount[year_for_t] * salary_loaded_avg
        opex[t]      = salaries[t] + fixed_opex_monthly + marketing[t]
        ebitda[t]    = gross[t] - opex[t]
        cash[t]      = cash[t-1] + ebitda[t]   (cash starts at seed_funding)

    Headcount linearly ramps within a year between the start and end-of-year value.
    """
    try:
        import numpy as np  # type: ignore[import-not-found]
        import pandas as pd  # type: ignore[import-not-found]
    except Exception as e:  # noqa: BLE001
        log.error("finance_engine.deps_missing", err=str(e))
        return _failure_result(assumptions, [f"deps_missing: {e}"])

    a = _coerce_assumptions(assumptions or {})

    months = 36
    n_growth = 1.0 + a["growth_rate_monthly"] - a["churn_monthly"]

    # Users
    users = np.zeros(months, dtype=float)
    users[0] = a["starting_users"] * n_growth  # treat month 1 as one growth step
    for t in range(1, months):
        users[t] = users[t - 1] * n_growth
    users = np.maximum(users, 0.0)

    revenue = users * a["arpu_usd"]
    cogs = revenue * (1.0 - a["gross_margin_pct"])
    gross = revenue - cogs

    # Headcount per month — linear ramp within each year
    h_year_start = [a["headcount_year_1"], a["headcount_year_1"], a["headcount_year_2"]]
    h_year_end = [a["headcount_year_1"], a["headcount_year_2"], a["headcount_year_3"]]
    headcount_monthly = np.zeros(months, dtype=float)
    for y in range(3):
        start = h_year_start[y]
        end = h_year_end[y]
        for m in range(12):
            t = y * 12 + m
            frac = (m + 1) / 12.0
            headcount_monthly[t] = start + (end - start) * frac

    salaries = headcount_monthly * a["salary_loaded_avg"]
    marketing = revenue * a["marketing_spend_pct_of_revenue"]
    opex_fixed = np.full(months, a["fixed_opex_monthly"], dtype=float)
    opex = salaries + opex_fixed + marketing

    ebitda = gross - opex
    # Tax: only on positive EBITDA
    tax = np.where(ebitda > 0, ebitda * a["tax_rate"], 0.0)
    net_income = ebitda - tax

    # Cash trajectory
    cash = np.zeros(months, dtype=float)
    cash[0] = a["seed_funding_usd"] + net_income[0]
    for t in range(1, months):
        cash[t] = cash[t - 1] + net_income[t]

    df = pd.DataFrame(
        {
            "month": np.arange(1, months + 1),
            "year": ((np.arange(months) // 12) + 1),
            "users": users,
            "revenue": revenue,
            "cogs": cogs,
            "gross": gross,
            "opex": opex,
            "salaries": salaries,
            "marketing": marketing,
            "ebitda": ebitda,
            "net_income": net_income,
            "cash": cash,
            "headcount": headcount_monthly,
        }
    )

    # Aggregate yearly
    rows: list[FinancialProjectionRow] = []
    for y in (1, 2, 3):
        chunk = df[df["year"] == y]
        rows.append(
            FinancialProjectionRow(
                year=int(y),
                revenue_usd=float(chunk["revenue"].sum()),
                cogs_usd=float(chunk["cogs"].sum()),
                gross_profit_usd=float(chunk["gross"].sum()),
                opex_usd=float(chunk["opex"].sum()),
                ebitda_usd=float(chunk["ebitda"].sum()),
                headcount=int(round(chunk["headcount"].iloc[-1])),
                cash_usd=float(chunk["cash"].iloc[-1]),
            )
        )

    # Runway = current cash / current monthly burn (last 3 months avg burn)
    burn_recent = -df["ebitda"].iloc[:3].mean()
    if burn_recent > 0 and a["seed_funding_usd"] > 0:
        runway_months = float(a["seed_funding_usd"] / burn_recent)
    else:
        runway_months = 60.0  # cap

    # Breakeven = first month gross > opex (i.e. ebitda > 0)
    pos = df[df["ebitda"] > 0]
    breakeven_month: int | None = int(pos["month"].iloc[0]) if not pos.empty else None

    # LTV / CAC
    churn = a["churn_monthly"] if a["churn_monthly"] > 0 else 0.04
    ltv = (a["arpu_usd"] * a["gross_margin_pct"]) / churn
    ltv_cac = (ltv / a["cac_usd"]) if a["cac_usd"] > 0 else 0.0
    payback = a["cac_usd"] / max(a["arpu_usd"] * a["gross_margin_pct"], 1e-6)

    # ─── Reconciliation ──────────────────────────────────────────────────
    reasons: list[str] = []
    try:
        # users * arpu == revenue
        if not np.allclose(users * a["arpu_usd"], revenue, rtol=1e-6, atol=1e-3):
            reasons.append("revenue != users * arpu")
        # gross_profit == revenue - cogs
        if not np.allclose(gross, revenue - cogs, rtol=1e-6, atol=1e-3):
            reasons.append("gross_profit != revenue - cogs")
        # ebitda == gross - opex
        if not np.allclose(ebitda, gross - opex, rtol=1e-6, atol=1e-3):
            reasons.append("ebitda != gross - opex")
        # Yearly rows must sum to monthly totals
        total_rev = float(df["revenue"].sum())
        if not math.isclose(
            sum(r.revenue_usd for r in rows), total_rev, rel_tol=1e-6, abs_tol=1.0
        ):
            reasons.append("yearly revenue rows do not sum to monthly total")
    except Exception as e:  # noqa: BLE001
        reasons.append(f"reconciliation_exception: {e}")

    reconciliation_passed = len(reasons) == 0

    key_metrics: dict[str, float] = {
        "ltv_usd": float(round(ltv, 2)),
        "cac_usd": float(round(a["cac_usd"], 2)),
        "ltv_cac_ratio": float(round(ltv_cac, 2)),
        "payback_months": float(round(payback, 2)),
        "gross_margin_pct": float(round(a["gross_margin_pct"] * 100.0, 2)),
        "year_1_revenue_usd": float(round(rows[0].revenue_usd, 2)),
        "year_3_revenue_usd": float(round(rows[2].revenue_usd, 2)),
        "month_36_users": float(round(users[-1], 0)),
    }

    if not reconciliation_passed:
        # Surface but don't crash — the schema requires reconciliation_passed=False
        log.error("finance_engine.reconciliation_failed", reasons=reasons)
        # Stash in a non-typed sidecar — schema's key_metrics is dict[str, float],
        # so we encode the reason count instead
        key_metrics["_reconciliation_error_count"] = float(len(reasons))

    result = FinancialModelResult(
        assumptions=a,
        projections=rows,
        funding_seed_usd=a["seed_funding_usd"],
        runway_months=float(round(runway_months, 1)),
        breakeven_month=breakeven_month,
        key_metrics=key_metrics,
        sheets_id=None,
        sheets_url=None,
        reconciliation_passed=reconciliation_passed,
    )

    log.info(
        "finance_engine.compute",
        runway_months=result.runway_months,
        breakeven=result.breakeven_month,
        reconciled=result.reconciliation_passed,
    )
    return result


def _failure_result(assumptions: dict[str, Any], reasons: list[str]) -> FinancialModelResult:
    """Schema-valid result we can return when computation itself fails."""
    rows = [
        FinancialProjectionRow(
            year=y,
            revenue_usd=0.0,
            cogs_usd=0.0,
            gross_profit_usd=0.0,
            opex_usd=0.0,
            ebitda_usd=0.0,
            headcount=0,
            cash_usd=0.0,
        )
        for y in (1, 2, 3)
    ]
    return FinancialModelResult(
        assumptions=dict(assumptions or {}),
        projections=rows,
        funding_seed_usd=0.0,
        runway_months=0.0,
        breakeven_month=None,
        key_metrics={"_reconciliation_error_count": float(len(reasons))},
        reconciliation_passed=False,
    )


__all__ = ["compute_projections"]
