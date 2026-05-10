"""PROMETHEUS security regression suite.

Every test in this package carries `@pytest.mark.security` so the suite can be
run alone via ``pytest -m security`` and gated as a CI nightly job.

Layout::

    payloads/                — JSON corpora of adversarial inputs
    test_prompt_injection_*  — black-box prompt-injection tests
    test_grounding_guard.py  — unit tests for grounding_guard envelope
"""
from __future__ import annotations
