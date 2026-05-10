/**
 * Playwright config — PROMETHEUS V2 e2e harness.
 *
 * Runs against a local dev frontend (vite preview) backed by a backend in
 * test-mode (`PROMETHEUS_TEST_MODE=1`). Test endpoints under `/api/_test/*`
 * mint anonymous Firebase tokens and seed company/session fixtures.
 *
 * Browsers covered:
 *  - chromium / firefox / webkit (desktop)
 *  - mobile-chrome (Pixel 5)
 *  - mobile-safari (iPhone 13)
 *
 * a11y tests use @axe-core/playwright (`npm i -D @axe-core/playwright`).
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";
const isCI = !!process.env["CI"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e/.report", open: "never" }],
    ...(isCI ? ([["github"]] as const) : []),
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "e2e/.artifacts",
  snapshotDir: "e2e/__snapshots__",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "dark",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: process.env["E2E_NO_WEBSERVER"]
    ? undefined
    : {
        command: "npm run preview -- --port 5173 --strictPort",
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});
