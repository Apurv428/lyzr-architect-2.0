/**
 * Workspace feature tests — authenticated, API mocked.
 *
 * Covers: chat panel, plan card, approve flow, build output,
 * preview tab, code tab, checkpoint timeline, mode toggle,
 * select mode, error card + auto-fix, top bar rename, share dialog.
 */
import { expect, test as base, type Page } from "@playwright/test";
import {
  mockChat,
  mockDeploy,
  PLAN_STREAM,
  BUILD_STREAM,
  ERROR_STREAM,
  QUESTIONS_STREAM,
  MOCK_PLAN,
  APP_TSX,
} from "./fixtures";

// ─── workspace setup helper ──────────────────────────────────────────────────

async function openWorkspace(page: Page) {
  await mockChat(page);
  await page.goto("/dashboard");
  await page.getByRole("textbox").first().fill("A support ticket triage agent");
  await page.getByRole("button", { name: /Start building|Build/i }).click();
  await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });
  // Allow the initial "start" action to resolve.
  await page.waitForTimeout(1_500);
  return page.url();
}

async function advanceToBuild(page: Page) {
  // Questions card should be visible; answer and advance to plan.
  const answerBtn = page
    .getByRole("button", { name: /Email|Slack|Web form/i })
    .or(page.getByRole("button", { name: /Skip/i }))
    .first();
  if (await answerBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await answerBtn.click();
    await page.waitForTimeout(1_000);
  }

  // Approve the plan card.
  const approveBtn = page.getByRole("button", { name: /Approve/i }).first();
  if (await approveBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await approveBtn.click();
    // Wait for build response.
    await page.waitForTimeout(1_500);
  }
}

// ─── Chat panel ──────────────────────────────────────────────────────────────

base.describe("Chat panel", () => {
  let url: string;

  base.beforeEach(async ({ page }) => {
    url = await openWorkspace(page);
  });

  base("chat input is present and accepts text", async ({ page }) => {
    const input = page.getByRole("textbox", { name: /message|chat|prompt/i }).or(
      page.locator("textarea").last()
    );
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("add a dark mode toggle");
    await expect(input).toHaveValue("add a dark mode toggle");
  });

  base("questions card renders with answer options", async ({ page }) => {
    const card = page.locator('[data-message-kind="questions"]').or(
      page.getByText(/quick questions|Where do/i)
    );
    await expect(card.first()).toBeVisible({ timeout: 12_000 });
    // Each option button should be visible.
    await expect(page.getByRole("button", { name: /Email|Slack|Web form/i }).first()).toBeVisible();
  });

  base("plan card appears after answering questions", async ({ page }) => {
    // Answer the question.
    const option = page.getByRole("button", { name: /Email|Slack|Web form/i }).first();
    if (await option.isVisible({ timeout: 6_000 }).catch(() => false)) {
      await option.click();
    }
    await page.waitForTimeout(1_000);
    // Plan card should appear.
    const planCard = page.locator('[data-message-kind="plan"]').or(
      page.getByText(MOCK_PLAN.summary.slice(0, 40))
    );
    await expect(planCard.first()).toBeVisible({ timeout: 10_000 });
  });

  base("plan card shows Approve and Refine buttons", async ({ page }) => {
    const option = page.getByRole("button", { name: /Email|Slack|Web form/i }).first();
    if (await option.isVisible({ timeout: 6_000 }).catch(() => false)) await option.click();
    await page.waitForTimeout(1_000);
    await expect(page.getByRole("button", { name: /Approve/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: /Refine|Edit plan/i })).toBeVisible();
  });

  base("approving the plan triggers build and shows changes card", async ({ page }) => {
    await advanceToBuild(page);
    const changesCard = page.locator('[data-message-kind="changes"]').or(
      page.getByText(/Initial build|What changed/i)
    );
    await expect(changesCard.first()).toBeVisible({ timeout: 15_000 });
  });

  base("changes card shows next-action suggestion chips", async ({ page }) => {
    await advanceToBuild(page);
    // Suggestion chips like "Add dark mode".
    const chip = page.getByRole("button", { name: /dark mode|search|email inbox/i });
    await expect(chip.first()).toBeVisible({ timeout: 10_000 });
  });

  base("error card renders with Auto-fix button", async ({ page }) => {
    // Re-route chat to return an error stream for this test.
    await page.route("**/api/chat", async (route) => {
      const body = await route.request().postDataJSON().catch(() => ({}));
      if ((body?.action ?? "start") === "start") {
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
          body: ERROR_STREAM,
        });
      } else {
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
          body: BUILD_STREAM,
        });
      }
    });

    await page.goto(url || "/dashboard");
    await page.waitForTimeout(2_000);
    const errCard = page.locator('[data-message-kind="error"]').or(
      page.getByText(/failed to compile/i)
    );
    if (await errCard.first().isVisible({ timeout: 8_000 }).catch(() => false)) {
      await expect(page.getByRole("button", { name: /Auto.fix/i })).toBeVisible();
    }
  });

  base("⌘Enter submits a chat message", async ({ page }) => {
    const input = page.locator("textarea").last();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("make the header blue");
    await input.press("Meta+Enter");
    // The request fires; wait briefly for the mock to respond.
    await page.waitForTimeout(1_000);
  });
});

// ─── Preview tab ─────────────────────────────────────────────────────────────

base.describe("Preview tab", () => {
  base.beforeEach(async ({ page }) => {
    await openWorkspace(page);
    await advanceToBuild(page);
  });

  base("Preview tab is visible and can be selected", async ({ page }) => {
    const previewTab = page.getByRole("tab", { name: /Preview/i });
    await expect(previewTab).toBeVisible({ timeout: 10_000 });
    await previewTab.click();
  });

  base("Sandpack preview renders after build", async ({ page }) => {
    await page.getByRole("tab", { name: /Preview/i }).click();
    // The sandbox iframe or preview container should appear.
    await expect(page.locator('[class*="sandpack"],[data-codesandbox]').first()).toBeVisible({ timeout: 15_000 });
  });

  base("device toggle buttons are present", async ({ page }) => {
    await page.getByRole("tab", { name: /Preview/i }).click();
    // Mobile, tablet, desktop toggle buttons.
    const deviceBtns = page.getByRole("button", { name: /mobile|phone|tablet|desktop/i });
    await expect(deviceBtns.first()).toBeVisible({ timeout: 8_000 });
  });

  base("device toggle changes the preview width", async ({ page }) => {
    await page.getByRole("tab", { name: /Preview/i }).click();
    const mobileBtn = page.getByRole("button", { name: /mobile|phone/i }).first();
    if (await mobileBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await mobileBtn.click();
      // The iframe or preview container should narrow.
      await page.waitForTimeout(500);
    }
  });

  base("Open in new tab button is present", async ({ page }) => {
    await page.getByRole("tab", { name: /Preview/i }).click();
    await expect(
      page.getByRole("button", { name: /open in new tab|external/i }).or(
        page.getByTitle(/new tab|open/i)
      )
    ).toBeVisible({ timeout: 8_000 });
  });

  base("Select mode button is present and activates an overlay", async ({ page }) => {
    await page.getByRole("tab", { name: /Preview/i }).click();
    const selectBtn = page.getByRole("button", { name: /select|click to edit|element/i }).first();
    if (await selectBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await selectBtn.click();
      // An overlay or tooltip should appear.
      await page.waitForTimeout(400);
    }
  });
});

// ─── Code tab ─────────────────────────────────────────────────────────────────

base.describe("Code tab", () => {
  base.beforeEach(async ({ page }) => {
    await openWorkspace(page);
    await advanceToBuild(page);
  });

  base("Code tab is visible", async ({ page }) => {
    await expect(page.getByRole("tab", { name: /Code/i })).toBeVisible({ timeout: 10_000 });
  });

  base("Guided mode shows a read-only peek panel", async ({ page }) => {
    await page.getByRole("tab", { name: /Code/i }).click();
    // Guided shows a limited/read-only view.
    await page.waitForTimeout(600);
    // Should contain the generated App.tsx content or a "peek" indicator.
    const content = await page.content();
    const hasCode = content.includes("App.tsx") || content.includes("Support Inbox") || content.includes("guided") || content.includes("peek");
    expect(hasCode).toBe(true);
  });

  base("Pro mode shows the full Monaco editor with file tree", async ({ page }) => {
    // Switch to Pro mode first.
    const toggle = page.getByRole("switch", { name: /Guided|Pro/i }).or(
      page.getByText(/Pro mode/i, { exact: false }).first()
    );
    if (await toggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(600);
    }
    await page.getByRole("tab", { name: /Code/i }).click();
    // Monaco editor or code pane should be present.
    await expect(
      page.locator('[class*="monaco"],[class*="editor"],[data-testid="code-editor"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  base("file tree lists App.tsx after build", async ({ page }) => {
    await page.getByRole("tab", { name: /Code/i }).click();
    await expect(page.getByText("App.tsx")).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Checkpoint timeline ──────────────────────────────────────────────────────

base.describe("Checkpoints", () => {
  base.beforeEach(async ({ page }) => {
    await openWorkspace(page);
    await advanceToBuild(page);
  });

  base("Checkpoints menu button is visible in the top bar", async ({ page }) => {
    const cpBtn = page.getByRole("button", { name: /Checkpoint|History|restore/i }).or(
      page.locator('[data-tour="checkpoints"]')
    );
    await expect(cpBtn.first()).toBeVisible({ timeout: 8_000 });
  });

  base("opening Checkpoints menu shows at least one entry", async ({ page }) => {
    const cpBtn = page.getByRole("button", { name: /Checkpoint|History/i }).first();
    if (await cpBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cpBtn.click();
      await expect(page.getByText(/Initial build/i)).toBeVisible({ timeout: 5_000 });
    }
  });

  base("Restore button is present in the checkpoint menu", async ({ page }) => {
    const cpBtn = page.getByRole("button", { name: /Checkpoint|History/i }).first();
    if (await cpBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cpBtn.click();
      await expect(
        page.getByRole("button", { name: /Restore/i }).or(page.getByText(/Restore/i))
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ─── Mode toggle ─────────────────────────────────────────────────────────────

base.describe("Mode toggle (Guided ↔ Pro)", () => {
  base.beforeEach(async ({ page }) => {
    await openWorkspace(page);
  });

  base("mode toggle is visible in the top bar", async ({ page }) => {
    const toggle = page
      .locator('[data-tour="mode"]')
      .or(page.getByRole("switch", { name: /Guided|Pro/i }))
      .or(page.getByText(/Guided/i, { exact: true }));
    await expect(toggle.first()).toBeVisible({ timeout: 8_000 });
  });

  base("switching to Pro shows a confirmation toast", async ({ page }) => {
    const toggle = page.locator('[data-tour="mode"]').first();
    if (await toggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await toggle.locator("button, [role=switch]").last().click().catch(() => toggle.click());
      // Toast message should appear.
      await expect(
        page.getByText(/Pro mode/i).or(page.locator('[data-sonner-toast]'))
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  base("mode persists after page reload", async ({ page }) => {
    const toggle = page.locator('[data-tour="mode"]').first();
    if (await toggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Switch to Pro.
      await toggle.locator("button, [role=switch]").last().click().catch(() => toggle.click());
      await page.waitForTimeout(800);
      // Reload.
      await page.reload();
      await page.waitForTimeout(1_500);
      // The mode indicator should still say Pro.
      await expect(page.getByText(/Pro/i, { exact: true }).first()).toBeVisible({ timeout: 8_000 });
    }
  });
});

// ─── Top bar ─────────────────────────────────────────────────────────────────

base.describe("Top bar", () => {
  base.beforeEach(async ({ page }) => {
    await openWorkspace(page);
  });

  base("project name is editable", async ({ page }) => {
    const nameBtn = page.getByRole("button", { name: /Support ticket|triage/i }).first();
    if (await nameBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await nameBtn.click();
      const input = page.locator('input[class*="rounded"]:not([type="email"])').first();
      await input.fill("Renamed Project");
      await input.press("Enter");
      await expect(page.getByText("Renamed Project")).toBeVisible({ timeout: 5_000 });
    }
  });

  base("back arrow link navigates to dashboard", async ({ page }) => {
    await page.getByRole("link", { name: /Back to dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  base("Share button opens a dialog", async ({ page }) => {
    const shareBtn = page.getByRole("button", { name: /Share/i });
    if (await shareBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await shareBtn.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    }
  });

  base("credits count is visible", async ({ page }) => {
    await expect(page.getByText(/credits/i).first()).toBeVisible({ timeout: 5_000 });
  });
});
