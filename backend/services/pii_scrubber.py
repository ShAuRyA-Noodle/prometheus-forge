"""PII scrubber — redacts sensitive data before it ever reaches logs/transcripts.

This is the FIRST line of defense for log hygiene. The orchestrator and all
service modules MUST funnel any user-derived text through ``scrub`` before it
reaches structlog or any third-party telemetry sink.

Patterns covered:
  - emails               → ``[email]``
  - phone numbers (US/E.164) → ``[phone]``
  - SSN                  → ``[ssn]``
  - credit cards (Luhn-validated) → ``[card]``
  - API keys             → ``[apikey]``
  - service-account.json fragments → ``[sa-json]``
  - Stripe live/test keys → ``[stripe-key]``
  - JWTs                 → ``[jwt]``

Hashing helper ``hash_for_log`` returns a sha256 short hash for log correlation
without leaking the input.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

# ─── Regexes ─────────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(
    r"(?:(?<!\d)\+?1?[\s.\-]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}(?!\d))"
    r"|(?:(?<!\d)\+\d{6,15}(?!\d))"
)
_SSN_RE = re.compile(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)")
_CC_RE = re.compile(r"(?<!\d)\d{13,19}(?!\d)")
_API_KEY_RE = re.compile(r"\b(sk|pk|rk|tok|key)_(test_|live_)?[A-Za-z0-9]{20,}\b")
_STRIPE_RE = re.compile(r"\b(sk|pk|rk|whsec)_(test|live)_[A-Za-z0-9]{16,}\b")
_GOOGLE_API_KEY_RE = re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}\b")
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b")
_SA_RE = re.compile(
    r'"type"\s*:\s*"service_account"|"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----',
    re.I,
)
_BEARER_RE = re.compile(r"Bearer\s+[A-Za-z0-9_\-\.]{20,}", re.I)
_OPENAI_RE = re.compile(r"\bsk-(?:[A-Za-z0-9]+-)*[A-Za-z0-9]{20,}\b")
_AWS_AKID_RE = re.compile(r"\bAKIA[0-9A-Z]{16}\b")


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _luhn(number: str) -> bool:
    """Luhn checksum — used to filter out random 13–19 digit strings."""
    digits = [int(c) for c in number if c.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    checksum = 0
    parity = len(digits) % 2
    for i, d in enumerate(digits):
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


def _replace_cc(match: re.Match[str]) -> str:
    return "[card]" if _luhn(match.group(0)) else match.group(0)


# ─── Public API ──────────────────────────────────────────────────────────────


def scrub(text: str | None) -> str:
    """Apply all redaction passes to ``text``. Returns same string if input is None or empty."""
    if not text:
        return text or ""
    s = text
    # Most specific keys first to avoid double-matching by generic API_KEY rule
    s = _SA_RE.sub("[sa-json]", s)
    s = _JWT_RE.sub("[jwt]", s)
    s = _STRIPE_RE.sub("[stripe-key]", s)
    s = _OPENAI_RE.sub("[apikey]", s)
    s = _GOOGLE_API_KEY_RE.sub("[apikey]", s)
    s = _AWS_AKID_RE.sub("[apikey]", s)
    s = _API_KEY_RE.sub("[apikey]", s)
    s = _BEARER_RE.sub("Bearer [token]", s)
    s = _EMAIL_RE.sub("[email]", s)
    s = _PHONE_RE.sub("[phone]", s)
    s = _SSN_RE.sub("[ssn]", s)
    s = _CC_RE.sub(_replace_cc, s)
    return s


def scrub_dict(d: dict[str, Any]) -> dict[str, Any]:
    """Deep-walk dict and scrub every string leaf. Lists, tuples, sets recurse."""
    return _scrub_any(d)  # type: ignore[return-value]


def _scrub_any(o: Any) -> Any:
    if isinstance(o, str):
        return scrub(o)
    if isinstance(o, dict):
        return {k: _scrub_any(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_scrub_any(v) for v in o]
    if isinstance(o, tuple):
        return tuple(_scrub_any(v) for v in o)
    if isinstance(o, set):
        return {_scrub_any(v) for v in o}
    return o


def hash_for_log(text: str | None) -> str:
    """Short sha256 prefix for log correlation. Empty input → ``-``."""
    if not text:
        return "-"
    h = hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()
    return h[:12]


__all__ = ["hash_for_log", "scrub", "scrub_dict"]
