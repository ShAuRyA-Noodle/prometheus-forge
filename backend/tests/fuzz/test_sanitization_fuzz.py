"""Fuzz: random HTML/SVG → sanitizer produces clean output (no script/on*/javascript:)."""
from __future__ import annotations

import re

import pytest

try:
    from hypothesis import HealthCheck, given, settings as hyp_settings, strategies as st

    HYPOTHESIS_OK = True
except ImportError:
    HYPOTHESIS_OK = False


_TAGS = st.sampled_from(
    [
        "script",
        "iframe",
        "img",
        "svg",
        "object",
        "embed",
        "form",
        "input",
        "a",
        "p",
        "div",
        "section",
    ]
)
_ATTRS = st.sampled_from(
    [
        ' onerror="alert(1)"',
        ' onload="x()"',
        ' src="javascript:1"',
        ' href="javascript:alert(1)"',
        ' style="background:url(javascript:1)"',
        ' data="data:text/html,x"',
        "",
    ]
)


@pytest.mark.skipif(not HYPOTHESIS_OK, reason="hypothesis not installed")
class TestSanitizationFuzz:
    @hyp_settings(max_examples=120, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(
        tag=_TAGS,
        attr=_ATTRS,
        body=st.text(min_size=0, max_size=200),
    )
    def test_sanitize_html_safe(self, tag: str, attr: str, body: str) -> None:
        from services.sanitization import sanitize_html

        raw = f"<{tag}{attr}>{body}</{tag}>"
        cleaned = sanitize_html(raw).lower()
        assert "<script" not in cleaned
        assert " onerror" not in cleaned
        assert " onload" not in cleaned
        assert "javascript:" not in cleaned
        assert "<iframe" not in cleaned

    @hyp_settings(max_examples=80, deadline=None, suppress_health_check=[HealthCheck.too_slow])
    @given(body=st.text(min_size=0, max_size=400))
    def test_sanitize_svg_no_script(self, body: str) -> None:
        from services.sanitization import sanitize_svg

        # Embed body inside a script tag and attribute pollution.
        raw = f'<svg onload="x"><script>{body}</script><circle r="40"/></svg>'
        cleaned = sanitize_svg(raw).lower()
        assert "<script" not in cleaned
        assert " onload" not in cleaned
