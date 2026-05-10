/**
 * Share link — generate token, open in incognito context, view-only deck loads,
 * watermark visible, no edit controls.
 */
import { test, expect } from "./fixtures";

test.describe("share link", () => {
  test("public share is read-only and watermarked", async ({
    page,
    browser,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/deck`);

    await page.getByRole("button", { name: /share/i }).click();
    const dialog = page.getByRole("dialog", { name: /share/i });
    await expect(dialog).toBeVisible();
    const link = await dialog
      .locator("input[type='text'], input[readonly]")
      .first()
      .inputValue();
    expect(link).toMatch(/\/share\/[A-Za-z0-9_-]+/);

    // Open in fresh incognito.
    const ctx = await browser.newContext();
    const incog = await ctx.newPage();
    await incog.goto(link);

    await expect(incog.locator("[data-testid='shared-deck']")).toBeVisible();
    await expect(incog.locator("[data-testid='watermark']")).toBeVisible();
    await expect(incog.getByRole("button", { name: /export/i })).toHaveCount(0);
    await expect(incog.getByRole("button", { name: /regenerate/i })).toHaveCount(0);

    await ctx.close();
  });
});
