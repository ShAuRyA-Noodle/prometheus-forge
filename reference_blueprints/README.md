# Reference Blueprints

These are **reference architectures** pulled from another of Shaurya's repositories — `ShAuRyA-Noodle/Newspapering` — for the *grammar* they use to describe production-grade multi-agent systems. They are NOT PROMETHEUS code. They live here so Claude Code can reach them when the user asks for "the same kind of structure as NEXUS / SYMPHONY / SUPPLYMIND".

## What's here

| File | Source | What it shows |
|---|---|---|
| `NEXUS_BLUEPRINT.md` | [Newspapering main branch](https://github.com/ShAuRyA-Noodle/Newspapering/blob/main/NEXUS_BLUEPRINT.md) | Multi-agent newsroom with 11 agents; sequence diagrams; cost-per-run table; ASCII topology |
| `SYMPHONY_BLUEPRINT.md` | [Newspapering main branch](https://github.com/ShAuRyA-Noodle/Newspapering/blob/main/SYMPHONY_BLUEPRINT.md) | Real-time orchestration grammar; latency budget; gate insertion; pre-summarization |
| `SUPPLYMIND_PHASES.md` | [Newspapering main branch](https://github.com/ShAuRyA-Noodle/Newspapering/blob/main/SUPPLYMIND_PHASES.md) | Phased rollout grammar (M0 → M6) with KPI gates; "cut if behind" markers |

## Why we keep these

PROMETHEUS V2's blueprint follows the **same grammar**: tagline blockquote, dollar-anchored problem framing, ASCII topology, latency annotations, cost-per-run summary, comparison tables for tools/competitors, "cut if behind" markers in build plans, sprint structure. When you propose a new doc or adjust an existing one, **read these first** for the prose and structure conventions.

## How to fetch them

```bash
./scripts/fetch-reference-blueprints.sh
```

This script `curl`s the raw markdown from `raw.githubusercontent.com/ShAuRyA-Noodle/Newspapering/main/` and writes it to this folder. The files are intentionally NOT committed (they belong to that other repo) — `.gitignore` excludes them. Each engineer fetches locally as needed.

## When to fetch

- When starting a new doc and you want consistent voice / structure
- When you're stuck on how to describe a topology or KPI gate
- When CLAUDE.md and PROMETHEUS_BLUEPRINT_V2.md don't cover the situation

## Anti-pattern

- ❌ Copy-pasting verbatim from these blueprints into PROMETHEUS docs. They're reference; we have our own taglines, our own architecture, our own KPIs.
- ❌ Letting these blueprints become out-of-date relative to source. Re-run `fetch-reference-blueprints.sh` quarterly.
