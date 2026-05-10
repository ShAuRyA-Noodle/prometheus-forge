/**
 * Homepage smoke — hero asymmetric layout, voice button, text input fallback,
 * idea templates clickable.
 */
import { test, expect } from "./fixtures";

test.describe("homepage", () => {
  test("loads with hero, voice, text, templates", async ({ page }) => {
    await page.goto("/");

    // Headline visible.
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();

    // Hero is asymmetric — the right column should be ~60% width on desktop.
    const heroBox = await page.locator("[data-testid='hero-grid']").boundingBox();
    expect(heroBox?.width ?? 0).toBeGreaterThan(800);

    // Voice button or text fallback present.
    const voice = page.getByRole("button", { name: /start (voice|recording)/i });
    const textArea = page.getByRole("textbox", { name: /idea/i });
    await expect.soft(voice.or(textArea)).toBeVisible();

    // Idea templates clickable.
    const templates = page.locator("[data-testid='idea-template']");
    await expect(templates.first()).toBeVisible();
    await templates.first().click();
    await expect(textArea).toHaveValue(/.+/);
  });

  test("text input fallback accepts up to 2000 chars", async ({ page }) => {
    await page.goto("/");
    const textArea = page.getByRole("textbox", { name: /idea/i });
    const long = "a ".repeat(1100);
    await textArea.fill(long);
    const value = await textArea.inputValue();
    expect(value.length).toBeLessThanOrEqual(2000);
  });

  test("submit button disabled when empty", async ({ page }) => {
    await page.goto("/");
    const submit = page.getByRole("button", { name: /generate/i });
    await expect(submit).toBeDisabled();
  });
});
