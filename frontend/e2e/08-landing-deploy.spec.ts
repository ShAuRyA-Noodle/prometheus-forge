/**
 * Landing editor → deploy flow.
 *
 * The test backend mocks Cloudflare Pages so deploy returns a *.prometheus.app
 * URL synchronously.
 */
import { test, expect } from "./fixtures";

test.describe("landing deploy", () => {
  test("edit hero copy → deploy → live URL renders", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/landing`);
    await expect(page.locator("[data-testid='landing-editor']")).toBeVisible();

    // Edit hero copy.
    const heroEditable = page.locator("[data-section='hero'] [contenteditable='true']").first();
    await heroEditable.click();
    await heroEditable.press("Control+A");
    await heroEditable.press("Delete");
    await heroEditable.type("Reimagined hero copy for the e2e test.");

    // Deploy.
    await page.getByRole("button", { name: /^deploy$/i }).click();
    const deployedUrl = page.locator("[data-testid='deployed-url']");
    await expect(deployedUrl).toBeVisible({ timeout: 30_000 });
    await expect(deployedUrl).toHaveText(/\.prometheus\.app/);

    // Live URL renders.
    const live = await deployedUrl.getAttribute("href");
    if (live) {
      const r = await page.request.get(live);
      expect(r.status()).toBeLessThan(400);
      expect(await r.text()).toContain("Reimagined hero copy");
    }
  });
});
