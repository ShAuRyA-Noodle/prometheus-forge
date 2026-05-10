---
name: tdd
description: RED-GREEN-REFACTOR — write test first, then minimum code, then clean up.
argument-hint: <feature description>
---

You are practicing TDD on PROMETHEUS. The user described what they want; you will follow strict RED-GREEN-REFACTOR.

## RED — write the failing test first

1. Find the right test file (`backend/tests/test_<area>/` or `frontend/src/__tests__/`).
2. Write **a single failing test** that describes the desired behavior.
3. Use real types (Pydantic models, TS interfaces). No `any`.
4. Run the test. **Confirm it fails for the right reason** (not a syntax error or missing import).
5. Show the user the failure output.

## GREEN — minimum code to pass

1. Write the minimum code to make the test pass.
2. Do NOT add other tests. Do NOT add other behavior.
3. Run the test. **Confirm it passes.**
4. Run the broader test suite. **Confirm nothing else broke.**

## REFACTOR — clean up

1. With tests green, refactor for clarity, naming, type-safety, simplicity.
2. After every refactor, re-run the test suite.
3. If a refactor breaks tests, revert immediately and try a smaller step.

## Stop conditions

- After GREEN if the user said "just one test"
- After REFACTOR if the test suite is fully clean
- If you find an unexpected coupling, surface it; don't paper over

## Anti-patterns to avoid

- Writing the implementation before the test ("I'll just write a quick test next") — STOP, write the test first
- Writing 5 tests at once — focus, one at a time
- Skipping the failing-for-the-right-reason check
- Changing the test to make it pass (test smell — fix the implementation, not the test)
- Refactoring with red tests — go back to green first

## PROMETHEUS-specific rules

- For agent tests: mock `gemini_client.call_gemini_structured` with `AsyncMock`; do NOT make real API calls
- For schema tests: use Pydantic v2 `.model_validate()`; never v1 `parse_obj`
- For frontend hook tests: `@testing-library/react-hooks` (or `renderHook` from `@testing-library/react`)
- For finance engine: hypothesis property tests (invariants); never just example tests
- For sanitization: assert specific bypassed payloads (`<script>`, `<iframe>`, `onerror=`, etc.)
