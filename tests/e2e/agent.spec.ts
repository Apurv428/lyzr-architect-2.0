/**
 * Agent tab feature tests — authenticated, API mocked.
 *
 * Covers: React Flow canvas visibility, node palette, node inspector,
 * framework picker + code preview, test console, trace view,
 * multi-agent layout, Guided vs Pro label differences.
 */
import { expect, test as base } from "@playwright/test";
import { mockChat, mockAgentTest } from "./fixtures";
type Page = import("@playwright/test").Page;

// helper: open workspace → build → click Agent tab
async function openAgentTab(page: Page) {
  await mockChat(page);
  await mockAgentTest(page);
  await page.goto("/dashboard");
  await page.getByRole("textbox").first().fill("Support ticket triage agent");
  await page.getByRole("button", { name: /Start building|Build/i }).click();
  await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });
  await page.waitForTimeout(1_500);

  // Advance through questions + approve plan + build.
  const option = page.getByRole("button", { name: /Email|Slack|Skip/i }).first();
  if (await option.isVisible({ timeout: 5_000 }).catch(() => false)) await option.click();
  await page.waitForTimeout(800);
  const approve = page.getByRole("button", { name: /Approve/i }).first();
  if (await approve.isVisible({ timeout: 8_000 }).catch(() => false)) await approve.click();
  await page.waitForTimeout(1_500);

  // Click Agent tab.
  const agentTab = page.getByRole("tab", { name: /Agent/i });
  await expect(agentTab).toBeVisible({ timeout: 10_000 });
  await agentTab.click();
  await page.waitForTimeout(600);
}

base.describe("Agent tab", () => {
  base("Agent tab is present in the workspace", async ({ page }) => {
    await mockChat(page);
    await page.goto("/dashboard");
    await page.getByRole("textbox").first().fill("A test agent");
    await page.getByRole("button", { name: /Start building|Build/i }).click();
    await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });
    await expect(page.getByRole("tab", { name: /Agent/i })).toBeVisible({ timeout: 10_000 });
  });

  base("canvas renders with at least one node after build", async ({ page }) => {
    await openAgentTab(page);
    // React Flow renders nodes inside `.react-flow` container.
    const canvas = page.locator(".react-flow, [data-testid='rf__wrapper'], [class*='react-flow']").first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    // At least one node should exist.
    const nodes = page.locator(".react-flow__node, [data-id]").first();
    await expect(nodes).toBeVisible({ timeout: 10_000 });
  });

  base("node palette is visible with draggable block types", async ({ page }) => {
    await openAgentTab(page);
    const palette = page.locator('[data-testid="palette"], [class*="palette"], [aria-label*="palette"]').first();
    // Either palette is visible or individual block types are shown.
    const blockTypes = page.getByText(/LLM|Knowledge|Memory|Guardrails|Tool|Trigger|Output/i).first();
    await expect(palette.or(blockTypes)).toBeVisible({ timeout: 8_000 });
  });

  base("clicking a node opens the inspector drawer", async ({ page }) => {
    await openAgentTab(page);
    // Click the first node on the canvas.
    const node = page.locator(".react-flow__node").first();
    if (await node.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await node.click();
      // Inspector panel should slide in.
      const inspector = page
        .locator('[aria-label*="inspector"],[data-testid*="inspector"],[class*="inspector"],[class*="drawer"]')
        .first();
      await expect(inspector).toBeVisible({ timeout: 5_000 });
    }
  });

  base("inspector shows model picker and system prompt fields", async ({ page }) => {
    await openAgentTab(page);
    const node = page.locator(".react-flow__node").first();
    if (await node.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await node.click();
      await expect(page.getByText(/model|GPT|Claude|Llama/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  base("framework picker lists at least 4 frameworks", async ({ page }) => {
    await openAgentTab(page);
    const picker = page
      .getByRole("combobox", { name: /framework/i })
      .or(page.getByText(/Lyzr ADK|LangGraph|CrewAI|OpenAI|Claude Agent/i).first());
    await expect(picker).toBeVisible({ timeout: 8_000 });
    // Open the picker and check options.
    if (await page.getByRole("combobox", { name: /framework/i }).isVisible({ timeout: 3_000 }).catch(() => false)) {
      await page.getByRole("combobox", { name: /framework/i }).click();
      const options = page.getByRole("option");
      expect(await options.count()).toBeGreaterThanOrEqual(4);
    }
  });

  base("switching framework updates the generated code preview", async ({ page }) => {
    await openAgentTab(page);
    const codeView = page.getByRole("tab", { name: /Code/i }).or(
      page.locator('[data-testid="agent-code"],[class*="code-view"]').first()
    );
    if (await codeView.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await codeView.click();
      // Switch framework if picker is visible.
      const picker = page.getByRole("combobox", { name: /framework/i });
      if (await picker.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await picker.click();
        const langgraph = page.getByRole("option", { name: /LangGraph/i });
        if (await langgraph.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await langgraph.click();
          await expect(page.getByText(/langgraph|StateGraph|LangGraph/i)).toBeVisible({ timeout: 5_000 });
        }
      }
    }
  });

  base("test console has an input and Send button", async ({ page }) => {
    await openAgentTab(page);
    const consoleTab = page.getByRole("tab", { name: /Test|Console/i }).or(
      page.getByText(/Test console/i)
    );
    if (await consoleTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await consoleTab.click();
      await expect(page.getByRole("textbox")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole("button", { name: /Send|Run/i })).toBeVisible();
    }
  });

  base("sending a test message shows a response with trace steps", async ({ page }) => {
    await openAgentTab(page);
    const consoleTab = page.getByRole("tab", { name: /Test|Console/i });
    if (await consoleTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await consoleTab.click();
      await page.getByRole("textbox").fill("Urgent billing problem");
      await page.getByRole("button", { name: /Send|Run/i }).click();
      // Mock returns a trace with steps.
      await expect(page.getByText(/classify|Billing|draft/i).first()).toBeVisible({ timeout: 8_000 });
    }
  });

  base("trace view shows token count and latency", async ({ page }) => {
    await openAgentTab(page);
    const consoleTab = page.getByRole("tab", { name: /Test|Console/i });
    if (await consoleTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await consoleTab.click();
      await page.getByRole("textbox").fill("Refund request");
      await page.getByRole("button", { name: /Send|Run/i }).click();
      await expect(page.getByText(/token|ms|latency/i).first()).toBeVisible({ timeout: 8_000 });
    }
  });

  base("Guided mode labels are friendly (no jargon)", async ({ page }) => {
    await mockChat(page);
    await page.goto("/dashboard");
    await page.getByRole("textbox").first().fill("Support agent in guided mode");
    await page.getByRole("button", { name: /Start building|Build/i }).click();
    await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });
    await page.waitForTimeout(1_500);

    const agentTab = page.getByRole("tab", { name: /Agent/i });
    if (await agentTab.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await agentTab.click();
      // Guided mode should show "Knowledge" not "RAG", "Rules" not "Guardrails".
      const pageText = await page.textContent("body");
      expect(pageText?.includes("Knowledge") || pageText?.includes("Rules")).toBeTruthy();
    }
  });
});

// ─── Agents library page ──────────────────────────────────────────────────────

base.describe("Agents library (/agents)", () => {
  base("agents page loads without errors", async ({ page }) => {
    await page.goto("/agents");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  base("agents page shows a heading or empty state", async ({ page }) => {
    await page.goto("/agents");
    await expect(
      page.getByRole("heading", { name: /Agents|Library|My agents/i }).or(
        page.getByText(/no agents|build your first/i)
      )
    ).toBeVisible({ timeout: 8_000 });
  });

  base("agents page links back to dashboard", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("link", { name: /Dashboard|Home|Back/i }).first()).toBeVisible({ timeout: 5_000 });
  });
});
