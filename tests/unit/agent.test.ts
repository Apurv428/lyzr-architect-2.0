import { describe, expect, it } from "vitest";
import { generateCode } from "@/lib/agent/codegen";
import { compileAgent, redact, systemPrompt } from "@/lib/agent/compile";
import { graphFromPlan } from "@/lib/agent/seed";
import { demoPlan } from "@/lib/ai/demo";

const plan = demoPlan("", "Support", "support-triage");

describe("graphFromPlan + compileAgent", () => {
  const graph = graphFromPlan(plan, "Support");
  const spec = compileAgent(graph, "Triage");

  it("seeds a connected agent from the plan", () => {
    expect(graph.nodes.some((n) => n.data.kind === "llm")).toBe(true);
    expect(spec.rules).toEqual(plan.rules);
    expect(spec.redactPII).toBe(true);
    expect(spec.tools.length).toBeGreaterThan(0);
  });

  it("ignores blocks that aren't connected to the brain", () => {
    const orphan = { id: "orphan", type: "agent" as const, position: { x: 0, y: 0 }, data: { kind: "knowledge" as const, label: "Stray", config: { content: "SECRET NOTES" } } };
    const s = compileAgent({ ...graph, nodes: [...graph.nodes, orphan] }, "Triage");
    expect(s.knowledge).not.toContain("SECRET NOTES");
  });

  it("puts rules and knowledge into the system prompt", () => {
    const prompt = systemPrompt({ ...spec, knowledge: "Refunds take 5 days." });
    expect(prompt).toContain("Never promise refunds");
    expect(prompt).toContain("Refunds take 5 days.");
  });
});

describe("redact", () => {
  it("masks emails, phones and card numbers", () => {
    const r = redact("Mail a@b.co, call +91 98765 43210, card 4242 4242 4242 4242.");
    expect(r.count).toBe(3);
    expect(r.text).not.toMatch(/a@b\.co|98765|4242/);
  });
  it("leaves clean text alone", () => {
    expect(redact("Order #8812 ships Tuesday").count).toBe(0);
  });
});

describe("generateCode", () => {
  const spec = compileAgent(graphFromPlan(plan, "Support"), "Triage");
  it("escapes triple quotes inside Python prompts", () => {
    const code = generateCode({ ...spec, instructions: 'Say """hi"""' }, "langgraph");
    const body = code.split('SYSTEM_PROMPT = """')[1].split('\n"""')[0];
    expect(body).not.toContain('"""');
  });
  it("uses the OpenAI class for GPT models", () => {
    expect(generateCode({ ...spec, model: "gpt-5.5" }, "langgraph")).toContain("ChatOpenAI");
  });
  it("emits valid JSON for the Lyzr blueprint", () => {
    expect(() => JSON.parse(generateCode(spec, "lyzr-adk"))).not.toThrow();
  });
});
