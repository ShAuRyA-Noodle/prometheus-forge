"""Fuzz: random JSON dicts against Pydantic schemas — no silent coercion to invalid."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

try:
    from hypothesis import HealthCheck, given, settings as hyp_settings, strategies as st

    HYPOTHESIS_OK = True
except ImportError:
    HYPOTHESIS_OK = False


_PRIM = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-1_000_000, max_value=1_000_000),
    st.floats(allow_nan=False, allow_infinity=False, min_value=-1e9, max_value=1e9),
    st.text(min_size=0, max_size=200),
)


def _random_dict():
    return st.dictionaries(
        keys=st.text(min_size=1, max_size=20),
        values=st.one_of(_PRIM, st.lists(_PRIM, max_size=5)),
        max_size=12,
    )


@pytest.mark.skipif(not HYPOTHESIS_OK, reason="hypothesis not installed")
class TestSchemaFuzz:
    @hyp_settings(max_examples=80, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(payload=_random_dict())
    def test_parsed_idea_validation(self, payload) -> None:
        from models.agent_schemas import ParsedIdea

        try:
            obj = ParsedIdea.model_validate(payload)
        except ValidationError:
            return  # acceptable: random payload doesn't satisfy schema
        # If validation succeeded, all required fields present and constrained.
        assert 20 <= len(obj.idea_summary) <= 500

    @hyp_settings(max_examples=80, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(payload=_random_dict())
    def test_market_research_validation(self, payload) -> None:
        from models.agent_schemas import MarketResearchResult

        try:
            MarketResearchResult.model_validate(payload)
        except ValidationError:
            return

    @hyp_settings(max_examples=80, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(payload=_random_dict())
    def test_brand_identity_validation(self, payload) -> None:
        from models.agent_schemas import BrandIdentityResult

        try:
            BrandIdentityResult.model_validate(payload)
        except ValidationError:
            return
