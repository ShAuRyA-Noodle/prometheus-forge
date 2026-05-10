# PROMETHEUS frontend e2e

Playwright suites covering the full user journey, from idea-submission to
generation, results, deck/landing/finance editors, billing, GDPR, and a11y.

## Running

```bash
# 1) Install Playwright browsers (first time)
npx playwright install --with-deps

# 2) Make sure axe is installed (a11y tests)
npm i -D @axe-core/playwright

# 3) Backend in test mode + frontend dev/preview
PROMETHEUS_TEST_MODE=1 ./scripts/dev.sh   # spins backend on :8080
npm run build && npm run preview          # vite preview on :5173

# 4) Run all suites
npm run test:e2e

# Single project
npx playwright test --project=chromium

# Single file
npx playwright test e2e/02-generate-flow.spec.ts

# UI mode (great for local debugging)
npx playwright test --ui
```

## Required env

| Var | Default | Purpose |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost:5173` | Frontend URL |
| `E2E_API_BASE` | `http://localhost:8080` | Backend URL (used by fixtures only) |
| `E2E_NO_WEBSERVER` | unset | Set to `1` to skip Playwright auto-starting `vite preview` |
| `CI` | unset | When set, retries=2 and reporter=github is added |

## Test mode contract (backend)

These suites assume the backend exposes the following dev-only endpoints,
guarded by `PROMETHEUS_TEST_MODE=1`:

- `POST /api/_test/auth` → `{ uid, email, idToken, tier }` — mints a Firebase
  custom token for an anonymous test user.
- `POST /api/_test/seed` → `{ company_id, session_id, company_name }` — writes
  a deterministic completed session to Firestore so results-page tests don't
  need to wait for Gemini.
- `POST /api/billing/checkout` and `POST /api/deploy` are mocked to return
  immediately when test mode is active.

Outside test mode these endpoints **must 404**.

## Mock vs live mode

Default is mock-mode (no real Gemini calls; the seeded fixtures provide
deterministic agent outputs). To hit real backends, set
`PROMETHEUS_E2E_LIVE=1` and ensure the relevant API keys are present —
expect 90s+ per pipeline run and skip suites that depend on snapshot output.

## Conventions

- Use `[data-testid='…']` selectors for elements that have no semantic role.
- Prefer `getByRole`/`getByLabel` over CSS where possible.
- Network waits use `page.waitForResponse` not `waitForTimeout`.
- Keep specs <120 lines; large flows should be broken into multiple `test()`s.

## Reports

After a run, an HTML report lives at `e2e/.report/index.html`.
Failure traces and screenshots land in `e2e/.artifacts/`.
