"""PII scrubber tests."""
from __future__ import annotations

import pytest


def test_scrub_email() -> None:
    from services.pii_scrubber import scrub

    out = scrub("Contact me at jane.doe@example.com for details")
    assert "jane.doe@example.com" not in out
    assert "[email]" in out


def test_scrub_us_phone() -> None:
    from services.pii_scrubber import scrub

    for phone in ["(415) 555-0123", "+1 415-555-0123", "415.555.0123"]:
        out = scrub(f"call me at {phone} please")
        assert phone not in out
        assert "[phone]" in out


def test_scrub_ssn() -> None:
    from services.pii_scrubber import scrub

    out = scrub("ssn 123-45-6789 here")
    assert "123-45-6789" not in out
    assert "[ssn]" in out


def test_scrub_credit_card_luhn_validated() -> None:
    from services.pii_scrubber import scrub

    valid_visa = "4111111111111111"  # Luhn-valid test number
    out = scrub(f"card={valid_visa} done")
    assert valid_visa not in out
    assert "[card]" in out


def test_scrub_credit_card_non_luhn_kept() -> None:
    from services.pii_scrubber import scrub

    bogus = "1234567890123456"  # not Luhn-valid
    out = scrub(f"id={bogus}")
    assert bogus in out  # kept; not a real card


def test_scrub_api_keys() -> None:
    from services.pii_scrubber import scrub

    cases = [
        "AIzaSy" + "X" * 33,  # Google API
        "sk-proj-" + "A" * 40,  # OpenAI-style
        "sk_live_" + "A" * 30,  # Stripe live
        "AKIAIOSFODNN7EXAMPLE",  # AWS
    ]
    for key in cases:
        out = scrub(f"key={key}")
        assert key not in out


def test_scrub_jwt() -> None:
    from services.pii_scrubber import scrub

    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abc123def456ghi"
    out = scrub(f"token={jwt}")
    assert jwt not in out
    assert "[jwt]" in out


def test_scrub_bearer_header() -> None:
    from services.pii_scrubber import scrub

    out = scrub("Authorization: Bearer abc123def456ghi789jkl")
    assert "abc123def456ghi789jkl" not in out


def test_scrub_service_account_json() -> None:
    from services.pii_scrubber import scrub

    sa = '{"type": "service_account", "project_id": "x"}'
    out = scrub(sa)
    assert "[sa-json]" in out


def test_hash_for_log_stable() -> None:
    from services.pii_scrubber import hash_for_log

    a = hash_for_log("hello")
    b = hash_for_log("hello")
    assert a == b
    assert len(a) == 12


def test_hash_for_log_empty() -> None:
    from services.pii_scrubber import hash_for_log

    assert hash_for_log("") == "-"
    assert hash_for_log(None) == "-"


def test_scrub_dict_recursive() -> None:
    from services.pii_scrubber import scrub_dict

    out = scrub_dict(
        {"email": "x@y.com", "nested": {"phone": "+14155550123"}, "list": ["bob@b.com"]}
    )
    assert "x@y.com" not in str(out)
    assert "+14155550123" not in str(out)
    assert "bob@b.com" not in str(out)
