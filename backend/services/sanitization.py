"""HTML / SVG / prompt-input sanitization.

* ``sanitize_html`` — nh3 (preferred) → bleach fallback. Strict allowlist.
  Injects a default CSP meta tag.
* ``sanitize_svg`` — strips <script>, on*, foreignObject, javascript:.
* ``wrap_user_input_safe`` — prompt-injection envelope.
"""
from __future__ import annotations

import re
from typing import Any

import structlog

log = structlog.get_logger(__name__)


# ─── HTML allowlist ─────────────────────────────────────────────────────────


_ALLOWED_TAGS: set[str] = {
    "a", "abbr", "address", "article", "aside", "b", "blockquote", "br",
    "button", "caption", "cite", "code", "col", "colgroup", "details", "dd",
    "div", "dl", "dt", "em", "fieldset", "figcaption", "figure", "footer",
    "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "i",
    "img", "input", "kbd", "label", "li", "main", "mark", "nav", "ol",
    "optgroup", "option", "p", "picture", "pre", "q", "section", "select",
    "small", "source", "span", "strong", "sub", "summary", "sup",
    "svg", "table", "tbody", "td", "textarea", "tfoot", "th", "thead", "time",
    "tr", "u", "ul", "wbr",
    # SVG primitives we accept inline within <svg>
    "circle", "defs", "ellipse", "g", "line", "linearGradient", "path",
    "polygon", "polyline", "radialGradient", "rect", "stop", "text", "tspan",
    "use",
}

_ALLOWED_ATTRS: dict[str, set[str]] = {
    "*": {
        "class", "id", "title", "aria-label", "aria-hidden", "role",
        "lang", "dir", "tabindex", "data-*",
    },
    "a": {"href", "target"},
    "img": {"src", "alt", "width", "height", "loading", "decoding", "srcset", "sizes"},
    "source": {"srcset", "sizes", "media", "type"},
    "input": {"type", "name", "placeholder", "value", "required", "aria-label"},
    "label": {"for"},
    "button": {"type", "name", "value", "aria-label"},
    "form": {"action", "method", "novalidate"},
    "meta": {"name", "content", "charset", "http-equiv"},
    "svg": {
        "viewBox", "xmlns", "width", "height", "fill", "stroke", "stroke-width",
        "preserveAspectRatio",
    },
    "path": {"d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform"},
    "circle": {"cx", "cy", "r", "fill", "stroke", "stroke-width"},
    "ellipse": {"cx", "cy", "rx", "ry", "fill", "stroke"},
    "line": {"x1", "y1", "x2", "y2", "stroke", "stroke-width"},
    "polygon": {"points", "fill", "stroke"},
    "polyline": {"points", "fill", "stroke"},
    "rect": {"x", "y", "width", "height", "rx", "ry", "fill", "stroke"},
    "g": {"transform", "fill", "stroke"},
    "stop": {"offset", "stop-color", "stop-opacity"},
    "linearGradient": {"id", "x1", "y1", "x2", "y2", "gradientUnits"},
    "radialGradient": {"id", "cx", "cy", "r", "fx", "fy", "gradientUnits"},
    "use": {"href", "x", "y", "width", "height"},
    "text": {"x", "y", "font-family", "font-size", "fill", "text-anchor"},
    "tspan": {"x", "y", "dx", "dy", "font-family", "font-size", "fill"},
}

_ALLOWED_URL_SCHEMES = ("http", "https", "mailto", "tel")  # never data: for href (XSS vector)

_DEFAULT_CSP = (
    "default-src 'none'; "
    "img-src 'self' data: https:; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "script-src 'none'; "
    "frame-ancestors 'none'; "
    "base-uri 'none'; "
    "form-action 'self';"
)


# ─── HTML sanitizer ─────────────────────────────────────────────────────────


def _sanitize_html_nh3(html: str) -> str:
    import nh3  # type: ignore[import-not-found]

    attrs: dict[str, set[str]] = {}
    for tag, allowed in _ALLOWED_ATTRS.items():
        attrs[tag] = {a for a in allowed if not a.endswith("*")}
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=attrs,
        url_schemes=set(_ALLOWED_URL_SCHEMES),
        link_rel="noopener noreferrer",
        strip_comments=True,
    )


def _sanitize_html_bleach(html: str) -> str:
    import bleach  # type: ignore[import-not-found]

    flat_attrs: dict[str, list[str]] = {
        tag: sorted(allowed) for tag, allowed in _ALLOWED_ATTRS.items()
    }
    return bleach.clean(
        html,
        tags=list(_ALLOWED_TAGS),
        attributes=flat_attrs,
        protocols=list(_ALLOWED_URL_SCHEMES),
        strip=True,
        strip_comments=True,
    )


def _inject_csp(html: str) -> str:
    csp_tag = f'<meta http-equiv="Content-Security-Policy" content="{_DEFAULT_CSP}">'
    if "<head" in html:
        return re.sub(r"(<head[^>]*>)", r"\1" + csp_tag, html, count=1)
    if "<html" in html:
        return re.sub(
            r"(<html[^>]*>)", r"\1<head>" + csp_tag + "</head>", html, count=1
        )
    return csp_tag + html


_POST_SCRUB_URI = re.compile(r"(?i)(java|vb)script:")
_POST_SCRUB_DATA_HTML = re.compile(r"(?i)data:\s*text/html[^\s\"'>]*")
_POST_SCRUB_SCRIPT_TAG = re.compile(r"(?i)<\s*/?\s*script\b[^>]*>")


def sanitize_html(html: str) -> str:
    if not html:
        return ""
    try:
        cleaned = _sanitize_html_nh3(html)
    except Exception as e:  # noqa: BLE001
        log.warning("sanitize.nh3_failed_falling_back", err=str(e))
        cleaned = _sanitize_html_bleach(html)
    # Defense in depth: scrub residual XSS substrings that survived as text
    # content or attribute values (e.g. bare "javascript:" text, <script> in
    # alt="" content). Belt-and-suspenders over the sanitizer's structural pass.
    cleaned = _POST_SCRUB_URI.sub("[blocked-uri]", cleaned)
    cleaned = _POST_SCRUB_DATA_HTML.sub("[blocked-uri]", cleaned)
    cleaned = _POST_SCRUB_SCRIPT_TAG.sub("", cleaned)
    return _inject_csp(cleaned)


# ─── SVG sanitizer ──────────────────────────────────────────────────────────


_SVG_REMOVE_TAGS = re.compile(
    r"<\s*(script|foreignObject|iframe|object|embed|link|meta)\b[^>]*>.*?<\s*/\s*\1\s*>",
    re.IGNORECASE | re.DOTALL,
)
_SVG_REMOVE_TAGS_SELF = re.compile(
    r"<\s*(script|foreignObject|iframe|object|embed|link|meta)\b[^>]*/?>",
    re.IGNORECASE,
)
_SVG_REMOVE_ON = re.compile(r"\son[a-z]+\s*=\s*\"[^\"]*\"", re.IGNORECASE)
_SVG_REMOVE_ON_SQ = re.compile(r"\son[a-z]+\s*=\s*'[^']*'", re.IGNORECASE)
_SVG_REMOVE_JS_HREF = re.compile(
    r'(href|xlink:href)\s*=\s*"(\s*javascript:)[^"]*"', re.IGNORECASE
)
_SVG_REMOVE_JS_HREF_SQ = re.compile(
    r"(href|xlink:href)\s*=\s*'(\s*javascript:)[^']*'", re.IGNORECASE
)


def sanitize_svg(svg: str) -> str:
    if not svg:
        return ""
    s = svg
    s = _SVG_REMOVE_TAGS.sub("", s)
    s = _SVG_REMOVE_TAGS_SELF.sub("", s)
    s = _SVG_REMOVE_ON.sub("", s)
    s = _SVG_REMOVE_ON_SQ.sub("", s)
    s = _SVG_REMOVE_JS_HREF.sub("", s)
    s = _SVG_REMOVE_JS_HREF_SQ.sub("", s)

    # Final pass: defer to nh3 with svg-only allowlist
    try:
        import nh3  # type: ignore[import-not-found]

        svg_tags = {
            "svg", "circle", "defs", "ellipse", "g", "line", "linearGradient",
            "path", "polygon", "polyline", "radialGradient", "rect", "stop",
            "text", "tspan", "use", "title",
        }
        attrs = {
            tag: {a for a in _ALLOWED_ATTRS.get(tag, set()) if not a.endswith("*")}
            for tag in svg_tags
        }
        s = nh3.clean(
            s,
            tags=svg_tags,
            attributes=attrs,
            url_schemes={"http", "https", "data"},
            strip_comments=True,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("sanitize.svg_nh3_unavailable", err=str(e))
    return s


# ─── Prompt safety envelope ─────────────────────────────────────────────────

_USER_OPEN = "<<USER_UNTRUSTED>>"
_USER_CLOSE = "<</USER_UNTRUSTED>>"


def wrap_user_input_safe(text: str) -> str:
    """Envelope user-supplied text so the LLM treats it as DATA, not as
    instructions. We ALSO strip stray closing tokens that an attacker might
    inject to escape the envelope."""
    if text is None:
        return _USER_OPEN + _USER_CLOSE
    cleaned = (
        text.replace(_USER_OPEN, "")
        .replace(_USER_CLOSE, "")
        .replace("<</USER_UNTRUSTED", "")
        .replace("<<USER_UNTRUSTED", "")
    )
    return f"{_USER_OPEN}\n{cleaned}\n{_USER_CLOSE}"


__all__ = ["sanitize_html", "sanitize_svg", "wrap_user_input_safe"]
