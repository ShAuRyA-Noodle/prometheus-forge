/**
 * Financial model — drag CAC slider, projection chart updates, KeyMetricCards
 * reflect new values, reconciliation pass indicator visible.
 */
import { test, expect } from "./fixtures";

test.describe("financial model", () => {
  test("CAC slider updates projection + metrics", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/financials`);

    const cac = page.locator("[data-testid='slider-cac_usd']");
    await expect(cac).toBeVisible();

    // Initial Year-3 revenue value.
    const yr3 = page.locator("[data-testid='kpi-revenue-y3']");
    const before = (await yr3.innerText()).trim();

    // Drag the slider to ~80% of max via keyboard for determinism.
    await cac.focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");

    // Debounced recompute lands within 2s.
    await expect(yr3).not.toHaveText(before, { timeout: 5_000 });

    // Reconciliation pass indicator visible.
    await expect(page.locator("[data-testid='reconciliation-pass']")).toBeVisible();
  });

  test("scenario presets switch instantly", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/financials`);

    await page.getByRole("button", { name: /aggressive/i }).click();
    await expect(page.locator("[data-preset-active='aggressive']")).toBeVisible();

    await page.getByRole("button", { name: /conservative/i }).click();
    await expect(page.locator("[data-preset-active='conservative']")).toBeVisible();
  });
});
