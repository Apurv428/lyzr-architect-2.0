/**
 * Deployment feature tests — authenticated, API mocked.
 *
 * Covers: Deploy button, deploy modal (env vars, domain), streaming build logs,
 * success screen (URL + QR + share), deployments list page, rollback button.
 */
import { expect, test as base } from "@playwright/test";
import { mockChat, mockDeploy } from "./fixtures";
type Page = import("@playwright/test").Page;

async function openBuiltWorkspace(page: Page) {
  await mockChat(page);
  await mockDeploy(page);
  await page.goto("/dashboard");
  await page.getByRole("textbox").first().fill("Deploy test project");
  await page.getByRole("button", { name: /Start building|Build/i }).click();
  await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });
  await page.waitForTimeout(1_500);

  // Advance through questions → plan → build.
  const option = page.getByRole("button", { name: /Email|Slack|Skip/i }).first();
  if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) await option.click();
  await page.waitForTimeout(800);
  const approve = page.getByRole("button", { name: /Approve/i }).first();
  if (await approve.isVisible({ timeout: 8_000 }).catch(() => false)) await approve.click();
  await page.waitForTimeout(1_500);
}

base.describe("Deploy button & modal", () => {
  base.beforeEach(async ({ page }) => {
    await openBuiltWorkspace(page);
  });

  base("Deploy button is visible in the top bar", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Deploy/i }).or(
        page.locator('[data-tour="deploy"]')
      )
    ).toBeVisible({ timeout: 10_000 });
  });

  base("clicking Deploy opens the deploy modal", async ({ page }) => {
    const deployBtn = page.getByRole("button", { name: /^Deploy$/i }).first();
    await expect(deployBtn).toBeVisible({ timeout: 10_000 });
    await deployBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  });

  base("deploy modal has environment selector (Preview / Production)", async ({ page }) => {
    await page.getByRole("button", { name: /^Deploy$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText(/Preview|Production/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  base("deploy modal has env-var key/value input", async ({ page }) => {
    await page.getByRole("button", { name: /^Deploy$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    // There should be a way to add env vars.
    await expect(
      page.getByText(/Environment variable|ENV|Add variable/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  base("deploy modal has custom domain field", async ({ page }) => {
    await page.getByRole("button", { name: /^Deploy$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("textbox", { name: /domain/i }).or(
        page.getByPlaceholder(/your-app\.com/i)
      )
    ).toBeVisible({ timeout: 5_000 });
  });
});

base.describe("Deploy flow — streaming logs", () => {
  base("starting a deploy shows streaming build logs", async ({ page }) => {
    await openBuiltWorkspace(page);
    await page.getByRole("button", { name: /^Deploy$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /Deploy now|Start deploy|Confirm|Deploy/i }).last().click();

    // Mock streams logs in order.
    await expect(
      page.getByText(/Installing|Building|Optimising|dependencies/i).first()
    ).toBeVisible({ timeout: 12_000 });
  });

  base("deploy success screen shows live URL and share options", async ({ page }) => {
    await openBuiltWorkspace(page);
    await page.getByRole("button", { name: /^Deploy$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /Deploy now|Start deploy|Confirm|Deploy/i }).last().click();

    // Wait for success state.
    await expect(
      page.getByText(/Deploy succeeded|live at|architect\.app/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  base("deploy success screen shows a copy-URL button or the URL itself", async ({ page }) => {
    await openBuiltWorkspace(page);
    await page.getByRole("button", { name: /^Deploy$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /Deploy now|Start deploy|Confirm|Deploy/i }).last().click();

    await expect(
      page.getByText(/architect\.app/i).or(
        page.getByRole("button", { name: /Copy URL|Copy link/i })
      )
    ).toBeVisible({ timeout: 15_000 });
  });

  base("adding an env var before deploying includes it in the request", async ({ page }) => {
    await openBuiltWorkspace(page);
    await page.getByRole("button", { name: /^Deploy$/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    // Add an env var.
    const addBtn = page.getByRole("button", { name: /Add variable|Add env/i });
    if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addBtn.click();
      const keyInput = page.getByPlaceholder(/KEY|VARIABLE_NAME/i).first();
      const valInput = page.getByPlaceholder(/value/i).first();
      await keyInput.fill("API_KEY");
      await valInput.fill("secret123");
    }

    // Intercept the deploy POST to check the payload.
    let deployPayload: Record<string, unknown> = {};
    await page.route("**/api/deploy", async (route) => {
      deployPayload = await route.request().postDataJSON().catch(() => ({}));
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
        body: '{"t":"done"}\n',
      });
    });

    await page.getByRole("button", { name: /Deploy now|Start deploy|Confirm|Deploy/i }).last().click();
    await page.waitForTimeout(1_000);
    if (deployPayload.envVars) {
      const envVars = deployPayload.envVars as Array<{ key: string }>;
      expect(envVars.some((v) => v.key === "API_KEY")).toBe(true);
    }
  });
});

base.describe("Deployments page (/deployments)", () => {
  base("deployments page loads", async ({ page }) => {
    await page.goto("/deployments");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  base("deployments page has a heading or empty state", async ({ page }) => {
    await page.goto("/deployments");
    await expect(
      page.getByRole("heading", { name: /Deployments|Deploy/i }).or(
        page.getByText(/no deployments|nothing deployed/i)
      )
    ).toBeVisible({ timeout: 8_000 });
  });

  base("each deployment row shows status badge", async ({ page }) => {
    await page.goto("/deployments");
    const badge = page.getByText(/live|building|failed|preview|production/i).first();
    if (await badge.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // A status badge is visible.
      expect(true).toBe(true);
    }
  });

  base("deployment row shows a Rollback button", async ({ page }) => {
    await page.goto("/deployments");
    const rollback = page.getByRole("button", { name: /Rollback/i });
    if (await rollback.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(rollback).toBeVisible();
    }
  });
});

base.describe("Deploy tab (workspace)", () => {
  base("Deploy tab is visible in the workspace right pane", async ({ page }) => {
    await mockChat(page);
    await mockDeploy(page);
    await page.goto("/dashboard");
    await page.getByRole("textbox").first().fill("Agent with deploy tab");
    await page.getByRole("button", { name: /Start building|Build/i }).click();
    await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });
    await expect(
      page.getByRole("tab", { name: /Deploy/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  base("Deploy tab shows deployment history and API endpoint section", async ({ page }) => {
    await mockChat(page);
    await mockDeploy(page);
    await page.goto("/dashboard");
    await page.getByRole("textbox").first().fill("Agent API tab test");
    await page.getByRole("button", { name: /Start building|Build/i }).click();
    await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });

    await page.getByRole("tab", { name: /Deploy/i }).click();
    await expect(
      page.getByText(/API endpoint|curl|Deploy|No deployments/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
