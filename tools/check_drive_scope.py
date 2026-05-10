"""Drive scope check — backend code may NEVER request the broad 'drive' scope.

Hard CLAUDE.md constraint: only ``https://www.googleapis.com/auth/drive.file``
is permitted. Anything ending in ``/auth/drive`` (no suffix) is a violation.

Usage::

    python tools/check_drive_scope.py path1 path2 ...
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# Match the broad 'drive' scope but NOT drive.file / drive.metadata / drive.readonly.
_FORBIDDEN_RE = re.compile(r"https://www\.googleapis\.com/auth/drive(?!\.)")


def _scan(path: Path) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return out
    for i, line in enumerate(text.splitlines(), 1):
        if _FORBIDDEN_RE.search(line):
            out.append((i, line.strip()[:200]))
    return out


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]]
    failed = False
    for p in paths:
        if not p.exists() or p.is_dir():
            continue
        # Skip the check tool itself + tests that intentionally string-match.
        s = str(p).replace("\\", "/")
        if "tools/check_drive_scope.py" in s or "tests/security/" in s:
            continue
        offenses = _scan(p)
        if offenses:
            failed = True
            for line_no, snippet in offenses:
                print(f"{p}:{line_no}: forbidden full 'drive' scope: {snippet}")
    if failed:
        print("\nUse drive.file scope only (hard CLAUDE.md constraint #2).")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
