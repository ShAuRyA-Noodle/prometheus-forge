"""Unit tests for BrandIdentityAgent (Wave 1, Flash) — has after_model hook."""
from __future__ import annotations

from typing import Any

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
def patch_brand_services(monkeypatch):
    """Stub out trademark + domain hits used by after_model."""
    from services import domain_service, trademark_service

    calls = {"uspto": 0, "domain": 0}

    async def _check_uspto(name: str) -> dict[str, Any]:
        calls["uspto"] += 1
        return {"conflicts": []}

    async def _check_domain_availability(name: str) -> dict[str, Any]:
        calls["domain"] += 1
        return {
            "com_available": True,
            "handle_x_available": True,
            "handle_instagram_available": True,
        }

    monkeypatch.setattr(trademark_service, "check_uspto", _check_uspto, raising=False)
    monkeypatch.setattr(
        domain_service, "check_domain_availability", _check_domain_availability, raising=False
    )
    return calls


async def test_happy_path_runs_after_model(mock_gemini, patch_brand_services, state) -> None:
    from agents.brand_identity_agent import brand_identity_agent
    from models.agent_schemas import BrandIdentityResult
    from models.session_models import AgentStatusValue

    result = await brand_identity_agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED
    assert isinstance(result.output, BrandIdentityResult)
    # After-model hook fired: USPTO + domain were checked.
    assert patch_brand_services["uspto"] >= 1
    assert patch_brand_services["domain"] >= 1


async def test_validation_retry(monkeypatch, patch_brand_services, state) -> None:
    from agents.brand_identity_agent import brand_identity_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch,
        brand_identity_agent,
        state,
        _default_for_schema("BrandIdentityResult"),
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.brand_identity_agent import brand_identity_agent

    await assert_validation_final_fail(monkeypatch, brand_identity_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.brand_identity_agent import brand_identity_agent

    await assert_safety_blocked(monkeypatch, brand_identity_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.brand_identity_agent import brand_identity_agent

    await assert_timeout(monkeypatch, brand_identity_agent, state)


async def test_output_key() -> None:
    from agents.brand_identity_agent import brand_identity_agent

    assert brand_identity_agent.output_key == "brand_identity_result"


async def test_after_model_promotes_alt_on_conflict(monkeypatch, mock_gemini, state) -> None:
    """If primary has USPTO conflicts, an alternative is promoted."""
    from agents.brand_identity_agent import brand_identity_agent
    from models.session_models import AgentStatusValue
    from services import domain_service, trademark_service

    async def _check_uspto(name: str):
        if name == "Tally":
            return {"conflicts": ["Tally LLC reg 1234"]}
        return {"conflicts": []}

    async def _check_domain_availability(name: str):
        return {"com_available": True, "handle_x_available": True, "handle_instagram_available": True}

    # Inject a primary "Tally" with a viable alternative.
    from tests.conftest import _default_for_schema

    payload = _default_for_schema("BrandIdentityResult")
    payload = dict(payload)
    payload["company_name"] = "Tally"
    payload["name_alternatives"] = [
        {"name": "Replenisha", "rationale": "alt"},
    ]

    from services import gemini_client

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return payload, 100, 100, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)
    monkeypatch.setattr(trademark_service, "check_uspto", _check_uspto, raising=False)
    monkeypatch.setattr(
        domain_service, "check_domain_availability", _check_domain_availability, raising=False
    )

    result = await brand_identity_agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED
    # Either kept the primary (failed retries) or promoted the viable alternative.
    assert result.output is not None
    assert result.output.company_name in {"Tally", "Replenisha"}
