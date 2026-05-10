---
name: context-prime
description: Prime context with PROMETHEUS_BLUEPRINT_V2.md + CLAUDE.md + git status + last 10 commits.
argument-hint: (no args)
---

You are priming context for a PROMETHEUS work session. Read these files in this exact order, then summarize.

## Files to read (in parallel)

1. `c:\Users\Dell\Desktop\Startup\CLAUDE.md` — hard constraints + conventions
2. `c:\Users\Dell\Desktop\Startup\PROMETHEUS_BLUEPRINT_V2.md` — full V2 master blueprint
3. `c:\Users\Dell\Desktop\Startup\PROMETHEUS_ROADMAP.md` — 6-month plan + KPIs

## Bash (in parallel with reads)

- `git status` — show what's currently uncommitted
- `git log -10 --oneline` — recent commit history
- `git branch --show-current` — current branch

## Optional reads (only if relevant to the user's next task)

- `c:\Users\Dell\Desktop\Startup\docs\ARCHITECTURE.md`
- `c:\Users\Dell\Desktop\Startup\docs\SECURITY.md`
- `c:\Users\Dell\Desktop\Startup\docs\PROMPT_REGISTRY.md`
- `c:\Users\Dell\Desktop\Startup\backend\agents\orchestrator.py`
- `c:\Users\Dell\Desktop\Startup\backend\agents\gates.py`
- `c:\Users\Dell\Desktop\Startup\backend\models\agent_schemas.py`

## Output (final message)

Print exactly:

```
PROMETHEUS context primed.

Branch:         <current branch>
Recent commits: <one line per commit>
Uncommitted:    <count of modified/new files>

Hard constraints (top 5 you must respect):
1. No service-account.json paths in Docker layers
2. drive.file scope only (never full drive)
3. All HTML/SVG via nh3 (server) + DOMPurify (client)
4. iframe sandbox="allow-forms" only
5. No Gemini call for legal text (Termly/iubenda only)

What's the task? I'll skim the most relevant files based on what you ask next.
```

Do NOT proactively read code files until the user states a task — context-prime is light by design.
