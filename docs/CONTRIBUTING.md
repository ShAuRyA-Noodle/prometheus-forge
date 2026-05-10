# Contributing to PROMETHEUS

Welcome. This document covers branching, commits, PRs, code review, and security disclosure.

## Branch strategy

- `main` is always green and deployable.
- Feature branches: `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`, `refactor/<short-name>`, `test/<short-name>`, `docs/<short-name>`, `security/<short-name>`.
- One PR per branch. Squash-merge into `main`.
- No force-push to `main` ever. Force-push to your own feature branch only when rebasing on `main`.
- Branches that are >7 days behind `main` get auto-rebased by CI (or fail to merge).

## Commits — Conventional Commits

Every commit subject is **Conventional Commits** style:

```
<type>(<optional scope>): <imperative summary>

<body — optional, why-not-what>

<trailers>
```

Allowed types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `security`, `perf`, `build`, `ci`.

Examples:
```
feat(brand-identity): swap to alternative on USPTO conflict
fix(idempotency): return 200 not 409 on identical replay
docs(security): map V1 audit finding 18 to control
test(finance-engine): hypothesis property — reconciliation invariants
ci(security-scan): add gitleaks to daily run
```

**Mandatory co-author trailer:**
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

(For human-only commits, drop the trailer.)

**Never bypass hooks.** No `--no-verify`. No `--no-gpg-sign`. CLAUDE.md hard rule. Hooks fail → fix the issue, re-stage, **new** commit (do not amend).

## PR template

Every PR uses `.github/PULL_REQUEST_TEMPLATE.md`. The check-box items there are not optional. CI gates on them where automatable.

Highlights:
- Tests pass (CI green)
- Schema unchanged or migration documented
- Security review for prompts / auth / iframe / OAuth code
- Docs updated (architecture / deployment / prompt registry as relevant)
- Golden regression passes (if `backend/agents/*` or `backend/prompts/*` changed)
- No `service-account.json` paths anywhere
- No `idea_text` in logs (verified by `security-pre-commit` skill)

## Review checklist

| Area | Check |
|---|---|
| **Schema** | Pydantic v2 only; no v1 imports; no `dataclass` for I/O; `extra="forbid"` on critical models |
| **Agents** | `response_schema` set; retry-once present; no regex JSON repair anywhere |
| **Gates** | Pydantic validation + safety + USPTO/WCAG checks present where required |
| **Sanitization** | Server-side `nh3.clean()` + client `lib/purify.ts` for any HTML/SVG |
| **Iframe** | `sandbox="allow-forms"` only — no `allow-scripts`, no `allow-same-origin` |
| **Legal** | No Gemini call for ToS/Privacy text; only Termly/iubenda |
| **OAuth** | `drive.file` scope; never full `drive` |
| **Idempotency** | `Idempotency-Key` required on `/api/generate`; new key handler is idempotent |
| **Cost** | Cost telemetry present per agent; budget cap enforced |
| **Logs** | `idea_text` hashed (never raw) |
| **Tests** | New code has tests; coverage gate ≥ 70% (backend), ≥ 60% (frontend hooks) |
| **Types** | `mypy --strict` clean (`backend/agents/`, `services/`, `models/`); `tsc --noEmit` clean |
| **Lint** | `ruff` + `eslint` clean |
| **Security scan** | `pip-audit`, `npm audit`, `semgrep`, `trivy`, `gitleaks` all green |
| **Docs** | If topology changed → ARCHITECTURE.md updated in same PR. If prompt changed → PROMPT_REGISTRY.md. If deploy changed → DEPLOYMENT.md. |

A PR that fails any of these gets a single comment listing what's missing — no nitpicking until the gates pass.

## Test requirements

- **Backend**: `pytest`, `pytest-asyncio`, `hypothesis` for properties.
  - Unit tests per agent (mock Gemini, assert schema)
  - Golden regression on `backend/tests/golden/ideas.json`
  - Security tests in `backend/tests/security/`
  - Abuse tests in `backend/tests/abuse/`
  - Chaos tests in `backend/tests/chaos/`
- **Frontend**: `vitest` for hooks/components, `playwright` for e2e.
- **Integration**: `RUN_INTEGRATION=1 pytest backend/tests/test_e2e_pipeline.py` — gated, not run by default.

Run locally: `./scripts/test.sh`. Format: `ruff format . && cd frontend && npm run format`.

## TDD culture

For non-trivial change, follow `.claude/commands/tdd.md`:
1. **RED** — write the failing test first
2. **GREEN** — minimum code to pass
3. **REFACTOR** — clean up; tests still green

The TDD discipline matters most for: orchestrator changes, gate logic, finance engine, sanitization, prompts (counter-test golden ideas).

## Security disclosure path

**Do not file a public issue for security bugs.** Email `security@prometheus.app` — see `docs/security.txt`. Acknowledgement within 24 hours; payouts per `docs/SECURITY.md`.

If you accidentally pushed a secret:
1. Rotate the secret immediately
2. Email `security@prometheus.app` with the commit SHA
3. We will force-push a history rewrite + rotate downstream tokens

## Code style

- **Python**: `ruff format`, `ruff check`, `mypy --strict` on `agents/`, `services/`, `models/`. `from __future__ import annotations` mandatory.
- **TypeScript**: `prettier`, `eslint`. TS 5 strict mode. No `any`. No `as` without explanation.

## Communication

- Issues for bugs / features / security (use templates).
- Discussions tab for design proposals (write up an `RFC` if substantial).
- Slack `#engineering` for active work; `#security` for security-only.

## Releases

We tag releases as `vMAJOR.MINOR.PATCH`. Major bumps for backwards-incompatible API changes. Releases are cut from `main` via `.claude/commands/release.md`. CD triggers on tag.

## Legal

By contributing, you agree your changes are licensed under the project's proprietary license (see `LICENSE`). For accepted external contributions, we'll request a CLA at PR-merge time.
