"""Shared fixtures for the PROMETHEUS security regression suite.

Inherits *all* parent fixtures (mock_gemini, mock_firestore, mock_services,
client, fake_auth_user, golden_ideas, in_memory_firestore) — DO NOT redefine
those. Adds:

* ``injection_payloads``     — loaded JSON corpus from
                              ``payloads/prompt_injection.json``.
* ``payloads_by_category``   — same corpus grouped by ``category``.
* ``generate_headers``       — builds Bearer + Idempotency-Key headers a test
                              can drop into client.post().

We register the ``@pytest.mark.security`` marker here so ``pytest -m security``
collects the entire subtree.
"""
from __future__ import annotations

import json
import secrets
from collections import defaultdict
from pathlib import Path
from typing import Any

import pytest


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "security: prompt-injection / abuse / sanitization regression tests",
    )


_PAYLOAD_PATH = Path(__file__).parent / "payloads" / "prompt_injection.json"


@pytest.fixture(scope="session")
def injection_payloads() -> list[dict[str, Any]]:
    if not _PAYLOAD_PATH.exists():
        return []
    return json.loads(_PAYLOAD_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def payloads_by_category(injection_payloads: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    by_cat: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in injection_payloads:
        by_cat[p["category"]].append(p)
    return dict(by_cat)


@pytest.fixture
def generate_headers() -> dict[str, str]:
    return {
        "authorization": "Bearer test.session.jwt",
        "idempotency-key": f"sec-test-{secrets.token_urlsafe(12)}",
        "content-type": "application/json",
        "x-request-id": f"req_sec_{secrets.token_hex(6)}",
    }


@pytest.fixture
def block_moderation(monkeypatch: pytest.MonkeyPatch):
    """Force moderation_service.pre_filter_input to BLOCK every input."""
    from services import moderation_service

    class _Blocked:
        def __init__(self, *, categories: list[str]) -> None:
            self.allowed = False
            self.decision = "block"
            self.categories = categories
            self.reasons = [f"forced_block:{c}" for c in categories]

    async def _pre(_text: str):
        return _Blocked(categories=["weapons", "fraud"])

    monkeypatch.setattr(moderation_service, "pre_filter_input", _pre, raising=False)
