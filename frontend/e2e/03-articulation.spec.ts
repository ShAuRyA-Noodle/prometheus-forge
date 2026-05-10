/**
 * Articulation — ambiguous idea triggers ArticulationStep modal, user accepts
 * polished version, generation continues.
 */
import { test, expect } from "./fixtures";

test.describe("articulation", () => {
  test("ambiguous idea opens modal and accepts polish", async ({
    page,
    authedUser,
    signInOnPage,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto("/");

    // Two-word idea triggers articulation in our pre-wave.
    await page.getByRole("textbox", { name: /idea/i }).fill("dating app");
    await page.getByRole("button", { name: /generate/i }).click();

    const modal = page.getByRole("dialog", { name: /clarify/i });
    await expect(modal).toBeVisible({ timeout: 15_000 });

    // Polished version is shown and editable.
    const polished = modal.getByRole("textbox", { name: /polished/i });
    await expect(polished).toHaveValue(/.{20,}/);

    await modal.getByRole("button", { name: /^continue|accept/i }).click();
    await expect(modal).not.toBeVisible();

    // Generation proceeds.
    await expect(page).toHaveURL(/\/generate\//);
  });

  test("can edit polished idea before accepting", async ({
    page,
    authedUser,
    signInOnPage,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto("/");
    await page.getByRole("textbox", { name: /idea/i }).fill("notes app for teams");
    await page.getByRole("button", { name: /generate/i }).click();

    const modal = page.getByRole("dialog", { name: /clarify/i });
    await expect(modal).toBeVisible({ timeout: 15_000 });

    const polished = modal.getByRole("textbox", { name: /polished/i });
    await polished.fill("A real-time collaborative notes app built for product engineers, with first-class API references.");
    await modal.getByRole("button", { name: /^continue|accept/i }).click();
    await expect(page).toHaveURL(/\/generate\//);
  });
});
