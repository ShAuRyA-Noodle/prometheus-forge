/**
 * Deck editor — edit slide title via Tiptap, thumbnails update, regen via AI
 * rail, export PDF.
 */
import { test, expect } from "./fixtures";

test.describe("deck editor", () => {
  test("edit title → thumbnail updates", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/deck`);
    await expect(page.locator("[data-testid='deck-editor']")).toBeVisible();

    const firstThumb = page.locator("[data-testid='slide-thumb']").first();
    const before = (await firstThumb.innerText()).trim();

    const titleEditor = page
      .locator("[data-testid='slide-canvas']")
      .getByRole("textbox", { name: /title/i });
    await titleEditor.click();
    await titleEditor.press("Control+A");
    await titleEditor.press("Delete");
    await titleEditor.type("Reimagined Title For Test");

    await expect(firstThumb).not.toHaveText(before, { timeout: 10_000 });
    await expect(firstThumb).toContainText("Reimagined Title");
  });

  test("AI rail regenerates a slide", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/deck`);
    const rail = page.locator("[data-testid='ai-rail']");
    await expect(rail).toBeVisible();
    await rail.getByRole("button", { name: /regenerate/i }).click();

    // Pending state, then completion.
    await expect(rail.locator("[data-state='pending']")).toBeVisible();
    await expect(rail.locator("[data-state='complete']")).toBeVisible({ timeout: 60_000 });
  });

  test("export PDF triggers a download", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/deck`);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /export.*pdf/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
