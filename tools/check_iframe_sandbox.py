"""Iframe sandbox check — generated landing-page iframes must be 'allow-forms' only.

Hard CLAUDE.md constraint: ``sandbox="allow-forms"`` only. ``allow-scripts`` and
``allow-same-origin`` are FORBIDDEN.

Usage::

    python tools/check_iframe_sandbox.py path1 path2 ...
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

_FORBIDDEN_RE = re.compile(
    r'sandbox\s*=\s*["\']?[^"\'>]*?(allow-scripts|allow-same-origin|allow-top-navigation)'
)
_COMMENT_RE = re.compile(r"^\s*(//|\*|/\*|#)")


def _scan(path: Path) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return out
    for i, line in enumerate(text.splitlines(), 1):
        if _COMMENT_RE.match(line):
            continue
        if _FORBIDDEN_RE.search(line):
            out.append((i, line.strip()[:200]))
    return out


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]]
    failed = False
    for p in paths:
        if not p.exists() or p.is_dir():
            continue
        s = str(p).replace("\\", "/")
        # Allow the SandboxedIframe component itself (defines forbidden flags array).
        if s.endswith("Sandbox/SandboxedIframe.tsx") or s.endswith(
            "Sandbox\\SandboxedIframe.tsx"
        ):
            continue
        if "tools/check_iframe_sandbox.py" in s:
            continue
        offenses = _scan(p)
        if offenses:
            failed = True
            for line_no, snippet in offenses:
                print(f"{p}:{line_no}: forbidden iframe sandbox flag: {snippet}")
    if failed:
        print(
            "\nGenerated landing-page iframes must use sandbox='allow-forms' only "
            "(hard CLAUDE.md constraint #4)."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
