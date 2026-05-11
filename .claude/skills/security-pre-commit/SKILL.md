---
name: security-pre-commit
description: Pre-commit security checks — auto-invokes before any backend/frontend file is staged. Blocks service-account.json patterns, hardcoded secrets, raw HTML/SVG render without purify, iframe without sandbox, full drive scope, idea_text in logs, unbounded user input.
---

# Security pre-commit discipline

You are about to stage code in PROMETHEUS. Before doing so, run the checks below. ANY violation is a hard block: fix the issue, then re-stage; never bypass with `--no-verify`.

This file applies whenever you are staging:
- `backend/**/*.py`
- `frontend/src/**/*.{ts,tsx}`
- `infrastructure/*`
- `cloud_functions/*`
- `Dockerfile*`

## Hard-block checks (in order)

### C1. No `service-account.json` paths

```
grep -RIn 'service-account\.json\|service_account\.json' backend/Dockerfile* infrastructure/ scripts/ cloud_functions/
```
Any hit → BLOCK. Use Workload Identity Federation (`gcloud auth application-default login` for local; WIF for CI/prod).

### C2. No hardcoded secrets

```
gitleaks detect --staged --redact
```
Pattern hits (e.g. `sk_live_*`, `AKIA[A-Z0-9]{16}`, JWT triplet, GitHub `ghp_*` tokens) → BLOCK.

If you legitimately need to test against a fake-key shape, use a redactable pattern from `backend/tests/security/test_secret_pre_scrub.py` (e.g. `sk_test_REDACTED_FOR_TEST`).

### C3. No raw HTML/SVG render without purify

In frontend:
```
grep -RIn 'dangerouslySetInnerHTML' frontend/src/
```
Each hit MUST be paired with `purify.ts` import + `purify(html)` call on the same line or block. If not → BLOCK.

In backend:
```
grep -RIn 'innerHTML\|return.*<\(script\|iframe\|object\|embed\)' backend/agents/ backend/services/
```
Any hit → BLOCK. Agent outputs MUST go through `services/sanitization.py` before render.

### C4. iframe sandbox enforcement

```
grep -RIn 'sandbox=' frontend/src/ | grep -v 'sandbox="allow-forms"'
```
Any hit → BLOCK. Iframes MUST have exactly `sandbox="allow-forms"` (no extras: no `allow-scripts`, no `allow-same-origin`).

The `<Sandbox>` component in `frontend/src/components/Sandbox/` is the only blessed iframe wrapper.

### C5. Drive scope check

```
grep -RIn 'auth/drive[^.]\|"drive"' frontend/src/ backend/
```
Any hit (other than `drive.file`) → BLOCK. The OAuth scope is **`drive.file` only**.

### C6. `idea_text` in logs

```
grep -RIn 'log.*idea_text\b\|logger.*idea_text\b' backend/
```
Any hit (without `_hash` suffix) → BLOCK. Hash before log. Raw text only ever in Firestore (TTL 30d).

### C7. Unbounded user input

Look for Pydantic models on request bodies. Every `str` field that comes from a user MUST have `max_length=...`:

```
grep -RIn 'class.*Request.*BaseModel' backend/models/
```

Open each match; verify every `str` field has a bound. Common bounds:
- `idea_text` ≤ 2000
- `steering` ≤ 500
- `email` ≤ 320
- `name` ≤ 120

Unbounded → BLOCK with the recommended bound.

### C8. Pydantic version

```
grep -RIn 'from pydantic.v1\|pydantic\.v1' backend/
```
Any hit → BLOCK. Pydantic v2 only.

### C9. Gemini in legal codepath

```
grep -RIn 'gemini\|call_gemini' backend/services/legal_template_service.py backend/agents/legal_documents_agent.py
```
Any hit → BLOCK. Legal docs use Termly + iubenda only.

### C10. response_schema on every agent

```
for f in backend/agents/*_agent.py; do
  grep -q 'response_schema' "$f" || echo "BLOCK: $f missing response_schema"
done
```

### C11. Iframe + CSP at landing serve

If you edited landing-page response (`backend/api/deploy.py` or any Cloudflare Worker), confirm CSP header is set:

```
grep -RIn 'Content-Security-Policy\|csp_header' backend/services/cloudflare_service.py backend/api/deploy.py cloud_functions/
```
Missing CSP → BLOCK.

## Soft warnings (not blocking)

- `print(` in production code paths (`backend/agents/`, `backend/services/`, `backend/main.py`) → use `structlog`
- `console.log(` in frontend (allowed in `__tests__/` and `dev` routes only)
- `TODO` / `FIXME` without an issue link

## Process

When invoked (e.g. while you've just edited a file):

1. Identify which checks apply to the changed paths
2. Run each relevant check
3. Print a structured table of pass/fail
4. On any BLOCK, print:
   - File + line
   - Issue
   - Recommended fix (concrete diff)
5. Wait for user to fix; do not auto-stage
6. After fixes confirmed, the user proceeds with `git add` + commit (Conventional Commits + co-author trailer)

## Anti-patterns

- ❌ `# noqa: SECURITY` to suppress one of these checks. They are non-suppressible.
- ❌ `git commit --no-verify` to bypass pre-commit. Hard CLAUDE.md rule.
- ❌ "Just for local dev" hardcoded API keys. Use Secret Manager mock or `.env` (gitignored).
- ❌ Wrapping `dangerouslySetInnerHTML` in a try/catch as the "purify" — purify is `lib/purify.ts`.

## Reading order

1. `CLAUDE.md` — hard constraints
2. `docs/SECURITY.md` §3 (audit-finding → control map)
3. `docs/SECURITY_TESTS.md` — what each control's regression test asserts
