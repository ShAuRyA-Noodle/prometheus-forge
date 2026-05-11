---
name: test-driven
description: PROMETHEUS test-driven discipline — write the test before the implementation, mock external deps, hypothesis for property tests, vitest for hooks, no test bypass.
---

# Test-Driven Discipline

You are writing or modifying code in PROMETHEUS. Before you implement, you write a test. This is non-negotiable for non-trivial change.

This file applies whenever you are touching:
- `backend/agents/`, `backend/services/`, `backend/middleware/`, `backend/api/`
- `frontend/src/hooks/`, `frontend/src/lib/`, `frontend/src/components/`

## Hard rules

### R1. RED before GREEN

1. Write the failing test FIRST.
2. Run it. **Confirm it fails for the right reason** (not syntax error, not import).
3. Only then write the minimum implementation.
4. Run again. Confirm GREEN.
5. Refactor with tests green; re-run after each refactor.

### R2. Mock external deps; never call live APIs in unit tests

| Dependency | Mock |
|---|---|
| Gemini | `AsyncMock` returning a Pydantic instance matching `response_schema` |
| Vertex Safety | `AsyncMock` returning `{"blocked": False}` or test categories |
| Imagen | `AsyncMock` returning a stub URL + cache hit |
| USPTO | `AsyncMock` with seeded conflict / no-conflict results |
| Domainr | `AsyncMock` with seeded availability |
| Crunchbase | `AsyncMock` with cached fixture |
| Stripe | use `stripe.WebhookSignature` test mode + fixture events |
| Workspace | `AsyncMock` returning fake doc IDs |
| Firestore | `firebase-mock` or in-memory `MockFirestoreClient` from `tests/conftest.py` |
| Cloud Tasks | `AsyncMock` returning fake task name |

Live API tests live in `backend/tests/test_e2e_pipeline.py`, gated by `RUN_INTEGRATION=1` and run only nightly.

### R3. Hypothesis for property tests

For:
- `services/finance_engine.py` — reconciliation invariants
- `services/sanitization.py` — purify never lets through `<script>`, `<iframe>`, `on*` handlers
- `models/agent_schemas.py` — schema round-trip
- Idempotency-key handler — same key always yields same session_id

Use `hypothesis` strategies on Pydantic models:

```python
from hypothesis import given, strategies as st
from pydantic_hypothesis import st_from_pydantic_model

@given(st_from_pydantic_model(FinancialAssumptions))
def test_reconciliation(assumptions):
    result = run_engine(assumptions)
    if result.reconciliation_passed:
        for q in result.quarters:
            assert abs(q.revenue - q.users * q.arpu) < 0.01
```

### R4. Vitest for frontend hooks + components

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { useGenerate } from '../useGenerate';

it('returns session_id on success', async () => {
  const { result } = renderHook(() => useGenerate());
  // ... fire mutation, await result, assert
});
```

For components: `@testing-library/react` + `@testing-library/jest-dom`. Test by **role** and **accessible name**, not by class name.

### R5. Coverage gates

- Backend: ≥ 70% on `backend/`
- Frontend hooks: ≥ 60% on `frontend/src/hooks/`
- Frontend components: aim for 50%+ but not gated (visual / e2e via Playwright covers)
- Coverage drop > 2pp on a PR is a P1

### R6. No test bypass

- ❌ `pytest.mark.skip("flaky")` without an open issue link in the marker reason
- ❌ `it.skip(...)` without an issue link
- ❌ `--no-verify` to skip pre-commit hooks
- ❌ Try/except around the assertion to "fix" a flaky test

If a test is flaky:
1. Open a P2 issue
2. Mark with `@pytest.mark.skip(reason="flaky; see #123")`
3. Time-box: 7 days to fix or remove

### R7. Test naming

- `test_<what>_<scenario>_<expected_behavior>` — example: `test_idempotency_replay_returns_existing_session`
- One assertion concept per test (multiple lines OK if same concept)
- Group fixtures in `conftest.py` per directory; do not over-share

### R8. Golden regression as integration smoke

- 50 golden ideas in `backend/tests/golden/ideas.json`
- Each has expected_industry, expected_geography, max_cost_usd, min_coherence_score
- Nightly run on mocked Gemini; PR run on prompt or agent change
- A failing golden is not a test bug — it's a real regression. Fix the agent or revert the prompt.

### R9. Security regression tests

For every V1 audit finding (1-31), there's a regression test in `backend/tests/security/`. New audit findings = new regression tests. PR adding a new finding without a test → BLOCK.

### R10. Chaos tests gated

- `RUN_CHAOS=1 pytest backend/tests/chaos/` — fault injection
- Run nightly via `.github/workflows/security-regression.yml`
- Each external dependency has at least 1 failure-injection test

## Anti-patterns

- ❌ "I'll add the test after I prove it works." NO — TDD inverts this. Write the test that proves it works.
- ❌ Excessively-long fixtures. If your test setup is > 20 lines, break it into helpers.
- ❌ Testing implementation details (private methods, internal state). Test behavior at the contract.
- ❌ Snapshot tests on agent outputs. Outputs are LLM-generated and non-deterministic; snapshots are wrong here. Schema validation + property tests.
- ❌ Skipping a test because "the framework is hard to mock." Add a fixture in `conftest.py`; lift the cost once.

## When you write code

You MUST also:
1. Have written the failing test before the implementation
2. Use AsyncMock for any external API
3. Use hypothesis for any code with mathematical/structural invariants
4. Verify coverage didn't drop > 2pp
5. If touching security, add a regression test in `backend/tests/security/`

## Reading order

1. `CLAUDE.md` — testing section
2. `backend/tests/conftest.py` — shared fixtures
3. The directory's existing tests for style consistency
4. `docs/SECURITY_TESTS.md` — security test catalog
