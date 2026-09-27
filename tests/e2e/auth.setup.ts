/**
 * Runs once before all authenticated tests.
 * Strategy:
 *  1. Try to sign in with E2E_EMAIL / E2E_PASSWORD.
 *  2. If sign-in fails (wrong creds / no account), sign up instead.
 *  3. Complete onboarding if the account is fresh.
 *  4. Save browser storage state so every other spec skips the login screen.
 */
import { expect, test as setup } from "@playwright/test";
import { AUTH_FILE } from "../../playwright.config";

/** Credentials come from the environment only, so no real account ends up in the repo. */
function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} (a test account on your Supabase project) to run the signed-in e2e tests.`);
  return value;
}

const EMAIL = requiredEnv("E2E_EMAIL");
const PASSWORD = requiredEnv("E2E_PASSWORD");

async function trySignIn(page: import("@playwright/test").Page): Promise<boolean> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for either a redirect (success) or an error alert (failure).
  const result = await Promise.race([
    page.waitForURL(/\/(onboarding|dashboard|p\/)/, { timeout: 10_000 }).then(() => "ok"),
    page.waitForSelector('[role="alert"]', { timeout: 10_000 }).then(() => "error"),
  ]).catch(() => "error");

  return result === "ok";
}

async function signUp(page: import("@playwright/test").Page) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Test User");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Either get redirected to onboarding (email confirmation off)
  // or see a "check your email" message (email confirmation on).
  await Promise.race([
    page.waitForURL(/\/(onboarding|dashboard|p\/)/, { timeout: 15_000 }),
    page.waitForSelector("text=/check your email|verify/i", { timeout: 15_000 }),
  ]).catch(() => {});
}

async function completeOnboarding(page: import("@playwright/test").Page) {
  if (!page.url().includes("/onboarding")) return;

  // Step 1 — role
  const roleBtn = page.getByRole("button", { name: /Founder|Developer|Business|Operations|Designer|Data/i }).first();
  await roleBtn.waitFor({ timeout: 8_000 });
  await roleBtn.click();

  // Step 2 — experience dial / next
  const nextBtn = page.getByRole("button", { name: /Next|Continue/i }).first();
  if (await nextBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await nextBtn.click();
  }

  // Step 3 — first goal (pick first option or skip)
  const goalBtn = page.getByRole("button", { name: /Support|FAQ|Summarise|Hiring|Skip|get started/i }).first();
  if (await goalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await goalBtn.click();
  }

  // Final CTA
  const doneBtn = page.getByRole("button", { name: /Start building|Get started|Done|Continue/i }).first();
  if (await doneBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await doneBtn.click();
  }

  await page.waitForURL(/\/dashboard|\/p\//, { timeout: 15_000 });
}

setup("log in and save session", async ({ page }) => {
  // 1. Try login.
  const loggedIn = await trySignIn(page);

  // 2. If login failed, sign up a new account.
  if (!loggedIn) {
    await signUp(page);
  }

  // 3. Complete onboarding if needed.
  await completeOnboarding(page);

  // 4. Confirm we landed somewhere authenticated.
  await expect(page).toHaveURL(/\/dashboard|\/p\//, { timeout: 15_000 });

  // 5. Save session.
  await page.context().storageState({ path: AUTH_FILE });
});
