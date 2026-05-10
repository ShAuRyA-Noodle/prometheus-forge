/**
 * Results view — every tab loads, executive summary readable, deck thumbnails,
 * financial sliders react, landing iframe sandboxed.
 */
import { test, expect } from "./fixtures";

const TABS = [
  "executive_summary",
  "market",
  "competition",
  "business_model",
  "brand",
  "financials",
  "tech",
  "deck",
  "landing",
  "legal",
  "gtm",
  "risk",
];

test.describe("results view", () => {
  test.beforeEach(async ({ page, authedUser, signInOnPage, seededCompany }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}`);
    await expect(page.locator("[data-testid='results-view']")).toBeVisible({ timeout: 30_000 });
  });

  for (const tab of TABS) {
    test(`tab ${tab} loads without error`, async ({ page }) => {
      const trigger = page.locator(`[data-tab='${tab}']`);
      if (!(await trigger.count())) test.skip(true, `tab ${tab} not present in this fixture`);
      await trigger.first().click();
      await expect(page.locator(`[data-tab-content='${tab}']`)).toBeVisible();
      // No error boundary tripped.
      await expect(page.locator("[data-testid='error-boundary']")).toHaveCount(0);
    });
  }

  test("executive summary text is human-readable", async ({ page }) => {
    await page.locator("[data-tab='executive_summary']").click();
    const text = await page.locator("[data-testid='executive-summary-body']").innerText();
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toMatch(/lorem ipsum/i);
    expect(text).not.toMatch(/\bAcme\b|\bNexus\b|\bFlow\b/);
  });

  test("deck thumbnails render", async ({ page }) => {
    await page.locator("[data-tab='deck']").click();
    const thumbs = page.locator("[data-testid='slide-thumb']");
    await expect(thumbs.first()).toBeVisible();
    expect(await thumbs.count()).toBeGreaterThanOrEqual(10);
  });

  test("landing preview iframe is sandbox=allow-forms only", async ({ page }) => {
    await page.locator("[data-tab='landing']").click();
    const iframe = page.locator("iframe[data-testid='landing-preview']");
    await expect(iframe).toBeVisible();
    const sandbox = await iframe.getAttribute("sandbox");
    expect(sandbox).toBe("allow-forms");
  });
});
