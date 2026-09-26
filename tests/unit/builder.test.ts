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
