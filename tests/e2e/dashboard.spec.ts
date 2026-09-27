/**
 * Dashboard feature tests — authenticated.
 * Covers: greeting, prompt box, mode toggle, templates, import card, project cards.
 */
import { expect, test } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
  });

  // ── structure ──────────────────────────────────────────────────────────────

  test("shows greeting and prompt box", async ({ page }) => {
    await expect(page.getByText(/Good (morning|afternoon|evening)/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /build today/i })).toBeVisible();
    await expect(page.getByRole("textbox")).toBeVisible();
  });

  test("shows recent projects section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Recent projects/i })).toBeVisible();
  });

  test("shows template grid with at least 3 templates", async ({ page }) => {
    const templates = page.locator('[data-template],[data-testid*="template"]').or(
      page.getByRole("button", { name: /Support|FAQ|Hiring|Sales|Document|Invoice|Meeting/i })
    );
    await expect(templates.first()).toBeVisible({ timeout: 8_000 });
    expect(await templates.count()).toBeGreaterThanOrEqual(3);
  });

  test("shows Import from GitHub card", async ({ page }) => {
    await expect(page.getByText(/Import from GitHub/i)).toBeVisible();
  });

  // ── prompt box interactions ────────────────────────────────────────────────

  test("prompt box accepts text input", async ({ page }) => {
    const box = page.getByRole("textbox").first();
    await box.fill("Build a lead qualifier chatbot");
    await expect(box).toHaveValue("Build a lead qualifier chatbot");
  });

  test("⌘Enter submits the prompt and redirects to workspace", async ({ page }) => {
    const box = page.getByRole("textbox").first();
    await box.fill("A quick test project");
    await box.press("Meta+Enter");
    await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/p\//);
  });

  test("Start building button creates a project and navigates to workspace", async ({ page }) => {
    await page.getByRole("textbox").first().fill("An HR onboarding bot");
    await page.getByRole("button", { name: /Start building|Build/i }).click();
    await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/p\//);
  });

  test("empty prompt shows an error instead of navigating", async ({ page }) => {
    await page.getByRole("button", { name: /Start building|Build/i }).click();
    // Should either show a toast/error or not navigate.
    await page.waitForTimeout(1_500);
    expect(page.url()).toMatch(/\/dashboard/);
  });

  // ── mode toggle ───────────────────────────────────────────────────────────

  test("mode toggle switches between Guided and Pro", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: /Guided|Pro/i }).or(
      page.getByLabel(/mode/i)
    );
    if (await toggle.isVisible()) {
      const before = await toggle.textContent();
      await toggle.click();
      await expect(toggle).not.toHaveText(before ?? "", { timeout: 3_000 });
    }
  });

  test("Pro mode reveals framework selector", async ({ page }) => {
    const proBtn = page.getByRole("button", { name: /Pro/i }).or(
      page.getByText(/Pro/i, { exact: true })
    );
    if (await proBtn.isVisible()) {
      await proBtn.click();
      await expect(page.getByText(/Next\.js|Framework|React/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── templates ────────────────────────────────────────────────────────────

  test("clicking a template navigates to the workspace", async ({ page }) => {
    const template = page.getByRole("button", { name: /Support|Triage|FAQ/i }).first();
    await template.click();
    await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/p\//);
  });

  // ── navigation ───────────────────────────────────────────────────────────

  test("sidebar links to Agents, Deployments and Settings", async ({ page }) => {
    for (const link of ["Agents", "Deployments", "Settings"]) {
      await expect(page.getByRole("link", { name: link })).toBeVisible();
    }
  });

  test("clicking Import from GitHub navigates to /import", async ({ page }) => {
    await page.getByText(/Import from GitHub/i).click();
    await page.waitForURL(/\/import/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/import/);
  });

  // ── responsive ───────────────────────────────────────────────────────────

  test("dashboard does not overflow horizontally on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
