"""Hard CLAUDE.md constraint: drive scope is drive.file ONLY — never the broad 'drive' scope."""
from __future__ import annotations

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.security


_BACKEND = Path(__file__).resolve().parents[2]


def test_no_full_drive_scope_in_backend() -> None:
    """Grep the backend tree for the forbidden full drive scope literal."""
    forbidden = re.compile(r"https://www\.googleapis\.com/auth/drive(?!\.)")  # not followed by .file/.metadata/etc.
    offenders: list[tuple[str, int, str]] = []

    for path in _BACKEND.rglob("*.py"):
        if "tests" in path.parts:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if forbidden.search(line):
                offenders.append((str(path), i, line.strip()))

    assert not offenders, f"forbidden 'drive' scope found: {offenders}"


def test_workspace_module_uses_drive_file() -> None:
    from services.google_workspace import SCOPES

    assert any(s.endswith("/auth/drive.file") for s in SCOPES)
    for s in SCOPES:
        assert not s.endswith("/auth/drive")
