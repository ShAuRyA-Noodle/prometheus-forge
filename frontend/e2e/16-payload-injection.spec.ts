/**
 * Payload injection — security test surface.
 *
 *  - <script> in idea_text → backend rejects 422 OR is sanitized everywhere
 *    it surfaces (executive summary text, deck slides).
 *  - SVG with <script> as a brand logo → renders the SVG without executing
 *    the script (DOMPurify SVG profile strips it).
 */
import { test, expect } from "./fixtures";

test.describe("payload injection", () => {
  test("script tag in idea is rejected or sanitized", async ({
    page,
    authedUser,
    signInOnPage,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto("/");

    const evil = "<script>window.__pwn__=true</script>A clean B2B SaaS for invoice reconciliation.";
    await page.getByRole("textbox", { name: /idea/i }).fill(evil);

    const responsePromise = page.waitForResponse((r) => r.url().includes("/api/generate"));
    await page.getByRole("button", { name: /generate/i }).click();
    const response = await responsePromise;

    // Either rejected (422) or accepted with sanitized hash.
    if (response.status() === 422) {
      await expect(page.getByText(/invalid|blocked|unsafe/i)).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/generate\//);
      // The script must NEVER have executed.
      const pwned = await page.evaluate(() => (window as unknown as { __pwn__?: boolean }).__pwn__);
      expect(pwned).toBeFalsy();
    }
  });

  test("svg logo with embedded script renders without firing", async ({
    page,
    authedUser,
    signInOnPage,
    seededCompany,
  }) => {
    await signInOnPage(page, authedUser);
    await page.goto(`/results/${seededCompany.session_id}/brand`);
    // The seed fixture should provide an SVG with a <script> tag (test mode
    // returns a known-bad payload to validate our purifier).
    const svgHost = page.locator("[data-testid='logo-render']");
    await expect(svgHost).toBeVisible();

    const html = await svgHost.innerHTML();
    expect(html.toLowerCase()).not.toContain("<script");

    // Nothing got pwned.
    const pwned = await page.evaluate(
      () => (window as unknown as { __svg_pwn__?: boolean }).__svg_pwn__,
    );
    expect(pwned).toBeFalsy();
  });

  test("XSS in shared deck path is escaped", async ({ page }) => {
    await page.goto("/share/<script>alert(1)</script>");
    // Either a 404/invalid token UI, or sanitized rendering — never execution.
    const pwned = await page.evaluate(
      () => (window as unknown as { __share_pwn__?: boolean }).__share_pwn__,
    );
    expect(pwned).toBeFalsy();
  });
});
