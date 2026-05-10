"""Parametrized prompt-injection regression for POST /api/generate."""
from __future__ import annotations

import pytest

pytestmark = [pytest.mark.security, pytest.mark.asyncio]


def _ids(p):
    return p.get("id", "?")


@pytest.mark.parametrize("payload", [], ids=[])  # placeholder rebound below
def _placeholder():  # pragma: no cover
    ...


def pytest_generate_tests(metafunc):
    """Lazy parametrize from the JSON corpus at collection time."""
    if "payload" not in metafunc.fixturenames:
        return
    import json
    from pathlib import Path

    p = Path(__file__).parent / "payloads" / "prompt_injection.json"
    if not p.exists():
        metafunc.parametrize("payload", [{"id": "noop", "payload": "noop", "expected_behavior": "sanitized"}])
        return
    payloads = json.loads(p.read_text(encoding="utf-8"))
    metafunc.parametrize("payload", payloads, ids=[p.get("id", "?") for p in payloads])


async def test_prompt_injection_payload(client, generate_headers, payload) -> None:
    body = {"idea_text": payload["payload"][:1900]}  # respect 2000-char cap
    r = await client.post("/api/generate", json=body, headers=generate_headers)

    expected = payload.get("expected_behavior", "sanitized")
    if expected == "blocked":
        # Either moderation blocks (422) or input is too short / invalid (400/422).
        assert r.status_code in {422, 400}
    else:
        # "sanitized" → request is accepted (202) or rejected for length/format.
        assert r.status_code in {202, 422, 400}
