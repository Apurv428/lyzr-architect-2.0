import { describe, expect, it } from "vitest";
import { gradeText, parseVerdict, summarize } from "@/lib/agent/evals";
import type { AgentGraph } from "@/lib/agent/types";

describe("eval grading", () => {
  it("checks contains case- and whitespace-insensitively, with | alternatives", () => {
    expect(gradeText("contains", "5 business days", "Refunds take 5  Business Days.").pass).toBe(true);
    expect(gradeText("contains", "five days | 5 days", "About 5 days.").pass).toBe(true);
    expect(gradeText("contains", "refund", "We can't help with that.")).toEqual({ pass: false, reason: "Didn't find “refund”." });
    expect(gradeText("contains", "  ", "anything").pass).toBe(false);
  });

  it("checks not_contains", () => {
    expect(gradeText("not_contains", "guaranteed refund", "A refund may be possible.").pass).toBe(true);
    const fail = gradeText("not_contains", "guaranteed | promise", "I promise you'll get it back");
    expect(fail.pass).toBe(false);
    expect(fail.reason).toContain("promise");
  });

  it("parses judge verdicts and refuses to guess", () => {
    expect(parseVerdict("PASS: Declines politely.")).toEqual({ pass: true, reason: "Declines politely." });
    expect(parseVerdict("Thinking…\nFAIL — promises a refund")).toEqual({ pass: false, reason: "promises a refund" });
    expect(parseVerdict("pass").pass).toBe(true);
    expect(parseVerdict("Looks fine to me").pass).toBeNull();
    expect(parseVerdict("PASSING grade").pass).toBeNull();
  });

  it("summarizes only graded cases", () => {
    expect(summarize([{ pass: true }, { pass: false }, { pass: null }])).toEqual({ passed: 1, graded: 2, passRate: 0.5 });
    expect(summarize([{ pass: null }])).toEqual({ passed: 0, graded: 0, passRate: null });
  });
});

describe("evals through the shared runner (demo mode)", () => {
  it("a 'never says' check passes with the PII rule on and fails when it is removed", async () => {
    const { runAgent } = await import("@/lib/agent/run");
    const { compileAgent } = await import("@/lib/agent/compile");
    const graph = (redactPII: boolean): AgentGraph => ({
      nodes: [
        { id: "l", type: "agent", position: { x: 0, y: 0 }, data: { kind: "llm" as const, label: "Brain", config: { model: "claude-opus-5", instructions: "Help." } } },
        { id: "g", type: "agent", position: { x: 0, y: 0 }, data: { kind: "guardrail" as const, label: "Rules", config: { rules: [], redactPII } } },
      ],
      edges: [{ id: "e", source: "l", target: "g" }],
    });
    const verdict = async (redactPII: boolean) => {
      const run = await runAgent({ spec: compileAgent(graph(redactPII), "Support"), input: "How do I reach you?", history: [], llm: { provider: "demo", byok: false } });
      return gradeText("not_contains", "@acme.com", run.text).pass;
    };
    expect(await verdict(true)).toBe(true);
    expect(await verdict(false)).toBe(false);
  }, 10_000);
});
