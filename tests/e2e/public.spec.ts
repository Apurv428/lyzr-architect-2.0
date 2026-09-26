import { expect, test } from "@playwright/test";

test("landing page pitches the product and routes a prompt to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Approve the plan");
  await page.getByLabel("Describe what you want to build").fill("A lead qualifier agent");
  await page.getByRole("button", { name: "Start building" }).first().click();
  await expect(page).toHaveURL(/\/login/);
});

test("pricing lists every plan", async ({ page }) => {
  await page.goto("/pricing");
  for (const plan of ["Free", "Pro", "Team", "Enterprise"]) {
    await expect(page.getByText(plan, { exact: true }).first()).toBeVisible();
  }
});

test("login ignores off-site redirect targets", async ({ page }) => {
  for (const next of ["//evil.com", "/\\evil.com", "https://evil.com"]) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await expect(page.locator('input[name="next"]')).toHaveValue("/dashboard");
  }
});

test("protected pages send signed-out visitors to login", async ({ page }) => {
  for (const path of ["/dashboard", "/agents", "/import"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("unknown routes show the 404 page", async ({ page }) => {
  await page.goto("/definitely-not-here");
  await expect(page.getByRole("heading", { name: "This page wandered off" })).toBeVisible();
});

test("public pages never scroll sideways", async ({ page }) => {
  for (const path of ["/", "/pricing", "/login", "/signup"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("agent API rejects calls without a valid key, with JSON errors and no CORS", async ({ request }) => {
  const url = "/api/v1/agents/0d5c7a3e-8f1b-4c2a-9e6d-2b7f4a1c8e90/run";
  for (const authorization of [undefined, "Bearer nope", "Basic arc_live_x"]) {
    const res = await request.post(url, { headers: authorization ? { authorization } : {}, data: { input: "hi" } });
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
  }
});
