import "server-only";
import { createClient } from "@supabase/supabase-js";
import { compileAgent } from "@/lib/agent/compile";
import { describeRunError, runAgent, unavailableModel, type KnowledgeDoc } from "@/lib/agent/run";
import type { AgentGraph } from "@/lib/agent/types";
import { hashApiKey } from "@/lib/api-keys";
import { resolveProvider } from "@/lib/ai/keys";
import { decrypt } from "@/lib/crypto";
import { OUT_OF_CREDITS } from "@/lib/credits";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import type { TraceStep } from "@/lib/agent/trace";

// One agent run authorised by an agent API key. The REST API (/api/v1/agents/:id/run) and the MCP
// server (/api/mcp/:agentId) both use it, so keys, rate limits, credits and logs behave the same.

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

export type KeyedRun =
  | { ok: true; output: string; trace: TraceStep[]; tokens: number; latencyMs: number; simulated: boolean; headers: Record<string, string> }
  | { ok: false; status: number; code: string; message: string; headers: Record<string, string> };

export async function runWithApiKey(agentId: string, key: string, input: string, history: { role: "user" | "assistant"; content: string }[] = []): Promise<KeyedRun> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const keyHash = hashApiKey(key);
  const { data, error } = await supabase.rpc("api_begin_run", { p_key_hash: keyHash, p_agent_id: agentId });
  if (error) {
    console.error("[api-run] begin", error.message);
    return { ok: false, status: 500, code: "internal_error", message: "Something went wrong on our side.", headers: {} };
  }
  const begin = data as Begin;
  if (begin.status === "invalid_key") return { ok: false, status: 401, code: "invalid_key", message: "This key is invalid, revoked, or belongs to a different agent.", headers: {} };
  if (begin.status === "rate_limited") {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      message: `Rate limit is ${begin.limit} requests per minute per key.`,
      headers: { "Retry-After": String(Math.max(1, begin.retry_after)), "X-RateLimit-Limit": String(begin.limit), "X-RateLimit-Remaining": "0" },
    };
  }
  const headers = { "X-RateLimit-Limit": String(begin.limit), "X-RateLimit-Remaining": String(Math.max(0, begin.remaining)) };

  const spec = compileAgent(begin.agent.graph, begin.agent.name);
  const unavailable = unavailableModel(spec);
  if (unavailable) return { ok: false, status: 400, code: "model_unavailable", message: unavailable, headers };
  const llm = resolveProvider(
    { anthropicKey: decrypt(begin.secrets.anthropic_key), openaiKey: decrypt(begin.secrets.openai_key), preference: begin.provider },
    spec.model.startsWith("gpt") ? "openai" : "anthropic",
  );
  if (begin.credits <= 0 && !llm.byok) return { ok: false, status: 402, code: "out_of_credits", message: OUT_OF_CREDITS, headers };

  const slackWebhookUrl = spec.tools.includes("slack_message") ? (decrypt(begin.slack_webhook) ?? undefined) : undefined;
  try {
    const run = await runAgent({ spec, input, history, llm, loadDocs: async () => begin.docs, slackWebhookUrl });
    // Also samples 1 in 10 runs into the owner's eval suggestions (see 0014_eval_sampling.sql).
    const { error: finishError } = await supabase.rpc("api_finish_run", {
      p_key_hash: keyHash,
      p_call_id: begin.call_id,
      p_input: input,
      p_output: run.text,
      p_trace: run.steps,
      p_tokens: run.tokens,
      p_latency_ms: run.latencyMs,
      p_charge: !llm.byok,
      p_provider: run.provider,
    });
    if (finishError) console.error("[api-run] finish", finishError.message);
    return { ok: true, output: run.text, trace: run.steps, tokens: run.tokens, latencyMs: run.latencyMs, simulated: run.provider === "demo", headers };
  } catch (err) {
    console.error("[api-run] run", err);
    return { ok: false, status: 502, code: "run_failed", message: describeRunError(err), headers };
  }
}
