/**
 * Generate flow — type idea, submit, watch progressive canvas + reasoning
 * sidebar populate, navigate to /results on completion.
 */
import { test, expect } from "./fixtures";

test.describe("generate flow", () => {
  test("submit idea → live canvas → results", async ({ page, authedUser, signInOnPage }) => {
    await signInOnPage(page, authedUser);
    await page.goto("/");

    const textArea = page.getByRole("textbox", { name: /idea/i });
    await textArea.fill(
      "A subscription marketplace where pet owners book on-demand mobile grooming with verified pros.",
    );
    await page.getByRole("button", { name: /generate/i }).click();

    // We land on /generate/:sessionId.
    await expect(page).toHaveURL(/\/generate\/[a-zA-Z0-9-]+/);

    // ProgressiveCanvas root rendered.
    await expect(page.locator("[data-testid='progressive-canvas']")).toBeVisible();

    // ReasoningSidebar appears and emits at least one event within 30s.
    const sidebar = page.locator("[data-testid='reasoning-sidebar']");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator("[data-testid='reasoning-event']").first()).toBeVisible({
      timeout: 30_000,
    });

    // AgentDashboard transitions agent state at least once (pending→running).
    const dashboard = page.locator("[data-testid='agent-dashboard']");
    await expect(dashboard).toBeVisible();
    await expect(
      dashboard.locator("[data-status='running'], [data-status='completed']").first(),
    ).toBeVisible({ timeout: 30_000 });

    // After completion, redirect to /results.
    await expect(page).toHaveURL(/\/results\/[a-zA-Z0-9-]+/, { timeout: 180_000 });
  });

  test("cancel session aborts pipeline", async ({ page, authedUser, signInOnPage }) => {
    await signInOnPage(page, authedUser);
    await page.goto("/");
    await page.getByRole("textbox", { name: /idea/i }).fill(
      "A drone-powered last-mile delivery network for rural villages.",
    );
    await page.getByRole("button", { name: /generate/i }).click();
    await expect(page).toHaveURL(/\/generate\//);

    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText(/canceled/i)).toBeVisible({ timeout: 15_000 });
  });
});
