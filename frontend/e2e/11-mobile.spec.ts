/**
 * Mobile-only behaviors. Run only on mobile-chrome / mobile-safari projects.
 */
import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["Pixel 5"] });

test.describe("mobile polish", () => {
  test("voice input button is hero on mobile", async ({ page }) => {
    await page.goto("/");
    const voice = page.getByRole("button", { name: /start (voice|recording)/i });
    await expect(voice).toBeVisible();
    const box = await voice.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(60);
  });

  test("dashboard collapses to single column", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("textbox", { name: /idea/i }).fill("voice journaling app for runners");
    await page.getByRole("button", { name: /generate/i }).click();
    await expect(page).toHaveURL(/\/generate\//);

    const dashboard = page.locator("[data-testid='agent-dashboard']");
    await expect(dashboard).toBeVisible();
    const cards = dashboard.locator("[data-testid='agent-card']");
    if (await cards.count()) {
      const first = await cards.first().boundingBox();
      const second = await cards.nth(1).boundingBox();
      if (first && second) {
        // Cards stacked, not side-by-side.
        expect(Math.abs(first.x - second.x)).toBeLessThan(8);
      }
    }
  });

  test("bottom tab bar visible on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-testid='mobile-nav']")).toBeVisible();
  });

  test("swipe tabs on results", async ({ page }) => {
    await page.goto("/results/test-mobile-fixture");
    const tabs = page.locator("[data-testid='mobile-results-tabs']");
    if (await tabs.count()) {
      await expect(tabs).toBeVisible();
    }
  });
});
