---
name: security-check
description: Full security scan — pip-audit + npm audit + semgrep + service-account.json check + iframe sandbox check + drive.file check + idea_text-in-logs check.
argument-hint: (no args)
---

You are running a full security scan on the PROMETHEUS repo. Run as much in parallel as possible. Report concisely.

## Process

Run all of these in parallel where dependencies allow.

### 1. Dependency audits (parallel)

```bash
# pip-audit on backend
cd backend && pip-audit -r requirements.txt --strict

# npm audit on frontend
cd frontend && npm audit --audit-level=high
```

### 2. Static scans (parallel)

```bash
# Semgrep OWASP Top 10
semgrep --config=p/owasp-top-ten --config=p/python --config=p/typescript --error backend frontend

# Trivy filesystem scan
trivy fs --severity HIGH,CRITICAL .

# gitleaks (history)
gitleaks detect --source=. --no-git --redact
```

### 3. Repo-specific custom checks (use Grep / Bash)

```bash
# 3a. No service-account.json paths in Docker/infra
grep -RIn "service-account.json\|GOOGLE_APPLICATION_CREDENTIALS=./" \
  backend/Dockerfile* infrastructure/ scripts/ \
  || echo "OK: no service-account.json paths"

# 3b. iframe sandbox: must be exactly "allow-forms"
grep -RIn 'sandbox=' frontend/src/ \
  | grep -v 'sandbox="allow-forms"' \
  && echo "FAIL: iframe with non-conforming sandbox" \
  || echo "OK: all iframes sandbox=allow-forms"

# 3c. drive scope check — only drive.file allowed
grep -RIn '"https://www.googleapis.com/auth/drive[^.]\|auth/drive$' frontend/ backend/ \
  && echo "FAIL: full drive scope detected" \
  || echo "OK: only drive.file scope used"

# 3d. idea_text in logs (must be hashed)
grep -RIn 'log.*idea_text[^_]\|logger.*idea_text[^_]' backend/ \
  && echo "FAIL: idea_text in log statement" \
  || echo "OK: idea_text never logged"

# 3e. Gemini call in legal codepath (must NEVER)
grep -RIn 'call_gemini\|gemini_client' backend/services/legal_template_service.py backend/agents/legal_documents_agent.py \
  && echo "FAIL: Gemini imported in legal codepath" \
  || echo "OK: legal docs use Termly/iubenda only"

# 3f. response_schema present on every agent
for agent in backend/agents/*_agent.py; do
  if ! grep -q "response_schema" "$agent"; then
    echo "FAIL: $agent missing response_schema"
  fi
done

# 3g. Pydantic v1 imports (must be 0)
grep -RIn 'from pydantic.v1\|import pydantic\.v1' backend/ \
  && echo "FAIL: pydantic v1 import" \
  || echo "OK: only pydantic v2"

# 3h. nh3 / DOMPurify on agent HTML rendering
grep -RIn 'dangerouslySetInnerHTML' frontend/src/ \
  | grep -v 'purify\|sanitiz' \
  && echo "FAIL: dangerouslySetInnerHTML without purify" \
  || echo "OK: all dangerouslySetInnerHTML wrapped"
```

### 4. Run security regression tests

```bash
cd backend && pytest tests/security tests/abuse -q --tb=short
```

## Output (final message)

Print a structured table:

```
PROMETHEUS security scan: <date>

| Check                       | Status |
|-----------------------------|--------|
| pip-audit                   | PASS / FAIL (n findings) |
| npm audit                   | PASS / FAIL |
| Semgrep                     | PASS / FAIL |
| Trivy fs                    | PASS / FAIL |
| gitleaks                    | PASS / FAIL |
| no service-account.json     | PASS / FAIL |
| iframe sandbox              | PASS / FAIL |
| drive.file scope only       | PASS / FAIL |
| idea_text never logged      | PASS / FAIL |
| no Gemini in legal codepath | PASS / FAIL |
| response_schema on agents   | PASS / FAIL |
| no pydantic v1              | PASS / FAIL |
| dangerouslySetInnerHTML purified | PASS / FAIL |
| security tests              | PASS / FAIL |
| abuse tests                 | PASS / FAIL |

## Findings (if any)

| File:Line | Issue | Severity | Fix |
|-----------|-------|----------|-----|
| ...       | ...   | ...      | ... |

## Sign-off
GREEN | YELLOW | RED
```

If RED: list the blocking findings + the recommended fix per item.
