import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { compileAgent } from "@/lib/agent/compile";
import { describeRunError, runAgent, unavailableModel, type KnowledgeDoc } from "@/lib/agent/run";
import type { AgentGraph } from "@/lib/agent/types";
import { hashApiKey, parseBearer } from "@/lib/api-keys";
import { resolveProvider } from "@/lib/ai/keys";
import { decrypt } from "@/lib/crypto";
import { OUT_OF_CREDITS } from "@/lib/credits";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/env";

// Public agent API. Authenticated by an agent API key (no session cookies), no CORS headers,
// so browsers on other origins can't call it; use it from a server.

export const maxDuration = 120;

const Body = z.object({
  input: z.string().trim().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(20)
    .default([]),
});

type Begin =
  | { status: "invalid_key" }
  | { status: "rate_limited"; limit: number; retry_after: number }
  | {
      status: "ok";
      call_id: string;
      limit: number;
      remaining: number;
      credits: number;
      agent: { name: string; graph: AgentGraph };
      secrets: { anthropic_key: string | null; openai_key: string | null };
      slack_webhook: string | null;
      provider: "anthropic" | "openai" | null;
      docs: KnowledgeDoc[];
    };

function fail(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(request: Request, ctx: RouteContext<"/api/v1/agents/[id]/run">) {
  const key = parseBearer(request.headers.get("authorization"));
  if (!key) return fail(401, "unauthorized", "Send your agent API key as `Authorization: Bearer arc_live_…`.");
  if (!isSupabaseConfigured) return fail(503, "not_configured", "The backend isn't configured.");
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return fail(404, "not_found", "No agent with that id.");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "invalid_request", "Body must be JSON: { \"input\": string, \"history\"?: [{ role, content }] }.");
  const body = parsed.data;

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const keyHash = hashApiKey(key);
  const { data, error } = await supabase.rpc("api_begin_run", { p_key_hash: keyHash, p_agent_id: id });
  if (error) {
    console.error("[api/v1] begin", error.message);
    return fail(500, "internal_error", "Something went wrong on our side.");
  }
  const begin = data as Begin;
  if (begin.status === "invalid_key") return fail(401, "invalid_key", "This key is invalid, revoked, or belongs to a different agent.");
  if (begin.status === "rate_limited") {
    return fail(429, "rate_limited", `Rate limit is ${begin.limit} requests per minute per key.`, {
      "Retry-After": String(Math.max(1, begin.retry_after)),
      "X-RateLimit-Limit": String(begin.limit),
      "X-RateLimit-Remaining": "0",
    });
  }
  const limitHeaders = { "X-RateLimit-Limit": String(begin.limit), "X-RateLimit-Remaining": String(Math.max(0, begin.remaining)) };

  const spec = compileAgent(begin.agent.graph, begin.agent.name);
  const unavailable = unavailableModel(spec);
  if (unavailable) return fail(400, "model_unavailable", unavailable, limitHeaders);
  const llm = resolveProvider(
    { anthropicKey: decrypt(begin.secrets.anthropic_key), openaiKey: decrypt(begin.secrets.openai_key), preference: begin.provider },
    spec.model.startsWith("gpt") ? "openai" : "anthropic",
  );
  if (begin.credits <= 0 && !llm.byok) return fail(402, "out_of_credits", OUT_OF_CREDITS, limitHeaders);

  const slackWebhookUrl = spec.tools.includes("slack_message") ? (decrypt(begin.slack_webhook) ?? undefined) : undefined;

  try {
    const run = await runAgent({ spec, input: body.input, history: body.history, llm, loadDocs: async () => begin.docs, slackWebhookUrl });
    // Also samples 1 in 10 runs into the owner's eval suggestions (see 0014_eval_sampling.sql).
    const { error: finishError } = await supabase.rpc("api_finish_run", {
      p_key_hash: keyHash,
      p_call_id: begin.call_id,
      p_input: body.input,
      p_output: run.text,
      p_trace: run.steps,
      p_tokens: run.tokens,
      p_latency_ms: run.latencyMs,
      p_charge: !llm.byok,
      p_provider: run.provider,
    });
    if (finishError) console.error("[api/v1] finish", finishError.message);

    return Response.json(
      {
        output: run.text,
        trace: run.steps.map((s) => ({ type: s.type, title: s.title, detail: s.detail, result: s.result, ms: s.ms, tokens: s.tokens, simulated: s.simulated, live: s.live })),
        tokens: run.tokens,
        latency_ms: run.latencyMs,
        simulated: run.provider === "demo",
      },
      { headers: { "Cache-Control": "no-store", ...limitHeaders } },
    );
  } catch (err) {
    console.error("[api/v1] run", err);
    return fail(502, "run_failed", describeRunError(err), limitHeaders);
  }
}
