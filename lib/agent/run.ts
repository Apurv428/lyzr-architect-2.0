import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { redact, systemPrompt, type AgentSpec } from "@/lib/agent/compile";
import { chunkDocs, describeSources, rank, type HybridOptions, type Passage } from "@/lib/agent/retrieval";
import { embedText } from "@/lib/agent/embed";
import { resolveConnector } from "@/lib/agent/connectors";
import { postSlackMessage } from "@/lib/agent/connectors/slack";
import { sendGmail } from "@/lib/agent/connectors/gmail";
import { upsertContact } from "@/lib/agent/connectors/hubspot";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS, TOOL_CATALOG } from "@/lib/agent/types";
import type { TraceStep } from "@/lib/agent/trace";
import type { ResolvedProvider } from "@/lib/ai/keys";
import { McpSession, mcpToken, mcpToolName } from "@/lib/agent/mcp";
import { compatibleHost, isOutOfCredits, openaiClient, openaiModelFor, patientFetch, supportsReasoningEffort, type CompatibleHost } from "@/lib/ai/provider";

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
  /** Decrypted Slack incoming webhook URL for the project. When present, slack_message POSTs for real. */
  slackWebhookUrl?: string;
  /**
   * When provided, retrieval uses hybrid BM25 + pgvector search (RRF-fused).
   * Pass the authenticated Supabase client and the agent id.
   */
  supabase?: SupabaseClient;
  /** Agent DB id — used for hybrid vector search. */
  agentId?: string;
  /** Project DB id — used to resolve OAuth connectors. */
  projectId?: string;
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
  if (spec.model === "gemini" && !compatibleHost("gemini")) return "Gemini isn't set up on this server (add GEMINI_API_KEY). Pick a Claude or GPT model.";
  if (spec.model === "llama" && !compatibleHost("llama")) return "Llama needs an OpenAI-compatible host on the server (LLAMA_BASE_URL). Pick another model.";
  const info = MODELS.find((m) => m.id === spec.model);
  return info?.available ? null : `${info?.label ?? spec.model} needs your own API key — pick a Claude model.`;
}

/** Turns SDK errors into short messages that are safe to show to users and API callers. */
export function describeRunError(err: unknown) {
  if (isOutOfCredits(err)) return "The AI provider account is out of credits. Add your own model key in Settings to keep testing.";
  if (err instanceof OpenAI.RateLimitError && /PerDay/i.test(err.message)) return "The model's free daily quota is used up. Add your own model key in Settings, or try again tomorrow.";
  if (err instanceof Anthropic.RateLimitError || err instanceof OpenAI.RateLimitError) return "The model is busy — try again in a minute.";
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) return `Model error (${err.status}). Try again or switch models.`;
  if (err instanceof AgentRunError) return err.message;
  return "The agent run failed.";
}

/**
 * Supervisor pattern: the manager LLM decides which sub-agent to call, up to maxCalls times,
 * collecting their outputs before producing a final answer.
 */
async function runSupervisor(
  spec: AgentSpec,
  input: string,
  history: HistoryTurn[],
  llm: ResolvedProvider,
  subAgentSpecs: Array<{ ref: AgentSpec["subAgents"][0]; spec: AgentSpec }>,
  onStep: StepFn,
): Promise<{ text: string; tokens: number }> {
  if (!subAgentSpecs.length) return { text: "(No sub-agents configured)", tokens: 0 };

  const subList = subAgentSpecs.map((s, i) => `${i + 1}. ${s.ref.label || s.spec.name}: ${s.spec.instructions.slice(0, 120)}`).join("\n");
  const managerSystem = `You are a coordinator agent. Given a user request, call the appropriate specialist agents one at a time using the delegate tool, then synthesise their outputs into a final answer.\n\nAvailable specialists:\n${subList}`;

  const client = llm.provider === "openai" ? openaiClient(llm.apiKey) : null;
  const anthropic = llm.provider === "anthropic" ? new Anthropic({ apiKey: llm.apiKey }) : null;

  const delegateTool = {
    name: "delegate",
    description: "Call a specialist agent with an input message. Returns the specialist's reply.",
    input_schema: {
      type: "object" as const,
      properties: {
        specialist_index: { type: "number", description: "1-based index from the specialist list" },
        input: { type: "string", description: "The message to send to the specialist" },
      },
      required: ["specialist_index", "input"],
    },
  };

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: input },
  ];

  let totalTokens = 0;
  let callsLeft = spec.managerMaxCalls;

  for (let turn = 0; turn < MAX_TURNS && callsLeft > 0; turn++) {
    if (anthropic) {
      const res = await anthropic.messages.create({
        model: "claude-opus-5",
        max_tokens: 1024,
        system: managerSystem,
        messages,
        tools: [delegateTool as unknown as Anthropic.Tool],
      });
      totalTokens += (res.usage.input_tokens ?? 0) + (res.usage.output_tokens ?? 0);

      const assistantContent: Anthropic.ContentBlock[] = res.content;
      messages.push({ role: "assistant", content: assistantContent });

      if (res.stop_reason === "end_turn") {
        const text = assistantContent.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("");
        return { text, tokens: totalTokens };
      }

      const toolUses = assistantContent.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
      if (!toolUses.length) break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const { specialist_index, input: subInput } = use.input as { specialist_index: number; input: string };
        const sub = subAgentSpecs[specialist_index - 1];
        if (!sub) { toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "Specialist not found." }); continue; }

        const t0 = Date.now();
        callsLeft--;
        const subResult = await runAgent({ spec: sub.spec, input: subInput, history: [], llm });
        totalTokens += subResult.tokens;
        onStep({
          type: "manager_call",
          title: `→ ${sub.ref.label || sub.spec.name}`,
          detail: subInput.slice(0, 120),
          result: subResult.text.slice(0, 200),
          ms: Date.now() - t0,
          tokens: subResult.tokens,
          subSteps: subResult.steps,
        });
        toolResults.push({ type: "tool_result", tool_use_id: use.id, content: subResult.text });
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      // OpenAI path
      const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: managerSystem },
        ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: input },
      ];
      const res = await client!.chat.completions.create({
        model: openaiModelFor(Boolean(llm.apiKey)),
        messages: openaiMessages,
        tools: [{ type: "function", function: { name: "delegate", description: delegateTool.description, parameters: delegateTool.input_schema } }],
        tool_choice: "auto",
      });
      totalTokens += (res.usage?.total_tokens ?? 0);
      const msg = res.choices[0].message;
      if (!msg.tool_calls?.length) return { text: msg.content ?? "", tokens: totalTokens };

      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;
        const args = JSON.parse(tc.function.arguments) as { specialist_index: number; input: string };
        const sub = subAgentSpecs[args.specialist_index - 1];
        if (!sub) continue;
        callsLeft--;
        const t0 = Date.now();
        const subResult = await runAgent({ spec: sub.spec, input: args.input, history: [], llm });
        totalTokens += subResult.tokens;
        onStep({
          type: "manager_call",
          title: `→ ${sub.ref.label || sub.spec.name}`,
          detail: args.input.slice(0, 120),
          result: subResult.text.slice(0, 200),
          ms: Date.now() - t0,
          tokens: subResult.tokens,
          subSteps: subResult.steps,
        });
      }
      return { text: msg.content ?? "(No final answer)", tokens: totalTokens };
    }
  }
  return { text: "(Manager reached call limit)", tokens: totalTokens };
}

export async function runAgent({ spec: compiled, input, history, llm, loadDocs, onStep, slackWebhookUrl, supabase, agentId, projectId }: RunOptions): Promise<RunResult> {
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
      const allPassages = chunkDocs(docs.map((d) => ({ name: d.name, pages: d.content as string[] })));

      // Build hybrid options when we have a DB client and can embed the query.
      let hybrid: HybridOptions | undefined;
      if (supabase && agentId) {
        const embedding = await embedText(query, llm).catch(() => null);
        if (embedding) {
          // Use the first knowledge node id; multi-node hybrid is a future improvement.
          const nodeId = spec.knowledgeNodeIds[0];
          hybrid = { supabase, agentId, nodeId, embedding };
        }
      }

      passages = await rank(allPassages, query, 6, hybrid);
      step({
        type: "knowledge",
        title: passages.length ? `Retrieved ${passages.length} passage${passages.length > 1 ? "s" : ""}` : `Searched ${docs.length} file${docs.length > 1 ? "s" : ""} — nothing relevant`,
        detail: passages.length ? describeSources(passages) : "The agent will say the documents don't cover this.",
        ms: Date.now() - t0,
      });
    }
  }
  if (spec.rules.length) step({ type: "guardrail", title: `${spec.rules.length} rule${spec.rules.length > 1 ? "s" : ""} active`, detail: spec.rules.join(" · ") });

  // Multi-agent: if a Manager node exists and sub-agents are linked, use the supervisor pattern.
  if (spec.subAgents.length && spec.managerMaxCalls > 0 && supabase) {
    const { compileAgent } = await import("@/lib/agent/compile");
    const subAgentSpecs: Array<{ ref: AgentSpec["subAgents"][0]; spec: AgentSpec }> = [];
    for (const ref of spec.subAgents) {
      const { data } = await supabase.from("agents").select("name, graph").eq("id", ref.id).single();
      if (data) subAgentSpecs.push({ ref, spec: compileAgent(data.graph, data.name) });
    }
    if (subAgentSpecs.length) {
      step({ type: "llm", title: `Coordinator routing to ${subAgentSpecs.length} specialist${subAgentSpecs.length > 1 ? "s" : ""}` });
      const mgr = await runSupervisor(spec, input, history, llm, subAgentSpecs, step);
      step({ type: "output", title: `Delivered as ${spec.output.toLowerCase()}` });
      return { text: mgr.text, steps, tokens: mgr.tokens, latencyMs: Date.now() - started, provider: llm.provider };
    }
  }

  // MCP server blocks add their tools for this run (the demo model can't call tools, so skip them there).
  const extraTools = spec.mcpServers.length && (llm.provider !== "demo" || compatibleHost(spec.model)) ? await connectMcpTools(spec, step) : [];
  const toolCtx: ToolContext = { slackWebhookUrl, supabase, projectId, extraTools };

  // Gemini and Llama run on their own OpenAI-compatible host, whatever key the caller resolved.
  const host = compatibleHost(spec.model);
  if (host) {
    const result = await runOpenAI(spec, history, input, step, passages, undefined, toolCtx, host);
    return finish(result, "openai");
  }

  // Run on the provider the Brain block asks for; the caller resolved a fallback if it isn't configured.
  const provider = llm.provider;
  const wantsOpenAI = spec.model.startsWith("gpt");
  if (provider !== "demo" && (provider === "openai") !== wantsOpenAI) {
    const fallback = provider === "openai" ? openaiModelFor(Boolean(llm.apiKey)) : "claude-opus-5";
    step({ type: "llm", title: `${modelLabel} isn't configured here — running on ${provider === "openai" ? fallback : "Claude Opus 5"}` });
    spec.model = fallback;
  }
  const result =
    provider === "anthropic"
      ? await runClaude(spec, history, input, step, passages, llm.apiKey, toolCtx)
      : provider === "openai"
        ? await runOpenAI(spec, history, input, step, passages, llm.apiKey, toolCtx)
        : await runDemo(spec, input, step, passages);
  return finish(result, provider);

  function finish(result: { text: string; tokens: number }, ranOn: RunResult["provider"]): RunResult {
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
    return { text, steps, tokens: result.tokens, latencyMs: Date.now() - started, provider: ranOn };
  }
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

// Catalog tools without a dedicated schema take a plain-language request.
const GENERIC_INPUT: Anthropic.Beta.BetaTool["input_schema"] = {
  type: "object",
  properties: {
    action: { type: "string", description: "What to do, e.g. 'search', 'create', 'update'." },
    details: { type: "string", description: "Everything the tool needs to do it, in plain words." },
  },
  required: ["action", "details"],
};

/** The input schema the model sees for a catalog tool, or undefined for tools the runner doesn't offer. */
export function toolInputSchema(id: string) {
  if (CLIENT_TOOLS[id]) return CLIENT_TOOLS[id];
  return id !== "web_search" && TOOL_CATALOG.some((t) => t.id === id) ? GENERIC_INPUT : undefined;
}

// Only Slack incoming webhook URLs are permitted — blocks SSRF against internal services.
const SLACK_WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/;

/** A tool that isn't in the catalog, such as one offered by a connected MCP server. */
export type ExtraTool = {
  name: string;
  label: string;
  description: string;
  schema: Anthropic.Beta.BetaTool["input_schema"];
  call: (input: Record<string, unknown>) => Promise<{ output: string; live: boolean }>;
};

export type ToolContext = {
  slackWebhookUrl?: string;
  supabase?: SupabaseClient;
  projectId?: string;
  extraTools?: ExtraTool[];
};

/** Connects the agent's MCP server blocks and turns their tools into ones the model can call. */
async function connectMcpTools(spec: AgentSpec, step: StepFn): Promise<ExtraTool[]> {
  const tools: ExtraTool[] = [];
  for (const [i, server] of spec.mcpServers.entries()) {
    const host = (() => {
      try {
        return new URL(server.url).host;
      } catch {
        return server.url;
      }
    })();
    const t0 = Date.now();
    try {
      const session = await McpSession.connect(server.url, mcpToken(server.token));
      const listed = await session.listTools();
      for (const tool of listed) {
        tools.push({
          name: mcpToolName(i, tool.name),
          label: `${tool.name} (MCP)`,
          description: `${tool.description ?? tool.name}${server.description ? ` From ${server.description}.` : ""}`.slice(0, 1000),
          schema: (tool.inputSchema?.type === "object" ? tool.inputSchema : { type: "object", properties: {} }) as Anthropic.Beta.BetaTool["input_schema"],
          call: async (input) => {
            const r = await session.callTool(tool.name, input);
            return { output: r.isError ? JSON.stringify({ error: r.text }) : r.text, live: true };
          },
        });
      }
      step({ type: "tool", title: `Connected to MCP server ${host}`, detail: listed.length ? listed.map((t) => t.name).join(", ") : "No tools offered", ms: Date.now() - t0, live: true });
    } catch (err) {
      step({ type: "tool", title: `Couldn't connect to MCP server ${host}`, detail: err instanceof Error ? err.message : "Connection failed", ms: Date.now() - t0 });
    }
  }
  return tools;
}

/** Executes a tool call. Returns the JSON result and whether it ran for real. */
export async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext = {},
): Promise<{ output: string; live: boolean }> {
  const { slackWebhookUrl, supabase, projectId } = ctx;

  const extra = ctx.extraTools?.find((t) => t.name === name);
  if (extra) {
    try {
      return await extra.call(input);
    } catch (err) {
      return { output: JSON.stringify({ error: err instanceof Error ? err.message : "The tool failed." }), live: true };
    }
  }

  // ── Slack ──────────────────────────────────────────────────────────────────
  if (name === "slack_message") {
    // Prefer OAuth connector token over legacy incoming webhook.
    if (supabase && projectId) {
      const connector = await resolveConnector("slack", projectId, supabase).catch(() => null);
      if (connector) {
        const channel = String(input.channel ?? connector.meta["channel_default"] ?? "#general");
        const result = await postSlackMessage(connector.accessToken, channel, String(input.text ?? "")).catch(() => null);
        if (result?.ok) return { output: JSON.stringify({ ok: true, channel, ts: result.ts }), live: true };
      }
    }
    if (slackWebhookUrl && SLACK_WEBHOOK_RE.test(slackWebhookUrl)) {
      // A saved webhook is a real attempt. When Slack turns it down, say why: a simulated "ok" here
      // would have the agent report a post that never arrived.
      try {
        const res = await fetch(slackWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: String(input.text ?? "") }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          return { output: JSON.stringify({ ok: true, channel: input.channel, note: "Posted through the saved webhook, which delivers to the channel it was created for." }), live: true };
        }
        const reason = (await res.text().catch(() => "")).trim().slice(0, 80);
        return {
          output: JSON.stringify({ ok: false, error: `Slack didn't accept the message (${res.status}${reason ? `: ${reason}` : ""}). It was not posted. Check the webhook saved for this project.` }),
          live: true,
        };
      } catch {
        return { output: JSON.stringify({ ok: false, error: "Couldn't reach Slack. The message was not posted." }), live: true };
      }
    }
  }

  // ── Gmail ──────────────────────────────────────────────────────────────────
  if (name === "send_email" && supabase && projectId) {
    const connector = await resolveConnector("gmail", projectId, supabase).catch(() => null);
    if (connector) {
      const result = await sendGmail(
        connector.accessToken,
        String(input.to ?? ""),
        String(input.subject ?? "(no subject)"),
        String(input.body ?? ""),
      ).catch(() => null);
      if (result?.ok) return { output: JSON.stringify({ status: "sent", messageId: result.messageId }), live: true };
    }
  }

  // ── HubSpot ────────────────────────────────────────────────────────────────
  if (name === "crm_lookup" && supabase && projectId) {
    const connector = await resolveConnector("hubspot", projectId, supabase).catch(() => null);
    if (connector) {
      const result = await upsertContact(
        connector.accessToken,
        String(input.email ?? ""),
        typeof input.fields === "object" && input.fields ? (input.fields as Record<string, string>) : {},
      ).catch(() => null);
      if (result?.ok) return { output: JSON.stringify({ contactId: result.contactId, status: "upserted" }), live: true };
    }
  }

  return { output: simulateTool(name, input), live: false };
}

const shortId = () => Math.random().toString(36).slice(2, 10);

// Integrations aren't connected in the sandbox, so tool calls return realistic simulated results.
export function simulateTool(name: string, input: Record<string, unknown>): string {
  const details = String(input.details ?? input.query ?? "").slice(0, 120);
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
    case "arxiv_search":
      return JSON.stringify({ papers: [{ title: `Recent work on ${details || "the topic"}`, authors: ["A. Rao", "M. Chen"], year: 2026, url: "https://arxiv.org/abs/2609.01234" }] });
    case "teams_message":
    case "telegram_message":
      return JSON.stringify({ ok: true, message_id: shortId(), text: details });
    case "tweet":
    case "linkedin_post":
      return JSON.stringify({ status: "draft_created", id: shortId(), text: details });
    case "google_calendar":
      return JSON.stringify({ event_id: shortId(), status: "confirmed", summary: details, start: "2026-10-06T10:00:00+05:30" });
    case "google_docs":
    case "notion":
    case "confluence":
      return JSON.stringify({ page_id: shortId(), title: details || "Untitled", url: `https://example.com/${name}/${shortId()}` });
    case "google_drive":
    case "dropbox":
      return JSON.stringify({ files: [{ name: "Q3 report.pdf", modified: "2026-09-28" }, { name: "Notes.docx", modified: "2026-09-21" }] });
    case "asana":
    case "trello":
    case "linear":
    case "jira":
      return JSON.stringify({ id: name === "jira" ? `PROJ-${100 + Math.floor(Math.random() * 900)}` : shortId(), status: "created", title: details });
    case "apollo":
      return JSON.stringify({ people: [{ name: "Meera Iyer", title: "VP Operations", company: "Northwind Logistics", email: "meera@northwind.example" }] });
    case "freshdesk":
      return JSON.stringify({ ticket_id: 4000 + Math.floor(Math.random() * 1000), status: "open", subject: details });
    case "google_sheets":
    case "excel":
      return JSON.stringify({ rows: [["Region", "Revenue"], ["North", 128000], ["South", 96500]], note: "Sample data" });
    case "github_action":
      return JSON.stringify({ number: 42, state: "open", title: details, url: "https://github.com/acme/app/pull/42" });
    default:
      return JSON.stringify({ error: `Unknown tool ${name}` });
  }
}

function buildTools(spec: AgentSpec, extra: ExtraTool[] = []): Anthropic.Beta.BetaToolUnion[] {
  const tools: Anthropic.Beta.BetaToolUnion[] = extra.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
  for (const id of spec.tools) {
    if (id === "web_search") {
      tools.push(
        spec.model === "claude-haiku-4-5"
          ? { type: "web_search_20250305", name: "web_search", max_uses: 3 }
          : { type: "web_search_20260209", name: "web_search", max_uses: 3 },
      );
    } else {
      const schema = toolInputSchema(id);
      const meta = TOOL_CATALOG.find((t) => t.id === id);
      if (schema && meta) tools.push({ name: id, description: meta.description, input_schema: schema });
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
  toolCtx: ToolContext = {},
): Promise<{ text: string; tokens: number }> {
  const client = new Anthropic(apiKey ? { apiKey } : {});
  const tools = buildTools(spec, toolCtx.extraTools);
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
      // On the last turn tools are off, so a model that keeps calling them still answers with what it has.
      ...(tools.length ? { tools, ...(turn === MAX_TURNS - 1 ? { tool_choice: { type: "none" as const } } : {}) } : {}),
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
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (use) => {
          const toolInput = (use.input ?? {}) as Record<string, unknown>;
          const { output, live } = await executeToolCall(use.name, toolInput, toolCtx);
          const meta = TOOL_CATALOG.find((t) => t.id === use.name) ?? toolCtx.extraTools?.find((t) => t.name === use.name);
          step({ type: "tool", title: meta?.label ?? use.name, detail: JSON.stringify(toolInput).slice(0, 200), result: output.slice(0, 300), simulated: !live, live });
          return { type: "tool_result" as const, tool_use_id: use.id, content: output };
        }),
      );
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
  toolCtx: ToolContext = {},
  host?: CompatibleHost | null,
): Promise<{ text: string; tokens: number }> {
  const client = host ? new OpenAI({ apiKey: host.apiKey, baseURL: host.baseURL, fetch: patientFetch }) : openaiClient(apiKey);
  const model = host ? host.model : openaiModelFor(Boolean(apiKey), spec.model);
  const tools: OpenAI.Chat.Completions.ChatCompletionFunctionTool[] = spec.tools
    .filter((id) => id === "web_search" || toolInputSchema(id))
    .map((id) => ({
      type: "function",
      function: {
        name: id,
        description: TOOL_CATALOG.find((t) => t.id === id)?.description ?? id,
        parameters: (id === "web_search"
          ? { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
          : toolInputSchema(id)) as Record<string, unknown>,
      },
    }));
  for (const t of toolCtx.extraTools ?? []) {
    tools.push({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema as Record<string, unknown> } });
  }
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
      ...(tools.length ? { tools, ...(turn === MAX_TURNS - 1 ? { tool_choice: "none" as const } : {}) } : {}),
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
        const { output, live } = await executeToolCall(call.function.name, args, toolCtx);
        const meta = TOOL_CATALOG.find((t) => t.id === call.function.name) ?? toolCtx.extraTools?.find((t) => t.name === call.function.name);
        step({ type: "tool", title: meta?.label ?? call.function.name, detail: JSON.stringify(args).slice(0, 200), result: output.slice(0, 300), simulated: !live, live });
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
