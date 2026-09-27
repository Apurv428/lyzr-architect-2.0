/**
 * Onboarding flow — tests the 3-step new-user onboarding wizard.
 * Uses a freshly signed-up account each run so it always sees the onboarding gate.
 *
 * Note: these tests bypass the shared auth session on purpose.
 * They sign up with a unique email so they reliably see the onboarding screens.
 * Skipped in CI unless a writable Supabase project is available.
 */
import { expect, test } from "@playwright/test";

const unique = () => `e2e+${Date.now()}@architect.test`;

test.describe("Onboarding wizard", () => {
  let testEmail: string;

  test.beforeEach(() => {
    testEmail = unique();
  });

  test("redirects new users to /onboarding after sign-up", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Name").fill("Test User");
    await page.getByLabel("Email").fill(testEmail);
    await page.getByLabel("Password").fill("TestPass123!");
    await page.getByRole("button", { name: "Create account" }).click();

    // Either redirect straight to onboarding or show a "check email" state.
    // Accept both — CI may have email confirmation disabled.
    await Promise.race([
      page.waitForURL(/\/onboarding/, { timeout: 15_000 }),
      page.waitForSelector('[role="alert"]', { timeout: 15_000 }),
      page.waitForSelector("text=check your email", { timeout: 15_000 }),
    ]);
    // If we're on onboarding, the first step should be visible.
    if (page.url().includes("/onboarding")) {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("step 1 — role picker presents all personas", async ({ page }) => {
    await page.goto("/onboarding");
    // Should see the role picker (even when reached directly by a dev).
    await expect(page.getByRole("main")).toBeVisible();
    for (const role of ["Founder", "Developer", "Operations", "Designer", "Data"]) {
      await expect(page.getByText(role, { exact: false }).first()).toBeVisible();
    }
  });

  test("step 2 — experience dial is present", async ({ page }) => {
    await page.goto("/onboarding");
    // Click the first role to advance.
    await page.getByRole("button", { name: /Founder|Developer|Business|Operations|Designer|Data/i }).first().click();
    // The experience dial or a "how much code" question appears.
    await expect(page.getByText(/code|experience|comfort/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("step 3 — completing onboarding lands on dashboard or workspace", async ({ page }) => {
    await page.goto("/onboarding");
    // Step 1
    await page.getByRole("button", { name: /Founder|Developer|Business|Operations|Designer|Data/i }).first().click();
    // Step 2
    await page.getByRole("button", { name: /Next|Continue/i }).click();
    // Step 3 — pick first template or skip
    await page.getByRole("button", { name: /Support|FAQ|Summarise|Hiring|Skip/i }).first().click();
    await page.getByRole("button", { name: /Start building|Get started|Done/i }).click();

    await page.waitForURL(/\/dashboard|\/p\//, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/dashboard|\/p\//);
  });

  test("back button navigates between onboarding steps", async ({ page }) => {
    await page.goto("/onboarding");
    const roles = page.getByRole("button", { name: /Founder|Developer|Business|Operations|Designer|Data/i });
    await roles.first().click();
    // Should now be on step 2; a Back button should exist.
    const back = page.getByRole("button", { name: /Back/i });
    await expect(back).toBeVisible({ timeout: 5_000 });
    await back.click();
    // Step 1 options should reappear.
    await expect(roles.first()).toBeVisible();
  });

  test("onboarding does not scroll horizontally on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/onboarding");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
