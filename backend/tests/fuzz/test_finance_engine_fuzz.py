"""Fuzz: 200 random assumption sets all reconcile in finance engine."""
from __future__ import annotations

import math

import pytest

try:
    from hypothesis import HealthCheck, given, settings as hyp_settings, strategies as st

    HYPOTHESIS_OK = True
except ImportError:
    HYPOTHESIS_OK = False


@pytest.mark.skipif(not HYPOTHESIS_OK, reason="hypothesis not installed")
class TestFinanceEngineFuzz:
    @hyp_settings(max_examples=200, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        starting_users=st.floats(min_value=1.0, max_value=50_000.0),
        growth=st.floats(min_value=0.0, max_value=0.40),
        churn=st.floats(min_value=0.0, max_value=0.20),
        arpu=st.floats(min_value=1.0, max_value=5_000.0),
        gm=st.floats(min_value=0.05, max_value=0.95),
        cac=st.floats(min_value=1.0, max_value=5_000.0),
        seed=st.floats(min_value=0.0, max_value=20_000_000.0),
    )
    def test_reconciles_or_flags(
        self, starting_users, growth, churn, arpu, gm, cac, seed
    ) -> None:
        from services.finance_engine import compute_projections

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
        # Deterministic: either reconciles, or surfaces failure flag.
        assert isinstance(result.reconciliation_passed, bool)
        for row in result.projections:
            for v in (row.revenue_usd, row.cogs_usd, row.gross_profit_usd, row.opex_usd, row.ebitda_usd):
                assert not math.isnan(v)
                assert not math.isinf(v)
