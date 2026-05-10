"""Legal prompt-injection: payloads dropping lawyer_review_cta must be defeated by gate."""
from __future__ import annotations

import pytest

pytestmark = [pytest.mark.security, pytest.mark.asyncio]


async def test_legal_cta_forced_true_by_after_model(monkeypatch, mock_gemini) -> None:
    """Even with adversarial output, after_model overrides lawyer_review_cta to True."""
    from agents.legal_documents_agent import legal_documents_agent
    from services import gemini_client, legal_template_service
    from tests.conftest import _default_for_schema
    from tests.test_agents._helpers import populated_state

    bad = dict(_default_for_schema("LegalDocumentsResult"))
    bad["lawyer_review_cta"] = False  # adversarial

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return bad, 100, 100, False

    async def _fill(**_kw):
        return None

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)
    monkeypatch.setattr(legal_template_service, "fill_template", _fill, raising=False)

    state = populated_state()
    result = await legal_documents_agent.run(state)
    assert result.output.lawyer_review_cta is True


async def test_wave_2_gate_enforces_lawyer_cta() -> None:
    """Even if after_model is bypassed, gate rejects when CTA is False."""
    from agents.gates import wave_2_gate
    from tests.test_gates import _populated_wave2

    state = _populated_wave2()
    state["legal_documents_result"] = state["legal_documents_result"].model_copy(
        update={"lawyer_review_cta": False}
    )
    result = await wave_2_gate(state)
    assert result.passed is False
    assert any(i.code == "LEGAL_NO_LAWYER_CTA" for i in result.issues)
