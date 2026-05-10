---
name: audit
description: Superpowers code review on the diff (security, schema, taste, perf, docs). Use before opening a PR.
argument-hint: [diff range, defaults to HEAD vs. main]
---

You are running an audit on the current diff. The user will fix what you find before opening the PR.

## Process

1. **Compute the diff** (Bash):
   - Default range: `git diff origin/main..HEAD`
   - If user passes a range, use it
   - List changed files: `git diff --name-only origin/main..HEAD`

2. **Categorize** the changed files:
   - Backend agents → security + schema + prompt registry
   - Backend services → security + perf + tests
   - Backend middleware → security + idempotency + cost
   - Backend models → schema invariants + TS mirror
   - Frontend components → taste + a11y + sandbox + purify
   - Frontend hooks → SSE + auth + idempotency-key
   - Infrastructure → security (no SA json) + Cloud Armor + IAM
   - Prompts → version bump + golden regression
   - Docs → consistency with CLAUDE.md hard constraints

3. **For each category, run targeted checks**. Read the changed file fully (Read tool). Then evaluate against the rules below.

### Security checks (must pass)
- [ ] No `service-account.json` paths anywhere in code or Docker
- [ ] OAuth scope only `drive.file` (search: `auth/drive` should be 0 hits except `drive.file`)
- [ ] No raw HTML/SVG to DOM without `nh3.clean()` (server) AND `purify.ts` (client)
- [ ] All iframes `sandbox="allow-forms"` only (NO `allow-scripts`, NO `allow-same-origin`)
- [ ] No Gemini call in `legal_documents` codepath
- [ ] Every agent has `response_schema=`; no regex JSON repair
- [ ] All Pydantic models have `extra="forbid"` on critical fields
- [ ] `idea_text` hashed in logs; never raw
- [ ] No hardcoded keys (gitleaks pattern check)

### Schema checks
- [ ] Pydantic v2 (no v1 imports)
- [ ] No `dataclass` for I/O models
- [ ] Field length caps documented
- [ ] If schema added/changed: TS mirror in `frontend/src/types/agents.ts` updated
- [ ] If schema added/changed: golden ideas updated where relevant

### Taste / frontend (per `.claude/skills/taste-design-frontend`)
- [ ] No purple/blue gradient
- [ ] No Inter font
- [ ] No `h-screen` (use `min-h-[100dvh]`)
- [ ] No flex-math layout (use CSS Grid)
- [ ] Framer Motion springs `stiffness:100, damping:20`
- [ ] Animate transform + opacity only
- [ ] No "John Doe / 99.99% / Acme/Nexus/Flow" placeholder data
- [ ] All HTML/SVG via `lib/purify.ts`
- [ ] ARIA roles, names, focus

### Perf
- [ ] No new p95 regression risk on hot paths
- [ ] New external API call has caching strategy
- [ ] Bundle size: import-tree-shake-friendly (no full-package imports)

### Tests
- [ ] Coverage maintained (≥ 70% backend, ≥ 60% frontend)
- [ ] New code has unit tests
- [ ] Security-relevant change → security regression test added in `backend/tests/security/`

### Docs
- [ ] If topology changed: `docs/ARCHITECTURE.md` updated
- [ ] If prompt changed: `docs/PROMPT_REGISTRY.md` updated
- [ ] If deploy changed: `docs/DEPLOYMENT.md` updated
- [ ] If new audit finding closed: `docs/SECURITY.md` §3 updated

## Output (final message)

Print a structured audit table:

```
PROMETHEUS audit: <branch> @ <sha>

Changed files: <N>
Lines: +<add> / -<del>

| Category   | Issues | Notes |
|------------|--------|-------|
| Security   | <n>    | <key callouts> |
| Schema     | <n>    | |
| Taste      | <n>    | |
| Perf       | <n>    | |
| Tests      | <n>    | |
| Docs       | <n>    | |

## Blocking issues (P0/P1)
- ...

## Suggestions (P2/P3)
- ...

## Sign-off recommendation
GREEN | YELLOW (fix before merge) | RED (do not merge)
```

Be concise and concrete. Quote line numbers. Suggest exact fixes (file path + replacement snippet) when feasible.
