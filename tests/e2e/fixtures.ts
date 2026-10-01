/**
 * Shared Playwright fixtures and mock-stream helpers.
 *
 * Usage in spec files:
 *   import { test, expect, mockChat, MOCK_PLAN, APP_TSX } from "./fixtures";
 */
import { test as base, expect, type Page, type Route } from "@playwright/test";

// ─── mock payloads ────────────────────────────────────────────────────────────

export const APP_TSX = `
import React, { useState } from "react";
export default function App() {
  const [count, setCount] = useState(0);
  return (
    <div style={{padding:32,fontFamily:"sans-serif"}}>
      <h1>Support Inbox</h1>
      <p>Tickets: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Add ticket</button>
    </div>
  );
}`.trim();

export const MOCK_PLAN = {
  summary: "A support desk where an AI agent classifies tickets and drafts replies.",
  screens: [
    { name: "Inbox", purpose: "All tickets at a glance" },
    { name: "Ticket detail", purpose: "Message + AI draft reply" },
  ],
  data: [{ entity: "Ticket", fields: ["customer", "subject", "urgency", "status"] }],
  agent: {
    name: "Triage Agent",
    goal: "Route every ticket and draft a ready-to-send reply",
    steps: ["Read ticket", "Classify urgency", "Draft reply"],
    tools: ["Knowledge base", "Email draft"],
  },
  rules: ["Never promise refunds", "Escalate legal issues to a human"],
  integrations: ["Email inbox", "Slack"],
};

const CHECKPOINT = { id: "cp-test-001", label: "Initial build", created_at: new Date().toISOString() };

function ndjson(...events: object[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

export const QUESTIONS_STREAM = ndjson(
  { t: "status", label: "Preparing a few questions…" },
  {
    t: "message",
    message: {
      id: "q-001",
      role: "assistant",
      kind: "questions",
      content: "A couple of quick questions:",
      data: {
        intro: "A couple of quick questions:",
        questions: [
          {
            id: "source",
            question: "Where do your support tickets come from?",
            options: ["Email", "Slack", "Web form"],
            allow_other: false,
          },
        ],
      },
      created_at: new Date().toISOString(),
    },
  },
  { t: "done" },
);

export const PLAN_STREAM = ndjson(
  { t: "status", label: "Drafting the plan…" },
  {
    t: "message",
    message: {
      id: "p-001",
      role: "assistant",
      kind: "plan",
      content: MOCK_PLAN.summary,
      data: MOCK_PLAN,
      created_at: new Date().toISOString(),
    },
  },
  { t: "done" },
);

export const BUILD_STREAM = ndjson(
  { t: "status", label: "Writing code…" },
  {
    t: "files",
    files: { "/App.tsx": APP_TSX },
    checkpoint: CHECKPOINT,
  },
  {
    t: "message",
    message: {
      id: "ch-001",
      role: "assistant",
      kind: "changes",
      content: "Initial build",
      data: {
        label: "Initial build",
        summary: ["Created the main Support Inbox dashboard", "Added a ticket counter component"],
        files: ["/App.tsx"],
        suggestions: ["Add dark mode", "Connect to real email inbox", "Add search"],
        checkpointId: CHECKPOINT.id,
      },
      created_at: new Date().toISOString(),
    },
  },
  { t: "credits", credits: 95 },
  { t: "done" },
);

export const ERROR_STREAM = ndjson(
  { t: "status", label: "Thinking…" },
  {
    t: "message",
    message: {
      id: "err-001",
      role: "assistant",
      kind: "error",
      content: "The preview failed to compile — missing import.",
      data: { retry: "message", input: "fix the preview" },
      created_at: new Date().toISOString(),
    },
  },
  { t: "done" },
);

// ─── route helper ─────────────────────────────────────────────────────────────

/** Install a mock for /api/chat that returns deterministic responses. */
export async function mockChat(page: Page) {
  await page.route("**/api/chat", async (route: Route) => {
    const body = await route.request().postDataJSON().catch(() => ({}));
    const action: string = body?.action ?? "start";

    let stream: string;
    if (action === "start") stream = QUESTIONS_STREAM;
    else if (action === "message") stream = PLAN_STREAM;
    else stream = BUILD_STREAM; // approve

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "Transfer-Encoding": "chunked",
      },
      body: stream,
    });
  });
}

/** Install a mock for /api/deploy that streams build logs then succeeds. */
export async function mockDeploy(page: Page) {
  await page.route("**/api/deploy", async (route: Route) => {
    const logs = [
      { t: "log", log: { at: Date.now(), level: "info", text: "Installing dependencies…" } },
      { t: "log", log: { at: Date.now(), level: "info", text: "Building project…" } },
      { t: "log", log: { at: Date.now(), level: "info", text: "Optimising assets…" } },
      { t: "log", log: { at: Date.now(), level: "success", text: "Deploy succeeded!" } },
      {
        t: "deployment",
        deployment: {
          id: "dep-001",
          env: "preview",
          status: "live",
          url: "https://support-inbox-test.architect.app",
          slug: "support-inbox-test",
          label: "E2E project",
          is_current: true,
          created_at: new Date().toISOString(),
        },
      },
      { t: "done" },
    ];
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
      body: logs.map((e) => JSON.stringify(e)).join("\n") + "\n",
    });
  });
}

/** Install a mock for /api/github/repos and /api/github/tree. */
export async function mockGithub(page: Page) {
  await page.route("**/api/github/repos**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repos: [
          { full_name: "test-user/my-saas-app", description: "Next.js SaaS starter", private: false, language: "TypeScript", updated_at: new Date().toISOString() },
          { full_name: "test-user/support-bot", description: "Customer support chatbot", private: false, language: "Python", updated_at: new Date().toISOString() },
        ],
      }),
    });
  });

  await page.route("**/api/github/tree**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        framework: "nextjs",
        version: "14",
        fileCount: 38,
        files: ["package.json", "app/page.tsx", "app/layout.tsx", "components/ui/button.tsx"],
        hasAgent: false,
      }),
    });
  });
}

/** Install a mock for /api/agents/test that returns a trace. */
export async function mockAgentTest(page: Page) {
  await page.route("**/api/agents/test**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        output: "I classified this ticket as **Billing** with urgency **High**. Draft reply: Hi, I'll escalate this to billing right away.",
        trace: [
          { step: "read_ticket", output: "Subject: Urgent billing issue", duration_ms: 120 },
          { step: "classify", output: "Category: Billing, Urgency: High", duration_ms: 340 },
          { step: "draft_reply", output: "Draft created", duration_ms: 510 },
        ],
        tokens: 412,
        latency_ms: 970,
      }),
    });
  });
}

// ─── custom test fixture ──────────────────────────────────────────────────────

type WorkspaceFixtures = {
  /** Navigate dashboard → create project → mock chat → return the project page. */
  workspacePage: Page;
};

export const test = base.extend<WorkspaceFixtures>({
  // Playwright calls the fixture callback "use"; renamed so the React hooks lint rule leaves it alone.
  workspacePage: async ({ page }, provide) => {
    // 1. Mock the chat API before navigating (avoids race with "start" action).
    await mockChat(page);

    // 2. Go to dashboard and create a project from the prompt box.
    await page.goto("/dashboard");
    await page.getByLabel(/Describe what you want to build|What will you build|prompt/i).fill("A support ticket triage agent with a dashboard");
    await page.getByRole("button", { name: /Start building|Build/i }).click();

    // 3. Wait for workspace to load.
    await page.waitForURL(/\/p\/[a-z0-9-]+/, { timeout: 20_000 });

    // 4. Wait for the questions card (or plan card) from the mock.
    await page.waitForSelector('[data-message-kind="questions"],[data-message-kind="plan"]', { timeout: 15_000 }).catch(() => {});

    await provide(page);
  },
});

export { expect };
