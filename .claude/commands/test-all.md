---
name: test-all
description: Run scripts/test.sh and report coverage delta + summary.
argument-hint: [profile: fast|full|integration]
---

You are running the PROMETHEUS test suite.

## Process

1. **Profile** — defaults to `full` if not provided.
   - `fast` — backend pytest (no integration), frontend vitest only
   - `full` — fast + lint + typecheck + audit + golden regression
   - `integration` — full + `RUN_INTEGRATION=1` (real Gemini call on 1 golden idea; gated)

2. **Run.** Pass profile as the first arg:

   ```bash
   ./scripts/test.sh <profile>
   ```

3. **On completion**, report:
   - Total tests run / passed / failed
   - Backend coverage % (and delta vs. main if you can compute it)
   - Frontend coverage %
   - Any new mypy errors
   - Any new ruff issues
   - Pass/fail status of golden regression (if `full` or `integration`)

4. **On failure**:
   - Show the relevant failing test output (max 100 lines)
   - Identify the most likely root cause from output
   - Suggest the next debug step

## Coverage gates

- Backend: ≥ 70%
- Frontend hooks: ≥ 60%
- Coverage drop > 2pp on a PR is a P1 issue

## Speed expectations

- `fast`: 60–90 seconds
- `full`: 5–8 minutes
- `integration`: 8–12 minutes (depends on Gemini latency)

If `fast` takes > 2 min, surface the slowest 5 tests.
