/**
 * Brand refiner — name candidates show availability badges, regen alt names,
 * palette swatches show contrast info, lock 2 colors and rebalance.
 */
import { test, expect } from "./fixtures";

test.describe("brand refiner", () => {
  test("name candidates show availability badges", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/brand`);

    const candidates = page.locator("[data-testid='name-candidate']");
    await expect(candidates.first()).toBeVisible();

    const first = candidates.first();
    await expect(first.locator("[data-testid='availability-badge']")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("regenerate alt names fetches a new set", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/brand`);

    const beforeText = await page.locator("[data-testid='name-candidate']").first().innerText();
    await page.getByRole("button", { name: /regenerate.*names/i }).click();
    await expect(page.locator("[data-testid='name-candidate']").first()).not.toHaveText(beforeText, {
      timeout: 30_000,
    });
  });

  test("palette swatches expose WCAG contrast", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/brand`);
    const swatch = page.locator("[data-testid='color-swatch']").first();
    await swatch.hover();
    await expect(swatch.locator("[data-contrast-on-white]")).toBeVisible();
  });

  test("lock two colors and rebalance", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/brand`);

    const swatches = page.locator("[data-testid='color-swatch']");
    await swatches.nth(0).getByRole("button", { name: /lock/i }).click();
    await swatches.nth(1).getByRole("button", { name: /lock/i }).click();
    await page.getByRole("button", { name: /rebalance/i }).click();

    await expect(page.locator("[data-rebalance-state='done']")).toBeVisible({ timeout: 20_000 });
  });
});
