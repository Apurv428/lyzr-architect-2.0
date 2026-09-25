import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { redact, systemPrompt, type AgentSpec } from "@/lib/agent/compile";
import { chunkDocs, describeSources, rank, type Passage } from "@/lib/agent/retrieval";
import { MODELS, TOOL_CATALOG } from "@/lib/agent/types";
import type { TraceStep } from "@/lib/agent/trace";
import type { ResolvedProvider } from "@/lib/ai/keys";
import { OPENAI_MODEL, supportsReasoningEffort } from "@/lib/ai/provider";

// One agent runner shared by the test console, the public API and evals.

const MAX_TURNS = 6;

export type HistoryTurn = { role: "user" | "assistant"; content: string };
export type KnowledgeDoc = { name: string; node_id: string; content: unknown };

export type RunOptions = {
  spec: AgentSpec;
  input: string;
  history: HistoryTurn[];
  llm: ResolvedProvider;
  /** Loads uploaded knowledge files; only called when a Knowledge block is connected. */
  loadDocs?: () => Promise<KnowledgeDoc[]>;
  onStep?: (step: TraceStep) => void;
};

export type RunResult = {
  text: string;
  steps: TraceStep[];
  tokens: number;
  latencyMs: number;
  provider: ResolvedProvider["provider"];
};

/** Thrown for problems the caller should show as-is (bad model choice, refusals, loops). */
export class AgentRunError extends Error {}

/** Refuses models that need a key the platform doesn't have. Returns an error message or null. */
export function unavailableModel(spec: AgentSpec) {
  const info = MODELS.find((m) => m.id === spec.model);
  return info?.available ? null : `${info?.label ?? spec.model} needs your own API key — pick a Claude model.`;
}

/** Turns SDK errors into short messages that are safe to show to users and API callers. */
export function describeRunError(err: unknown) {
  if (err instanceof Anthropic.RateLimitError || err instanceof OpenAI.RateLimitError) return "The model is busy — try again in a few seconds.";
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) return `Model error (${err.status}). Try again or switch models.`;
  if (err instanceof AgentRunError) return err.message;
  return "The agent run failed.";
}

export async function runAgent({ spec: compiled, input, history, llm, loadDocs, onStep }: RunOptions): Promise<RunResult> {
  const spec = { ...compiled };
  const steps: TraceStep[] = [];
  const step: StepFn = (s) => {
    const full = { ...s, id: crypto.randomUUID() };
    steps.push(full);
    onStep?.(full);
  };
  const started = Date.now();
  const modelLabel = MODELS.find((m) => m.id === spec.model)?.label ?? spec.model;

  step({ type: "trigger", title: `Triggered by: ${spec.trigger}`, detail: input.slice(0, 160) });
  if (spec.knowledge) step({ type: "knowledge", title: "Loaded knowledge base", detail: `${spec.knowledge.length.toLocaleString()} characters in context` });

  // Search uploaded knowledge files (connected Knowledge blocks only).
  let passages: Passage[] = [];
  if (spec.knowledgeNodeIds.length && loadDocs) {
    const t0 = Date.now();
    const docs = (await loadDocs()).filter((d) => spec.knowledgeNodeIds.includes(d.node_id));
    if (docs.length) {
      const query = [history.filter((h) => h.role === "user").at(-1)?.content ?? "", input].join(" ");
      passages = rank(chunkDocs(docs.map((d) => ({ name: d.name, pages: d.content as string[] }))), query, 6);
      step({
        type: "knowledge",
        title: passages.length ? `Retrieved ${passages.length} passage${passages.length > 1 ? "s" : ""}` : `Searched ${docs.length} file${docs.length > 1 ? "s" : ""} — nothing relevant`,
        detail: passages.length ? describeSources(passages) : "The agent will say the documents don't cover this.",
        ms: Date.now() - t0,
      });
    }
  }
  if (spec.rules.length) step({ type: "guardrail", title: `${spec.rules.length} rule${spec.rules.length > 1 ? "s" : ""} active`, detail: spec.rules.join(" · ") });

  // Run on the provider the Brain block asks for; the caller resolved a fallback if it isn't configured.
  const provider = llm.provider;
  const wantsOpenAI = spec.model.startsWith("gpt");
  if (provider !== "demo" && (provider === "openai") !== wantsOpenAI) {
    const ranOn = provider === "openai" ? OPENAI_MODEL : "Claude Opus 5";
    step({ type: "llm", title: `${modelLabel} isn't configured here — running on ${ranOn}` });
    spec.model = provider === "openai" ? OPENAI_MODEL : "claude-opus-5";
  }
  const result =
    provider === "anthropic"
      ? await runClaude(spec, history, input, step, passages, llm.apiKey)
      : provider === "openai"
        ? await runOpenAI(spec, history, input, step, passages, llm.apiKey)
        : await runDemo(spec, input, step, passages);

  let text = result.text;
  if (spec.redactPII) {
    const r = redact(text);
    text = r.text;
    step({
      type: "guardrail",
      title: r.count ? `Redacted ${r.count} piece${r.count > 1 ? "s" : ""} of personal data` : "PII check passed",
      detail: r.count ? "Emails, phone and card numbers are masked before replying" : "No personal data found in the reply",
    });
  }
  step({ type: "output", title: `Delivered as ${spec.output.toLowerCase()}` });
  return { text, steps, tokens: result.tokens, latencyMs: Date.now() - started, provider };
}

type StepFn = (s: Omit<TraceStep, "id">) => void;

const CLIENT_TOOLS: Record<string, Anthropic.Beta.BetaTool["input_schema"]> = {
  send_email: {
    type: "object",
    properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
    required: ["to", "subject", "body"],
  },
  slack_message: {
    type: "object",
    properties: { channel: { type: "string" }, text: { type: "string" } },
    required: ["channel", "text"],
  },
  crm_lookup: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  create_ticket: {
    type: "object",
    properties: { title: { type: "string" }, description: { type: "string" }, priority: { type: "string", enum: ["low", "medium", "high", "urgent"] } },
    required: ["title", "description", "priority"],
  },
  sql_query: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
  http_request: {
    type: "object",
    properties: { method: { type: "string" }, url: { type: "string" }, body: { type: "string" } },
    required: ["method", "url"],
  },
};

// Integrations aren't connected in the sandbox, so tool calls return realistic simulated results.
function simulateTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "send_email":
      return JSON.stringify({ status: "queued", to: input.to, message_id: `msg_${Math.random().toString(36).slice(2, 10)}` });
    case "slack_message":
      return JSON.stringify({ ok: true, channel: input.channel, ts: `${Math.floor(Date.now() / 1000)}.000200` });
    case "crm_lookup":
      return JSON.stringify({
        matches: [{ name: "Priya Sharma", company: "Acme Retail", plan: "Growth", mrr: 1200, owner: "Arjun", last_contact: "2026-09-18" }],
      });
    case "create_ticket":
      return JSON.stringify({ id: `TCK-${1000 + Math.floor(Math.random() * 9000)}`, status: "open", priority: input.priority });
    case "sql_query":
      return JSON.stringify({ rows: [{ count: 42 }], note: "Sample data" });
    case "web_search":
      return JSON.stringify({
        results: [
          { title: `Top result for “${String(input.query ?? "")}”`, url: "https://example.com/article", snippet: "Sample search result — connect a search provider for live results." },
          { title: "Related documentation", url: "https://example.com/docs", snippet: "Sample search result." },
        ],
      });
    case "http_request":
      return JSON.stringify({ status: 200, body: { ok: true } });
    default:
      return JSON.stringify({ error: `Unknown tool ${name}` });
  }
}

function buildTools(spec: AgentSpec): Anthropic.Beta.BetaToolUnion[] {
  const tools: Anthropic.Beta.BetaToolUnion[] = [];
  for (const id of spec.tools) {
    if (id === "web_search") {
      tools.push(
        spec.model === "claude-haiku-4-5"
          ? { type: "web_search_20250305", name: "web_search", max_uses: 3 }
          : { type: "web_search_20260209", name: "web_search", max_uses: 3 },
      );
    } else if (CLIENT_TOOLS[id]) {
      const meta = TOOL_CATALOG.find((t) => t.id === id)!;
      tools.push({ name: id, description: meta.description, input_schema: CLIENT_TOOLS[id] });
    }
  }
  return tools;
}

async function runClaude(
  spec: AgentSpec,
  history: { role: "user" | "assistant"; content: string }[],
  input: string,
  step: StepFn,
  passages: Passage[],
  apiKey?: string,
): Promise<{ text: string; tokens: number }> {
  const client = new Anthropic(apiKey ? { apiKey } : {});
  const tools = buildTools(spec);
  const isOpus5 = spec.model === "claude-opus-5";
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: input }];
  const label = MODELS.find((m) => m.id === spec.model)!.label;
  let tokens = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const t0 = Date.now();
    const res = await client.beta.messages.create({
      model: spec.model,
      max_tokens: 16000,
      system: systemPrompt(spec, passages),
      messages,
      ...(tools.length ? { tools } : {}),
      // Haiku 4.5 doesn't take an effort setting.
      ...(spec.model === "claude-haiku-4-5" ? {} : { output_config: { effort: "medium" as const } }),
      ...(isOpus5 ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    const used = res.usage.input_tokens + res.usage.output_tokens;
    tokens += used;
    step({ type: "llm", title: `${label} ${turn === 0 ? "reasoned about the request" : "continued"}`, ms: Date.now() - t0, tokens: used });

    for (const block of res.content) {
      if (block.type === "server_tool_use" && block.name === "web_search") {
        step({ type: "tool", title: "Web search", detail: `“${(block.input as { query?: string }).query ?? ""}”`, live: true });
      }
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        step({ type: "tool", title: `Found ${block.content.length} web results`, detail: block.content.slice(0, 3).map((r) => r.title).join(" · "), live: true });
      }
    }

    if (res.stop_reason === "refusal") throw new AgentRunError("The model declined this request.");
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }

    const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason === "tool_use" && toolUses.length) {
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((use) => {
        const input = (use.input ?? {}) as Record<string, unknown>;
        const output = simulateTool(use.name, input);
        const meta = TOOL_CATALOG.find((t) => t.id === use.name);
        step({ type: "tool", title: meta?.label ?? use.name, detail: JSON.stringify(input).slice(0, 200), result: output.slice(0, 300), simulated: true });
        return { type: "tool_result", tool_use_id: use.id, content: output };
      });
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { text: text || "(no reply)", tokens };
  }
  throw new AgentRunError("The agent took too many steps. Simplify the instructions or remove a tool.");
}

async function runOpenAI(
  spec: AgentSpec,
  history: { role: "user" | "assistant"; content: string }[],
  input: string,
  step: StepFn,
  passages: Passage[],
  apiKey?: string,
): Promise<{ text: string; tokens: number }> {
  const client = new OpenAI(apiKey ? { apiKey } : {});
  const model = spec.model.startsWith("gpt") ? spec.model : OPENAI_MODEL;
  const tools: OpenAI.Chat.Completions.ChatCompletionFunctionTool[] = spec.tools
    .filter((id) => id === "web_search" || CLIENT_TOOLS[id])
    .map((id) => ({
      type: "function",
      function: {
        name: id,
        description: TOOL_CATALOG.find((t) => t.id === id)!.description,
        parameters: (id === "web_search"
          ? { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
          : CLIENT_TOOLS[id]) as Record<string, unknown>,
      },
    }));
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(spec, passages) },
    ...history,
    { role: "user", content: input },
  ];
  let tokens = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const t0 = Date.now();
    const res = await client.chat.completions.create({
      model,
      messages,
      ...(tools.length ? { tools } : {}),
      max_completion_tokens: 16000,
      ...(supportsReasoningEffort(model) ? { reasoning_effort: "low" as const } : {}),
    });
    const used = res.usage?.total_tokens ?? 0;
    tokens += used;
    step({ type: "llm", title: `${model} ${turn === 0 ? "reasoned about the request" : "continued"}`, ms: Date.now() - t0, tokens: used });

    const choice = res.choices[0];
    if (choice.finish_reason === "content_filter") throw new AgentRunError("The model declined this request.");
    const toolCalls = (choice.message.tool_calls ?? []).filter((c) => c.type === "function");
    if (toolCalls.length) {
      messages.push(choice.message);
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        const output = simulateTool(call.function.name, args);
        const meta = TOOL_CATALOG.find((t) => t.id === call.function.name);
        step({ type: "tool", title: meta?.label ?? call.function.name, detail: JSON.stringify(args).slice(0, 200), result: output.slice(0, 300), simulated: true });
        messages.push({ role: "tool", tool_call_id: call.id, content: output });
      }
      continue;
    }
    return { text: choice.message.content?.trim() || "(no reply)", tokens };
  }
  throw new AgentRunError("The agent took too many steps. Simplify the instructions or remove a tool.");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runDemo(spec: AgentSpec, input: string, step: StepFn, passages: Passage[] = []): Promise<{ text: string; tokens: number }> {
  await sleep(700);
  step({ type: "llm", title: "Demo model reasoned about the request", ms: 640, tokens: 812 });
  const firstTool = spec.tools[0];
  if (firstTool) {
    await sleep(500);
    const meta = TOOL_CATALOG.find((t) => t.id === firstTool);
    step({ type: "tool", title: meta?.label ?? firstTool, detail: JSON.stringify({ query: input.slice(0, 60) }), result: simulateTool(firstTool, { query: input }).slice(0, 200), simulated: true });
    await sleep(500);
    step({ type: "llm", title: "Demo model wrote the reply", ms: 420, tokens: 530 });
  }
  if (passages.length) {
    const top = passages[0];
    return {
      text: `From ${top.doc} (p. ${top.page}): “${top.text.slice(0, 280)}${top.text.length > 280 ? "…" : ""}”\n\n(Demo mode quotes the best-matching passage — add an API key for a written answer.)`,
      tokens: 640,
    };
  }
  const reply = `Here's how I'd handle “${input.slice(0, 80)}”: I followed my instructions${spec.tools.length ? `, used ${spec.tools.length} tool${spec.tools.length > 1 ? "s" : ""}` : ""}${spec.knowledge ? ", checked the knowledge base" : ""} and kept to ${spec.rules.length} rule${spec.rules.length === 1 ? "" : "s"}.\n\n(This is demo mode — add an Anthropic API key for real answers. For example, contact support@acme.com.)`;
  return { text: reply, tokens: 1342 };
}
