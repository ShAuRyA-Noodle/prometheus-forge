"""Unit tests for LegalDocumentsAgent (Wave 2, Flash) — template-fill, never raw LLM."""
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
def stub_template(monkeypatch):
    from services import legal_template_service

    calls = {"n": 0}

    async def _fill(**kw):
        calls["n"] += 1
        return {
            "tos_doc_id": "doc_tos_abc",
            "tos_doc_url": "https://docs.example/tos",
            "privacy_doc_id": "doc_priv_abc",
            "privacy_doc_url": "https://docs.example/priv",
        }

    monkeypatch.setattr(legal_template_service, "fill_template", _fill, raising=False)
    return calls


async def test_happy_path_runs_after_model(mock_gemini, stub_template, state) -> None:
    from agents.legal_documents_agent import legal_documents_agent
    from models.agent_schemas import LegalDocumentsResult
    from models.session_models import AgentStatusValue

    result = await legal_documents_agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED
    assert isinstance(result.output, LegalDocumentsResult)
    # Template service called.
    assert stub_template["n"] == 1
    # CTA always forced.
    assert result.output.lawyer_review_cta is True


async def test_lawyer_cta_always_true_even_if_model_omits(monkeypatch, stub_template, state) -> None:
    """Defense-in-depth: even if Gemini emits lawyer_review_cta=False, after_model overrides."""
    from agents.legal_documents_agent import legal_documents_agent
    from services import gemini_client
    from tests.conftest import _default_for_schema

    payload = dict(_default_for_schema("LegalDocumentsResult"))
    payload["lawyer_review_cta"] = False  # adversarial

    async def _call(**_kw):
        return payload, 100, 100, False

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)
    result = await legal_documents_agent.run(state)
    assert result.output is not None
    assert result.output.lawyer_review_cta is True  # forced by after_model


async def test_validation_retry(monkeypatch, stub_template, state) -> None:
    from agents.legal_documents_agent import legal_documents_agent
    from tests.conftest import _default_for_schema

    await assert_validation_retry(
        monkeypatch, legal_documents_agent, state, _default_for_schema("LegalDocumentsResult")
    )


async def test_validation_final_fail(monkeypatch, state) -> None:
    from agents.legal_documents_agent import legal_documents_agent

    await assert_validation_final_fail(monkeypatch, legal_documents_agent, state)


async def test_safety_blocked(monkeypatch, state) -> None:
    from agents.legal_documents_agent import legal_documents_agent

    await assert_safety_blocked(monkeypatch, legal_documents_agent, state)


async def test_timeout(monkeypatch, state) -> None:
    from agents.legal_documents_agent import legal_documents_agent

    await assert_timeout(monkeypatch, legal_documents_agent, state)


async def test_output_key() -> None:
    from agents.legal_documents_agent import legal_documents_agent

    assert legal_documents_agent.output_key == "legal_documents_result"
