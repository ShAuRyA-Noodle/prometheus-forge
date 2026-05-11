---
name: finance-engine
description: PROMETHEUS deterministic finance engine discipline — auto-invokes when editing backend/services/finance_engine.py or financial_model_agent. Enforces reconciliation invariants (revenue=users*ARPU, gross=revenue-cogs, ebitda=gross-opex), numpy_financial for IRR/NPV, never let LLM do arithmetic, always set reconciliation_passed.
---

# Finance Engine Discipline

You are editing PROMETHEUS's deterministic financial computation. The finance engine is the **only** code path that does monetary arithmetic. Gemini supplies assumptions; the engine computes the numbers. This is a non-negotiable architectural choice.

This file applies whenever you are editing:
- `backend/services/finance_engine.py`
- `backend/agents/financial_model_agent.py`
- `backend/models/agent_schemas.py` (FinancialModelResult / Assumption / KeyMetric / etc.)
- `backend/tests/test_finance_engine.py`
- `frontend/src/hooks/useFinanceSlider.ts` (calls the engine via `/api/session/{id}/finance/recompute`)

## Hard rules

### R1. LLM never does arithmetic

The `financial_model_agent` outputs **assumptions only**:
- `revenue_model: "saas_subscription" | "marketplace" | "transactional" | ...`
- `arpu_starting: float` (e.g. 29.0)
- `arpu_growth_yoy: float` (e.g. 0.10)
- `users_starting: int`
- `user_growth_curve: list[GrowthPoint]` (per quarter)
- `monthly_churn: float`
- `cogs_pct_of_revenue: float`
- `opex_categories: list[OpexCategory]` (engineering, marketing, ops, ...)
- `hiring_plan: list[Hire]` (role, start_quarter, salary)
- `capex_schedule: list[CapexItem]`

**The agent does NOT output revenue or EBITDA numbers.** If you find LLM-emitted projection numbers in the agent output, that's a regression — file a P0.

### R2. Reconciliation invariants (mandatory)

The engine MUST pass these invariants for every quarter `q`:

```
revenue[q]    == users[q] × ARPU[q]
gross[q]      == revenue[q] − COGS[q]
ebitda[q]     == gross[q] − OPEX[q]
cash[q]       == cash[q-1] + ebitda[q] − capex[q]
users[q]      == users[q-1] × (1 - monthly_churn)^3 + new_users[q]
```

If ANY invariant fails (floating-point ε allowed: `abs(diff) > 0.01`), the function MUST set `result.reconciliation_passed = False` and Gate 2 hard-blocks the pipeline.

### R3. IRR / NPV via numpy_financial

```python
import numpy_financial as npf

irr = npf.irr(cashflows)         # never roll-your-own
npv = npf.npv(rate=0.1, values=cashflows)
```

NEVER:
- Compute IRR via your own bisection
- Compute NPV via Σ-loop
- Use `np.irr` (deprecated and removed)

### R4. Sheets API is downstream

After computing, the engine writes the projections to a 3-tab Google Sheets file (P&L / Cash Flow / Key Metrics) **owned by the user** via OAuth `drive.file` scope. The Sheets ID and URL are written into the result.

The Sheets writer is in `backend/services/sheets_service.py`; the engine itself does NOT call Sheets API directly. Separation of concerns.

### R5. Slider re-compute is sub-100ms

The user's financial slider in the UI fires `POST /api/session/{id}/finance/recompute` with new assumption values. The handler calls the engine — **no Gemini call** — and returns the new projections.

Latency budget: < 100 ms p95. To hit this:
- Pure Python compute, no I/O
- numpy vectorization for the per-quarter loop
- Cache nothing — the engine is cheap to re-run

### R6. Recharts on frontend reads structured projection

The shape returned to the slider:

```python
class FinancialProjection(BaseModel):
    quarters: list[QuarterMetrics]   # 12-20 quarters
    annual_summary: list[AnnualSummary]
    key_metrics: KeyMetrics
    reconciliation_passed: bool
    runway_months: int
    breakeven_quarter: int | None
```

Recharts on the frontend binds to this shape; do NOT change field names without also updating `frontend/src/components/FinancialModel/`.

### R7. Hypothesis property tests are mandatory

In `backend/tests/test_finance_engine.py`:

```python
@given(st.from_type(FinancialAssumptions))
def test_reconciliation_invariants(assumptions):
    result = run_engine(assumptions)
    if not result.reconciliation_passed:
        return  # acceptable failure mode
    for q in result.quarters:
        assert abs(q.revenue - q.users * q.arpu) < 0.01
        assert abs(q.gross - q.revenue + q.cogs) < 0.01
        assert abs(q.ebitda - q.gross + q.opex) < 0.01
```

Any change to the engine MUST come with hypothesis tests. Example tests are not enough — fuzz the inputs.

### R8. No "creative" growth curves

The engine accepts a `user_growth_curve: list[GrowthPoint]`. NEVER:
- Use a "smart default" if the curve is empty (force the agent to provide one or fail)
- Smooth out negative growth (let it propagate; it tells the user the model is broken)
- Cap MRR at a "reasonable" ceiling (founders need to see what their assumptions imply)

The engine is faithful to the inputs. The job of "is this assumption realistic" belongs to the agent prompt + downstream gate, not the engine.

### R9. Currency

- All amounts in USD by default.
- If `assumptions.currency != "USD"`, convert to USD using a **quarterly-frozen FX rate** (cache from `services/fx_service.py`).
- Display currency on the frontend slider is independent (UI conversion).

### R10. Negative cash + runway

If `cash[q] < 0` for any q, set:
- `breakeven_quarter` to the q where cash trajectory crosses 0 from positive (if any), else `None`
- `runway_months` to the months from now to first negative cash, given current burn rate

These are the numbers founders care about most. Do not silently floor them at 0.

## Anti-patterns

- ❌ "I'll let Gemini fill in the projection numbers as a sanity check." NO. Gemini does arithmetic = LLM hallucinations in the financial model = customer trust collapse.
- ❌ Try/except around the reconciliation check. If reconciliation fails, the user must see it. Set `reconciliation_passed=False` and let Gate 2 surface it.
- ❌ Hard-coded SaaS-specific assumptions in the engine. The engine is revenue-model-agnostic; SaaS-isms belong in the agent prompt.
- ❌ Editing the FinancialProjection schema without updating `frontend/src/components/FinancialModel/` in same PR. The slider breaks.

## When you change finance_engine.py

You MUST also:
1. Update `tests/test_finance_engine.py` with hypothesis fuzz coverage on the new code path
2. Run `pytest tests/test_finance_engine.py -q` and confirm green
3. Run golden regression and confirm `reconciliation_passed` rate ≥ 97%
4. If you changed the projection shape, update TS mirror in `frontend/src/types/agents.ts`
5. If you changed runway / breakeven logic, update `docs/PROMPT_REGISTRY.md` (if the agent prompt was tuned to match)

## Reading order

1. `backend/services/finance_engine.py` — current implementation
2. `backend/models/agent_schemas.py` — `FinancialAssumptions`, `FinancialProjection`, related models
3. `backend/tests/test_finance_engine.py` — current property tests
4. `PROMETHEUS_BLUEPRINT_V2.md` §3 (Wave 2 financial_model_agent)
