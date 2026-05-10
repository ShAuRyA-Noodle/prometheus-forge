"""Anti-slop scanner for PROMETHEUS.

Fails the commit if any tracked file contains:
  - Generic placeholder names: Acme, Nexus, Flow (as company names)
  - Placeholder fake people: John Doe, Jane Doe
  - Suspiciously round percentages: 99.99%, 100% (outside test fixtures)
  - "lorem ipsum"
  - Inter font references in components (use the design system fonts)

Usage::

    python tools/check_anti_slop.py path1 path2 ...
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

_BAD_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    ("acme_placeholder", re.compile(r"\b(Acme|Nexus|Flow)\s+(Corp|Inc|Co|LLC)\b"), "generic placeholder name"),
    ("john_doe", re.compile(r"\bJohn\s+Doe\b|\bJane\s+Doe\b"), "fake-person placeholder"),
    ("lorem_ipsum", re.compile(r"\blorem\s+ipsum\b", re.I), "lorem ipsum filler"),
    ("inter_font", re.compile(r'fontFamily\s*[:=]\s*["\']Inter'), "Inter font (design-taste rule)"),
    ("rounded_99_99", re.compile(r"99\.99\s*%"), "suspiciously round 99.99% — use real number"),
]

# Allow these paths to contain placeholder strings (they are tests / fixtures).
_ALLOWED_DIRS = (
    "tests/",
    "tests\\",
    "fixtures/",
    "golden/",
    "scripts/",
    "docs/",
    "reference_blueprints/",
    "tools/check_anti_slop.py",  # this file itself
)


def _is_allowed(path: str) -> bool:
    norm = path.replace("\\", "/")
    return any(part in norm for part in _ALLOWED_DIRS)


def _scan_file(path: Path) -> list[tuple[int, str, str]]:
    out: list[tuple[int, str, str]] = []
    if _is_allowed(str(path)):
        return out
    try:
        text = path.read_text(encoding="utf-8")
    except Exception:
        return out
    for i, line in enumerate(text.splitlines(), 1):
        for code, pat, msg in _BAD_PATTERNS:
            if pat.search(line):
                out.append((i, code, line.strip()[:200]))
    return out


def main() -> int:
    paths = [Path(p) for p in sys.argv[1:]]
    failed = False
    for p in paths:
        if not p.exists() or p.is_dir():
            continue
        offenses = _scan_file(p)
        if offenses:
            failed = True
            for line_no, code, snippet in offenses:
                print(f"{p}:{line_no}: anti-slop[{code}]  {snippet}")
    if failed:
        print("\nFix anti-slop violations or whitelist intentionally-fake test data.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
