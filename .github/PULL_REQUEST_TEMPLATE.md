<!--
  PROMETHEUS PR template.
  Edit BOTH the title (Conventional Commits style) AND the body before opening.
  Empty checkboxes are blocking.
-->

## Summary

<!-- 1–3 sentences: what changed and why. Don't list files; describe intent. -->

## Type of change
- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] test
- [ ] docs
- [ ] chore
- [ ] security
- [ ] perf
- [ ] build
- [ ] ci

## Test plan
- [ ] All new code has unit tests
- [ ] CI green (lint, typecheck, tests, audits)
- [ ] Coverage ≥ 70% backend / ≥ 60% frontend hooks
- [ ] Manual test on staging (if user-facing): _describe what you did_

## Schema + contract
- [ ] No agent schema changes — OR — schema changes are documented and TS mirror updated in same PR
- [ ] No prompt change — OR — `docs/PROMPT_REGISTRY.md` updated AND golden regression run
- [ ] No topology change — OR — `docs/ARCHITECTURE.md` updated in same PR
- [ ] No deploy change — OR — `docs/DEPLOYMENT.md` updated in same PR

## Security review (skip only if not applicable)
- [ ] No `service-account.json` paths anywhere (CLAUDE.md hard rule)
- [ ] OAuth scope `drive.file` only (no `drive`)
- [ ] No raw HTML/SVG to DOM without `nh3` (server) AND DOMPurify (client)
- [ ] All iframes have `sandbox="allow-forms"` only — no `allow-scripts`, no `allow-same-origin`
- [ ] No Gemini call for legal text (Termly/iubenda only)
- [ ] Every agent has `response_schema=...` set; no regex JSON repair
- [ ] All Pydantic models have `extra="forbid"` on critical fields
- [ ] `idea_text` hashed in logs; never raw
- [ ] No hardcoded secrets (gitleaks runs in CI; this is belt-and-suspenders)

## Performance
- [ ] No new p95 regression on baseline routes (`docs/PERF_BASELINES.md`)
- [ ] No new bundle size regression (frontend)
- [ ] If new external API call: caching strategy documented

## Rollout
- [ ] Behind a feature flag if user-visible
- [ ] If new infra resource (Firestore index, secret, IAM role): documented in `docs/DEPLOYMENT.md`
- [ ] Rollback plan: _what to do if this breaks prod_

## Related issues
<!-- Closes #123 — or — Refs #456 -->

---

🤖 Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
