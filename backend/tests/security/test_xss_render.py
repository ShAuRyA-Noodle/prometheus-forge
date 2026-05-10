"""XSS render regression — sanitizer must defang every payload class."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.security


_PAYLOADS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>",
    "<a href='javascript:alert(1)'>x</a>",
    "<iframe src='javascript:alert(1)'></iframe>",
    "<object data='data:text/html,<script>alert(1)</script>'></object>",
    "<embed src='javascript:alert(1)'>",
    "<details ontoggle=alert(1) open>x</details>",
    "<form action='javascript:alert(1)'><input type=submit></form>",
    "<style>@import 'javascript:alert(1)';</style>",
]


@pytest.mark.parametrize("payload", _PAYLOADS)
def test_html_sanitizer_defangs(payload: str) -> None:
    from services.sanitization import sanitize_html

    cleaned = sanitize_html(payload).lower()
    assert "<script" not in cleaned
    assert "javascript:" not in cleaned
    assert " onerror" not in cleaned
    assert " onload" not in cleaned
    assert " ontoggle" not in cleaned
    assert "<iframe" not in cleaned
    assert "<embed" not in cleaned
    assert "<object" not in cleaned


def test_svg_sanitizer_defangs() -> None:
    from services.sanitization import sanitize_svg

    bad = '<svg onload="alert(1)"><script>x</script></svg>'
    cleaned = sanitize_svg(bad).lower()
    assert "<script" not in cleaned
    assert " onload" not in cleaned
