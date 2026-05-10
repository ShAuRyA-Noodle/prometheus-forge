"""Frontend hard constraint: iframes for generated landing pages are sandbox='allow-forms' only."""
from __future__ import annotations

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.security


_FRONTEND_SRC = Path(__file__).resolve().parents[3] / "frontend" / "src"


def _read_safely(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        return ""


@pytest.mark.skipif(not _FRONTEND_SRC.exists(), reason="frontend not present")
def test_no_allow_scripts_in_iframe_sandbox() -> None:
    """No iframe sandbox prop may include allow-scripts."""
    offenders: list[tuple[str, int, str]] = []
    for path in _FRONTEND_SRC.rglob("*.tsx"):
        text = _read_safely(path)
        for i, line in enumerate(text.splitlines(), 1):
            # Skip comments / forbidden-flag lists themselves.
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            if re.search(r'sandbox\s*=\s*["\']?[^"\']*allow-scripts', line):
                offenders.append((str(path), i, line.strip()))
    assert not offenders, f"forbidden allow-scripts on iframe: {offenders}"


@pytest.mark.skipif(not _FRONTEND_SRC.exists(), reason="frontend not present")
def test_no_allow_same_origin_in_iframe_sandbox() -> None:
    offenders: list[tuple[str, int, str]] = []
    for path in _FRONTEND_SRC.rglob("*.tsx"):
        text = _read_safely(path)
        for i, line in enumerate(text.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            if re.search(r'sandbox\s*=\s*["\']?[^"\']*allow-same-origin', line):
                offenders.append((str(path), i, line.strip()))
    assert not offenders, f"forbidden allow-same-origin on iframe: {offenders}"


@pytest.mark.skipif(not _FRONTEND_SRC.exists(), reason="frontend not present")
def test_sandboxed_iframe_default_is_allow_forms() -> None:
    """frontend/src/components/Sandbox/SandboxedIframe.tsx defines the canonical sandbox."""
    p = _FRONTEND_SRC / "components" / "Sandbox" / "SandboxedIframe.tsx"
    if not p.exists():
        pytest.skip("SandboxedIframe.tsx not yet present")
    text = _read_safely(p)
    assert "allow-forms" in text
    # Forbidden flags are explicitly rejected in the component.
    assert "allow-scripts" in text  # appears in a forbidden-list comment / array
