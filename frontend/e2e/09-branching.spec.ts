/**
 * Branching — branch from session with steering "target enterprise", view a
 * side-by-side compare.
 */
import { test, expect } from "./fixtures";

test.describe("branching", () => {
  test("create branch with steering and compare", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}`);

    await page.getByRole("button", { name: /^branch$/i }).click();
    const dialog = page.getByRole("dialog", { name: /branch/i });
    await expect(dialog).toBeVisible();

    const steering = dialog.getByRole("textbox", { name: /steering|prompt/i });
    await steering.fill("target enterprise");
    await dialog.getByRole("button", { name: /create branch/i }).click();

    // We navigate to the new branch run.
    await expect(page).toHaveURL(/\/generate\/[a-zA-Z0-9-]+/, { timeout: 15_000 });

    // After completion, open compare view.
    await expect(page).toHaveURL(/\/results\/[a-zA-Z0-9-]+/, { timeout: 180_000 });
    await page.getByRole("link", { name: /compare/i }).click();

    const left = page.locator("[data-testid='compare-left']");
    const right = page.locator("[data-testid='compare-right']");
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
  });
});
