/**
 * Cmd-K palette — open with shortcut, search, execute action, palette closes.
 */
import { test, expect } from "./fixtures";

test.describe("command palette", () => {
  test("open via shortcut → search → execute deploy", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}`);

    // Cmd-K (or Ctrl-K on linux/win).
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+K" : "Control+K");

    const palette = page.getByRole("dialog", { name: /command/i });
    await expect(palette).toBeVisible();

    const input = palette.getByRole("combobox").or(palette.getByRole("searchbox"));
    await input.fill("deploy");

    const item = palette.getByRole("option", { name: /deploy.*landing/i });
    await expect(item).toBeVisible();
    await item.click();

    await expect(palette).not.toBeVisible();
  });

  test("escape closes the palette", async ({ page, authedUser, signInOnPage }) => {
    await signInOnPage(page, authedUser);
    await page.goto("/");
    await page.keyboard.press("Control+K");
    await expect(page.getByRole("dialog", { name: /command/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /command/i })).not.toBeVisible();
  });
});
