/**
 * GDPR — request data export, delete account flows.
 */
import { test, expect } from "./fixtures";

test.describe("gdpr / privacy", () => {
  test("request data export downloads zip", async ({
    page,
    authedUser,
    signInOnPage,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto("/settings/privacy");
    await expect(page.locator("[data-testid='privacy-controls']")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /export.*data/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
  });

  test("delete account requires confirmation and signs out", async ({
    page,
    authedUser,
    signInOnPage,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto("/settings/privacy");
    await page.getByRole("button", { name: /delete account/i }).click();

    const dialog = page.getByRole("alertdialog", { name: /delete/i });
    await expect(dialog).toBeVisible();

    // Confirmation copy box.
    const confirm = dialog.getByRole("textbox", { name: /confirm/i });
    await confirm.fill("DELETE");
    await dialog.getByRole("button", { name: /delete forever/i }).click();

    // Redirect to homepage signed-out.
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
