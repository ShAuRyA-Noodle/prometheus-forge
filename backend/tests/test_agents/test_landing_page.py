"""Unit tests for LandingPageAgent (Wave 2, Flash) — after_model sanitizes + Imagen."""
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
def stub_after_model(monkeypatch):
    from services import image_service, sanitization

    calls = {"sanitize": 0, "imagen": 0}

    def _sanitize(html: str) -> str:
        calls["sanitize"] += 1
        return "<section><h1>Tally</h1><p>" + ("clean " * 30) + "</p></section>"

    async def _imagen(**_kw):
        calls["imagen"] += 1
        return {
            "hero_image_url": "https://example.com/hero.png",
            "feature_image_urls": ["https://example.com/f1.png", "https://example.com/f2.png"],
        }

    monkeypatch.setattr(sanitization, "sanitize_html", _sanitize, raising=False)
    monkeypatch.setattr(image_service, "generate_hero_images", _imagen, raising=False)
    return calls


async def test_happy_path_runs_after_model(mock_gemini, stub_after_model, state) -> None:
    from agents.landing_page_agent import landing_page_agent
    from models.agent_schemas import LandingPageResult
    from models.session_models import AgentStatusValue

    result = await landing_page_agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED
    assert isinstance(result.output, LandingPageResult)
    assert stub_after_model["sanitize"] == 1
    assert stub_after_model["imagen"] == 1
    assert str(result.output.hero_image_url).startswith("https://example.com/")


async def test_validation_retry(monkeypatch, stub_after_model, state) -> None:
    from agents.landing_page_agent import landing_page_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, landing_page_agent, state, _default_for_schema("LandingPageResult")
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.landing_page_agent import landing_page_agent

    await assert_validation_final_fail(monkeypatch, landing_page_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.landing_page_agent import landing_page_agent

    await assert_safety_blocked(monkeypatch, landing_page_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.landing_page_agent import landing_page_agent

    await assert_timeout(monkeypatch, landing_page_agent, state)


async def test_output_key() -> None:
    from agents.landing_page_agent import landing_page_agent

    assert landing_page_agent.output_key == "landing_page_result"
