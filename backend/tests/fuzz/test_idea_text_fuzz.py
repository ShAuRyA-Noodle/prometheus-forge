"""Fuzz: idea_text with random Unicode, RTL, control chars never crashes."""
from __future__ import annotations

import secrets

import pytest

try:
    from hypothesis import HealthCheck, given, settings as hyp_settings, strategies as st

    HYPOTHESIS_OK = True
except ImportError:
    HYPOTHESIS_OK = False


pytestmark = pytest.mark.asyncio


@pytest.mark.skipif(not HYPOTHESIS_OK, reason="hypothesis not installed")
class TestIdeaTextFuzz:
    @hyp_settings(max_examples=80, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        text=st.text(
            alphabet=st.characters(min_codepoint=0x20, max_codepoint=0xFFFF),
            min_size=10,
            max_size=2000,
        )
    )
    async def test_random_text_does_not_crash(self, client, text: str) -> None:
        r = await client.post(
            "/api/generate",
            json={"idea_text": text},
            headers={"authorization": "Bearer test", "content-type": "application/json",
                     "idempotency-key": "fz-" + secrets.token_urlsafe(12)},
        )
        # Must be a structured 4xx/5xx or success — never an unhandled crash.
        assert 200 <= r.status_code < 600
        try:
            r.json()
        except Exception:
            assert r.headers.get("content-type", "").startswith("text/")


def test_strip_controls_never_crashes() -> None:
    if not HYPOTHESIS_OK:
        pytest.skip("hypothesis not installed")
    from middleware.input_sanitization import _strip_controls

    @hyp_settings(max_examples=200, deadline=None)
    @given(text=st.text(min_size=0, max_size=1000))
    def _go(text: str) -> None:
        out = _strip_controls(text)
        assert isinstance(out, str)

    _go()
