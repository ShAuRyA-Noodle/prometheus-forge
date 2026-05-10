/**
 * Custom Playwright fixtures.
 *
 * `authedUser` — signs in via the dev-only `/api/_test/auth` endpoint that
 * mints a custom Firebase token; the page exchanges it via Firebase SDK and
 * stores the auth state so tests start authenticated.
 *
 * `seededCompany` — POSTs a fake company document via `/api/_test/seed` so
 * results-page tests don't need to wait for a full pipeline run.
 */
import { test as base, expect, type Page } from "@playwright/test";

export interface TestUser {
  uid: string;
  email: string;
  idToken: string;
  tier: "anonymous" | "free" | "pro" | "enterprise";
}

export interface SeededCompany {
  company_id: string;
  session_id: string;
  company_name: string;
}

export interface Fixtures {
  authedUser: TestUser;
  seededCompany: SeededCompany;
  /** Stub the Firebase SDK on the page so it picks up our injected idToken. */
  signInOnPage: (page: Page, user: TestUser) => Promise<void>;
}

const TEST_API_BASE = process.env["E2E_API_BASE"] ?? "http://localhost:8080";

/**
 * Creates a test user via the dev-only test endpoint.
 * The backend MUST guard this with `PROMETHEUS_TEST_MODE=1`.
 */
async function createTestUser(tier: TestUser["tier"] = "free"): Promise<TestUser> {
  const res = await fetch(`${TEST_API_BASE}/api/_test/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
  if (!res.ok) {
    throw new Error(`Test auth endpoint failed (${res.status}). Backend test mode enabled?`);
  }
  const json = (await res.json()) as TestUser;
  return json;
}

async function seedCompany(uid: string): Promise<SeededCompany> {
  const res = await fetch(`${TEST_API_BASE}/api/_test/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uid,
      idea_text: "An AI co-pilot for indie game studios that turns Figma boards into playable prototypes.",
      industry: "ai_ml",
      product_type: "saas",
    }),
  });
  if (!res.ok) {
    throw new Error(`Test seed endpoint failed (${res.status})`);
  }
  return (await res.json()) as SeededCompany;
}

export const test = base.extend<Fixtures>({
  authedUser: async ({}, use) => {
    const user = await createTestUser("free");
    await use(user);
  },

  seededCompany: async ({ authedUser }, use) => {
    const company = await seedCompany(authedUser.uid);
    await use(company);
  },

  signInOnPage: async ({}, use) => {
    const sign = async (page: Page, user: TestUser) => {
      // Inject the idToken into localStorage in the same shape the auth
      // bootstrap expects, then reload.
      await page.addInitScript((u: TestUser) => {
        // The auth lib reads `prometheus.test.idToken` when test mode is detected.
        window.localStorage.setItem("prometheus.test.idToken", u.idToken);
        window.localStorage.setItem("prometheus.test.uid", u.uid);
        (window as unknown as { __PROMETHEUS_TEST_USER__: TestUser }).__PROMETHEUS_TEST_USER__ = u;
      }, user);
    };
    await use(sign);
  },
});

export { expect };
