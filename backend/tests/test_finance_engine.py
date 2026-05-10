"""Property-based tests for finance_engine."""
from __future__ import annotations

import math

import pytest

try:
    from hypothesis import HealthCheck, given, settings as hyp_settings, strategies as st

    HYPOTHESIS_OK = True
except ImportError:
    HYPOTHESIS_OK = False


@pytest.mark.skipif(not HYPOTHESIS_OK, reason="hypothesis not installed")
class TestFinanceEngineProperties:
    @hyp_settings(max_examples=200, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        starting_users=st.floats(min_value=1.0, max_value=100_000.0, allow_nan=False),
        growth=st.floats(min_value=0.0, max_value=0.45, allow_nan=False),
        churn=st.floats(min_value=0.0, max_value=0.25, allow_nan=False),
        arpu=st.floats(min_value=1.0, max_value=10_000.0, allow_nan=False),
        gm=st.floats(min_value=0.0, max_value=0.99, allow_nan=False),
        cac=st.floats(min_value=1.0, max_value=10_000.0, allow_nan=False),
        seed=st.floats(min_value=0.0, max_value=50_000_000.0, allow_nan=False),
    )
    def test_arithmetic_invariants(
        self, starting_users, growth, churn, arpu, gm, cac, seed
    ) -> None:
        from services.finance_engine import compute_projections

        try:
            from services.finance_engine import compute_projections  # already imported above
        except ImportError:
            pytest.skip("finance_engine deps missing")

        result = compute_projections(
            {
                "starting_users": starting_users,
                "growth_rate_monthly": growth,
                "churn_monthly": churn,
                "arpu_usd": arpu,
                "gross_margin_pct": gm,
                "cac_usd": cac,
                "seed_funding_usd": seed,
            }
        )

        # Always returns a schema-valid result.
        assert result is not None
        assert len(result.projections) == 3

        for row in result.projections:
            # gross_profit == revenue - cogs
            assert math.isclose(
                row.gross_profit_usd, row.revenue_usd - row.cogs_usd, rel_tol=1e-3, abs_tol=1.0
            )
            # ebitda == gross - opex
            assert math.isclose(
                row.ebitda_usd, row.gross_profit_usd - row.opex_usd, rel_tol=1e-3, abs_tol=1.0
            )
            # No NaN / inf
            for fld in (
                row.revenue_usd,
                row.cogs_usd,
                row.gross_profit_usd,
                row.opex_usd,
                row.ebitda_usd,
                row.cash_usd,
            ):
                assert not math.isnan(fld)
                assert not math.isinf(fld)

        # Year column monotonic and increasing.
        years = [r.year for r in result.projections]
        assert years == sorted(years)
        assert years == [1, 2, 3]

        # Runway non-negative.
        assert result.runway_months >= 0
        # Breakeven None or >= 1.
        assert result.breakeven_month is None or result.breakeven_month >= 1


def test_finance_engine_basic_reconciles() -> None:
    """Sanity test outside hypothesis: known assumptions produce reconciled output."""
    from services.finance_engine import compute_projections

    result = compute_projections(
        {
            "starting_users": 100.0,
            "growth_rate_monthly": 0.10,
            "churn_monthly": 0.04,
            "arpu_usd": 50.0,
            "gross_margin_pct": 0.80,
            "cac_usd": 100.0,
            "seed_funding_usd": 1_000_000.0,
        }
    )
    assert result.reconciliation_passed is True
    assert len(result.projections) == 3


def test_finance_engine_handles_zero_users() -> None:
    from services.finance_engine import compute_projections

    result = compute_projections(
        {"starting_users": 0.0, "growth_rate_monthly": 0.05, "churn_monthly": 0.05}
    )
    # Must not crash; returns schema-valid result.
    assert len(result.projections) == 3
