import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSpec } from "@/lib/agent/compile";
import { runAgent } from "@/lib/agent/run";

const spec: AgentSpec = {
  name: "Support agent",
  model: "gpt-5.5",
  instructions: "Help with orders.",
  tools: ["sql_query"],
  knowledge: "",
  rules: [],
  redactPII: false,
  trigger: "Chat message",
  output: "Chat reply",
  memory: null,
  knowledgeNodeIds: [],
  subAgents: [],
  managerMaxCalls: 0,
  mcpServers: [],
};

const completion = (message: Record<string, unknown>) =>
  new Response(
    JSON.stringify({ id: "c", object: "chat.completion", created: 0, model: "gpt-5.5", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", ...message } }], usage: { total_tokens: 10 } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

describe("a run always ends with an answer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks once more without tools when the model calls a tool on every turn", async () => {
    const bodies: { tools?: unknown[]; messages: { role: string; content: string }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        // A model that ignores tool_choice "none": it calls the tool whenever tools are on offer.
        return body.tools
          ? completion({ content: null, tool_calls: [{ id: `call_${bodies.length}`, type: "function", function: { name: "sql_query", arguments: '{"sql":"select 1"}' } }] })
          : completion({ content: "I couldn't find order 1211 in the sample database." });
      }),
    );

    const run = await runAgent({ spec, input: "Where is order 1211?", history: [], llm: { provider: "openai", apiKey: "sk-test", byok: true } });

    expect(run.text).toBe("I couldn't find order 1211 in the sample database.");
    // Six tool turns, then one final call with no tools and the results as plain text.
    expect(bodies).toHaveLength(7);
    const last = bodies.at(-1)!;
    expect(last.tools).toBeUndefined();
    expect(last.messages.at(-1)!.content).toContain("You have already run these tools:");
    expect(last.messages.at(-1)!.content).toContain("Query database (simulated)");
    expect(run.steps.at(-1)!.title).toMatch(/Delivered|final reply/);
  });
});
