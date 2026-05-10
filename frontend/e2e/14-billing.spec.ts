/**
 * Billing — visit /billing, upgrade flow opens Stripe Checkout (mocked in test
 * mode to redirect back with ?session_id=mock_xyz&tier=pro), confirm tier.
 */
import { test, expect } from "./fixtures";

test.describe("billing", () => {
  test("upgrade flow shows new tier", async ({ page, authedUser, signInOnPage }) => {
    await signInOnPage(page, authedUser);
    await page.goto("/billing");
    await expect(page.locator("[data-testid='billing-page']")).toBeVisible();

    // The test backend mocks Stripe; clicking returns to /billing?upgrade=success.
    await page.getByRole("button", { name: /upgrade.*pro/i }).click();

    // In real Stripe, we'd be on stripe.com — in test mode the backend
    // returns a redirect to /billing/return?tier=pro.
    await expect(page).toHaveURL(/\/billing(\/return)?\?.*tier=pro/, { timeout: 30_000 });
    await expect(page.locator("[data-testid='active-tier']")).toContainText(/pro/i);
  });

  test("billing portal link is reachable", async ({ page, authedUser, signInOnPage }) => {
    await signInOnPage(page, authedUser);
    await page.goto("/billing");
    const portal = page.getByRole("link", { name: /manage subscription|portal/i });
    await expect(portal).toBeVisible();
  });
});
