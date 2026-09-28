import { describe, expect, it } from "vitest";
import { demoBuild, demoEdit, demoPlan } from "@/lib/ai/demo";
import { PlanSchema, WriteFilesSchema } from "@/lib/ai/schema";
import { parseRepo } from "@/lib/github";

describe("demo builder", () => {
  const plan = demoPlan("A hiring assistant", "Hiring", null);
  const build = demoBuild(plan, "Hiring");

  it("produces schema-valid plans and builds", () => {
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(WriteFilesSchema.safeParse(build).success).toBe(true);
    expect(build.files.map((f) => f.path)).toContain("/App.tsx");
  });

  it("recolours the app on request", () => {
    const files = Object.fromEntries(build.files.map((f) => [f.path, f.content]));
    const edit = demoEdit("make it green", files)!;
    expect(edit.files.every((f) => !/indigo-\d/.test(f.content))).toBe(true);
  });
});

describe("parseRepo", () => {
  it.each([
    ["vercel/next.js", "vercel/next.js"],
    ["https://github.com/vercel/next.js", "vercel/next.js"],
    ["github.com/vercel/next.js.git", "vercel/next.js"],
    ["git@github.com:vercel/next.js.git", "vercel/next.js"],
    ["https://github.com/vercel/next.js/tree/canary", "vercel/next.js"],
  ])("%s → %s", (input, expected) => expect(parseRepo(input)).toBe(expected));
  it("rejects junk", () => expect(parseRepo("not a repo")).toBeNull());
});

describe("clarifying questions", () => {
  it("demo questions satisfy the schema the model is held to", async () => {
    const { DEMO_QUESTIONS } = await import("@/lib/ai/demo");
    const { QuestionsSchema } = await import("@/lib/ai/schema");
    expect(QuestionsSchema.safeParse(DEMO_QUESTIONS).success).toBe(true);
  });
  it("rejects more than 3 questions or fewer than 2 options", async () => {
    const { QuestionsSchema } = await import("@/lib/ai/schema");
    const q = { id: "a", question: "?", options: ["x", "y"], allow_other: false };
    expect(QuestionsSchema.safeParse({ questions: [q, q, q, q] }).success).toBe(false);
    expect(QuestionsSchema.safeParse({ questions: [{ ...q, options: ["only"] }] }).success).toBe(false);
  });
});

describe("edited plans", () => {
  it("keep the edited flag through validation", () => {
    const plan = { ...demoPlan("", "Support", "support-triage"), edited: true };
    const parsed = PlanSchema.parse(plan);
    expect(parsed.edited).toBe(true);
  });
  it("still require a screen and an agent step", () => {
    const plan = demoPlan("", "Support", "support-triage");
    expect(PlanSchema.safeParse({ ...plan, screens: [] }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...plan, agent: { ...plan.agent, steps: [] } }).success).toBe(false);
  });
});

describe("plans from OpenAI-compatible providers", () => {
  // Shapes Gemini actually sent for a Slack greeting agent.
  const flattened = {
    summary: "A Slack agent that posts good-morning and good-night messages on a schedule.",
    screens: ["Dashboard: next run and recent posts", "Schedules — times and channels", "Message Studio - tone and extras", "Logs"],
    data: ["Schedule (id, time, channel)", { entity: "Activity Log", fields: "timestamp, message, status" }],
    agent: { name: "Greeter", goal: "Post greetings on time", steps: "Wait for the scheduled time", tools: ["Send Slack message"] },
    rules: "Never post outside the configured channels",
    assumptions: ["Times are in the workspace's timezone"],
  };

  it("turns string screens and entities back into objects", () => {
    const plan = PlanSchema.parse(flattened);
    expect(plan.screens).toEqual([
      { name: "Dashboard", purpose: "next run and recent posts" },
      { name: "Schedules", purpose: "times and channels" },
      { name: "Message Studio", purpose: "tone and extras" },
      { name: "Logs", purpose: "" },
    ]);
    expect(plan.data).toEqual([
      { entity: "Schedule", fields: ["id", "time", "channel"] },
      { entity: "Activity Log", fields: ["timestamp", "message", "status"] },
    ]);
  });

  it("wraps lone strings in lists and fills lists that were left out", () => {
    const plan = PlanSchema.parse(flattened);
    expect(plan.agent.steps).toEqual(["Wait for the scheduled time"]);
    expect(plan.rules).toEqual(["Never post outside the configured channels"]);
    expect(plan.integrations).toEqual([]);
  });

  it("keeps hyphenated names whole", () => {
    expect(PlanSchema.parse({ ...flattened, screens: ["Check-in board"] }).screens).toEqual([{ name: "Check-in board", purpose: "" }]);
  });

  it("still rejects a plan with no screens or no agent steps", () => {
    expect(PlanSchema.safeParse({ ...flattened, screens: [] }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...flattened, agent: { ...flattened.agent, steps: undefined } }).success).toBe(false);
    expect(PlanSchema.safeParse({ ...flattened, summary: "" }).success).toBe(false);
  });
});

describe("edits from OpenAI-compatible providers", () => {
  it("accept a single-string summary (Gemini's shape on edit turns)", () => {
    const parsed = WriteFilesSchema.parse({
      files: [{ path: "/App.tsx", content: "export default () => null;" }],
      summary: "Renamed the main heading to Daily Habits.",
      next_suggestions: "Add a dark mode",
      checkpoint_label: "Rename heading",
    });
    expect(parsed.summary).toEqual(["Renamed the main heading to Daily Habits."]);
    expect(parsed.next_suggestions).toEqual(["Add a dark mode"]);
  });

  it("still reject unsafe paths", () => {
    expect(WriteFilesSchema.safeParse({ files: [{ path: "/../etc/passwd.ts", content: "" }] }).success).toBe(false);
    expect(WriteFilesSchema.safeParse({ files: [{ path: "/__architect__/connections.ts", content: "" }] }).success).toBe(false);
  });
});

describe("connection questions", () => {
  const choice = { id: "tone", question: "What tone?", options: ["Cheerful", "Calm"], allow_other: true };

  it("accept typed-in fields, with or without choices", async () => {
    const { QuestionsSchema } = await import("@/lib/ai/schema");
    const slack = { id: "slack", label: "Connect Slack", type: "slack_webhook" };
    expect(QuestionsSchema.parse({ questions: [choice], fields: [slack, { id: "am", label: "Morning time", type: "time" }] }).fields).toHaveLength(2);
    expect(QuestionsSchema.parse({ fields: [slack] }).questions).toEqual([]);
    expect(QuestionsSchema.safeParse({ questions: [], fields: [] }).success).toBe(false);
  });

  it("keep a single Slack webhook field and treat unknown types as text", async () => {
    const { QuestionsSchema } = await import("@/lib/ai/schema");
    const parsed = QuestionsSchema.parse({
      questions: [choice],
      fields: [
        { id: "a", label: "Slack", type: "slack_webhook" },
        { id: "b", label: "Slack again", type: "slack_webhook" },
        { id: "c", label: "Timezone", type: "dropdown" },
      ],
    });
    expect(parsed.fields?.map((f) => [f.id, f.type])).toEqual([["a", "slack_webhook"], ["c", "text"]]);
  });

  it("demo mode asks for Slack only when the app posts there", async () => {
    const { demoQuestions } = await import("@/lib/ai/demo");
    const { QuestionsSchema } = await import("@/lib/ai/schema");
    const slack = demoQuestions("A Slack bot that says good morning");
    expect(slack.fields?.[0].type).toBe("slack_webhook");
    expect(QuestionsSchema.safeParse(slack).success).toBe(true);
    expect(demoQuestions("A hiring tracker").fields).toBeUndefined();
  });
});

describe("agents seeded from plans", () => {
  it("start on a schedule when the plan runs at set times, and post to Slack", async () => {
    const { graphFromPlan } = await import("@/lib/agent/seed");
    const plan = PlanSchema.parse({
      summary: "Greets the team",
      screens: ["Dashboard"],
      agent: { name: "Greeter", goal: "Post good morning at 8:45 am and good night at 6 pm", steps: ["Write the greeting", "Post it"], tools: ["Slack poster"] },
    });
    const graph = graphFromPlan(plan, "Greeter");
    expect(graph.nodes.find((n) => n.data.kind === "trigger")?.data.config).toMatchObject({ source: "Schedule" });
    expect(graph.nodes.some((n) => n.data.config.tool === "slack_message")).toBe(true);
    const chat = graphFromPlan({ ...plan, agent: { ...plan.agent, goal: "Answer questions" } }, "Helper");
    expect(chat.nodes.find((n) => n.data.kind === "trigger")?.data.config).toMatchObject({ source: "Chat message" });
  });
});

describe("sandbox runtime", () => {
  it("gives every app the Slack helper, and exports carry it", async () => {
    const { RUNTIME_FILES, sandboxFiles } = await import("@/lib/workspace/sandbox");
    const files = sandboxFiles({ "/App.tsx": 'import { postToSlack } from "./__architect__/connections";' });
    expect(files["/__architect__/connections.ts"]).toContain("export function postToSlack");
    expect(Object.keys(RUNTIME_FILES)).toEqual(["/__architect__/connections.ts"]);
  });

  it("fixes helper imports written from the wrong folder", async () => {
    const { withRuntime } = await import("@/lib/workspace/sandbox");
    // Gemini wrote this from /lib/slack.ts.
    const files = withRuntime({
      "/App.tsx": 'import { sendGreeting } from "./lib/slack";',
      "/lib/slack.ts": 'import { postToSlack } from "./__architect__/connections";',
      "/components/ui/Button.tsx": "import { postToSlack } from '@/__architect__/connections.ts';",
    });
    expect(files["/App.tsx"]).toBe('import { sendGreeting } from "./lib/slack";');
    expect(files["/lib/slack.ts"]).toContain('from "../__architect__/connections"');
    expect(files["/components/ui/Button.tsx"]).toContain("from '../../__architect__/connections'");
    expect(files["/__architect__/connections.ts"]).toBeDefined();
    expect(withRuntime({ "/App.tsx": "export default () => null;" })["/__architect__/connections.ts"]).toBeUndefined();
  });
});
