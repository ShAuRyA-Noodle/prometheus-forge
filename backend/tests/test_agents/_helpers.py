"""Shared helpers for per-agent unit tests.

`run_agent_lifecycle_tests(agent, state, schema_name, expected_output_key)` runs
the standard 6 lifecycle checks against a single agent instance.
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest


async def assert_happy_path(agent, state: dict[str, Any], schema_cls) -> None:
    from models.session_models import AgentStatusValue

    result = await agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED, (
        f"{agent.name.value}: expected COMPLETED, got {result.status} "
        f"({result.error_code} / {result.error_message})"
    )
    assert isinstance(result.output, schema_cls)
    assert result.retry_count == 0


async def assert_validation_retry(
    monkeypatch: pytest.MonkeyPatch,
    agent,
    state: dict[str, Any],
    valid_payload: dict,
    invalid_payload: dict | None = None,
) -> None:
    """First Gemini response invalid → second valid; assert retry_count=1."""
    from models.session_models import AgentStatusValue
    from services import gemini_client

    invalid = invalid_payload or {"unrelated": "garbage"}
    calls = {"n": 0}

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        calls["n"] += 1
        if calls["n"] == 1:
            return invalid, 100, 50, False
        return valid_payload, 100, 50, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)
    result = await agent.run(state)
    assert calls["n"] == 2, f"expected 2 calls, got {calls['n']}"
    assert result.status == AgentStatusValue.COMPLETED
    assert result.retry_count == 1


async def assert_validation_final_fail(
    monkeypatch: pytest.MonkeyPatch,
    agent,
    state: dict[str, Any],
) -> None:
    from agents.base import AgentValidationError
    from models.session_models import AgentStatusValue
    from services import gemini_client

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return {"unrelated": "garbage"}, 100, 50, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)
    result = await agent.run(state)
    assert result.status == AgentStatusValue.ERROR
    assert result.error_code == AgentValidationError.code


async def assert_safety_blocked(
    monkeypatch: pytest.MonkeyPatch,
    agent,
    state: dict[str, Any],
) -> None:
    from models.session_models import AgentStatusValue
    from services import gemini_client

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return {}, 0, 0, True

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)
    result = await agent.run(state)
    assert result.status == AgentStatusValue.SAFETY_BLOCKED
    assert result.error_code == "SAFETY_BLOCKED"


async def assert_timeout(
    monkeypatch: pytest.MonkeyPatch,
    agent,
    state: dict[str, Any],
) -> None:
    from agents.base import AgentTimeoutError
    from models.session_models import AgentStatusValue
    from services import gemini_client

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)
    result = await agent.run(state)
    assert result.status == AgentStatusValue.ERROR
    assert result.error_code == AgentTimeoutError.code


def populated_state(**overrides) -> dict[str, Any]:
    """Build a state dict with valid pre-wave outputs already populated."""
    from models.agent_schemas import (
        ArticulationOutput,
        BrandIdentityResult,
        BusinessModelResult,
        CompetitiveAnalysisResult,
        FinancialModelResult,
        FinancialProjectionRow,
        MarketResearchResult,
        ParsedIdea,
        RiskAnalysisResult,
        TechArchitectureResult,
    )
    from tests.conftest import _default_for_schema

    parsed = ParsedIdea.model_validate(_default_for_schema("ParsedIdea"))
    articulation = ArticulationOutput.model_validate(_default_for_schema("ArticulationOutput"))
    market = MarketResearchResult.model_validate(_default_for_schema("MarketResearchResult"))
    comp = CompetitiveAnalysisResult.model_validate(_default_for_schema("CompetitiveAnalysisResult"))
    business = BusinessModelResult.model_validate(_default_for_schema("BusinessModelResult"))

    brand_dict = _default_for_schema("BrandIdentityResult")
    brand = BrandIdentityResult.model_validate(brand_dict)

    risk = RiskAnalysisResult.model_validate(_default_for_schema("RiskAnalysisResult"))
    tech = TechArchitectureResult.model_validate(_default_for_schema("TechArchitectureResult"))

    fin_dict = _default_for_schema("FinancialModelResult")
    fin = FinancialModelResult.model_validate(fin_dict)

    state: dict[str, Any] = {
        "idea_text": "A SaaS that reconciles indie e-commerce inventory in real time.",
        "polished_idea": articulation.polished_idea,
        "parsed_idea": parsed,
        "articulation": articulation,
        "market_research_result": market,
        "competitive_analysis_result": comp,
        "business_model_result": business,
        "brand_identity_result": brand,
        "risk_analysis_result": risk,
        "tech_architecture_result": tech,
        "financial_model_result": fin,
    }
    state.update(overrides)
    return state
