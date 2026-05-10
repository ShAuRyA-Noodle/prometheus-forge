"""Unit tests for PitchDeckAgent (Wave 3, Pro) — pre-summarize + after_model workspace."""
from __future__ import annotations

import pytest

from tests.test_agents._helpers import (
    assert_safety_blocked,
    assert_timeout,
    assert_validation_final_fail,
    assert_validation_retry,
    populated_state,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture
def state():
    return populated_state()


@pytest.fixture
def stub_summarize_and_workspace(monkeypatch):
    from agents import _summarize
    from services import google_workspace

    calls = {"summarize_all": 0, "workspace": 0}

    async def _summarize_all(state, keys):
        calls["summarize_all"] += 1
        out = {}
        alias_map = {
            "market_research": "market_summary",
            "competitive_analysis": "competitive_summary",
            "business_model": "business_model_summary",
            "financial_model": "financial_summary",
            "brand_identity": "brand_summary",
            "go_to_market": "gtm_summary",
            "risk_analysis": "risk_summary",
            "tech_architecture": "tech_summary",
        }
        for key in keys:
            slug = key.replace("_result", "")
            out[alias_map.get(slug, f"{slug}_summary")] = f"summary of {slug}"
        return out

    async def _create_presentation_from_template(**kw):
        calls["workspace"] += 1
        return {
            "presentation_id": "pres_abc",
            "presentation_url": "https://docs.example/pres",
            "pdf_url": "https://docs.example/pres.pdf",
            "slide_image_urls": {},
        }

    monkeypatch.setattr(_summarize, "summarize_all", _summarize_all, raising=False)
    monkeypatch.setattr(
        google_workspace,
        "create_presentation_from_template",
        _create_presentation_from_template,
        raising=False,
    )
    return calls


async def test_happy_path_runs_after_model(
    mock_gemini, stub_summarize_and_workspace, state
) -> None:
    from agents.pitch_deck_agent import pitch_deck_agent
    from models.agent_schemas import PitchDeckResult
    from models.session_models import AgentStatusValue

    result = await pitch_deck_agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED
    assert isinstance(result.output, PitchDeckResult)
    assert stub_summarize_and_workspace["summarize_all"] >= 1
    assert stub_summarize_and_workspace["workspace"] == 1
    assert result.output.presentation_id == "pres_abc"


async def test_validation_retry(monkeypatch, stub_summarize_and_workspace, state) -> None:
    from agents.pitch_deck_agent import pitch_deck_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, pitch_deck_agent, state, _default_for_schema("PitchDeckResult")
    )


async def test_validation_final_fail(monkeypatch, stub_summarize_and_workspace, state) -> None:
    from agents.pitch_deck_agent import pitch_deck_agent

    await assert_validation_final_fail(monkeypatch, pitch_deck_agent, state)


async def test_safety_blocked(monkeypatch, stub_summarize_and_workspace, state) -> None:
    from agents.pitch_deck_agent import pitch_deck_agent

    await assert_safety_blocked(monkeypatch, pitch_deck_agent, state)


async def test_timeout(monkeypatch, stub_summarize_and_workspace, state) -> None:
    from agents.pitch_deck_agent import pitch_deck_agent

    await assert_timeout(monkeypatch, pitch_deck_agent, state)


async def test_output_key() -> None:
    from agents.pitch_deck_agent import pitch_deck_agent

    assert pitch_deck_agent.output_key == "pitch_deck_result"
