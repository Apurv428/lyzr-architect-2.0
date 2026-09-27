import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { compileAgent } from "@/lib/agent/compile";
import { describeRunError, runAgent, unavailableModel, type KnowledgeDoc } from "@/lib/agent/run";
import type { TraceStep } from "@/lib/agent/trace";
import type { AgentGraph } from "@/lib/agent/types";
import { resolveProvider } from "@/lib/ai/keys";
import { decrypt } from "@/lib/crypto";
import { OUT_OF_CREDITS } from "@/lib/credits";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/env";
import { TOKEN_PATTERN, forwardResult, hashWebhookToken, webhookInput } from "@/lib/webhooks";

// Inbound webhook: any app can POST JSON (or text, or a form) to the secret URL to run the agent.
// Without a forward URL the agent's answer comes back in the response. With one, the call is
// accepted at once (202) and the signed result is POSTed to the forward URL when the run finishes.

export const maxDuration = 120;

const MAX_BODY_BYTES = 64 * 1024;

type Begin =
  | { status: "not_found" }
  | { status: "disabled" }
  | { status: "rate_limited"; limit: number; retry_after: number }
  | {
      status: "ok";
      call_id: string;
      limit: number;
      remaining: number;
      credits: number;
      webhook: { id: string; name: string; forward_url: string | null; signing_secret: string };
      agent: { id: string; name: string; graph: AgentGraph };
      secrets: { anthropic_key: string | null; openai_key: string | null };
      slack_webhook: string | null;
      provider: "anthropic" | "openai" | null;
      docs: KnowledgeDoc[];
    };

type Ready = Extract<Begin, { status: "ok" }>;

type Outcome =
  | { status: "ok"; output: string; trace: TraceStep[]; tokens: number; latencyMs: number; provider: string; simulated: boolean }
  | { status: "error"; error: string; latencyMs: number };

function fail(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** JSON, form posts and plain text are all accepted; the agent gets a readable version of each. */
async function readPayload(request: Request): Promise<{ payload: unknown } | { error: Response }> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return { error: fail(413, "payload_too_large", "Payloads are limited to 64 KB.") };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: fail(413, "payload_too_large", "Payloads are limited to 64 KB.") };
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded")) return { payload: Object.fromEntries(new URLSearchParams(text)) };
  if (type.includes("json")) {
    try {
      return { payload: JSON.parse(text) };
    } catch {
      return { error: fail(400, "invalid_json", "The body isn't valid JSON.") };
    }
  }
  try {
    return { payload: JSON.parse(text) };
  } catch {
    return { payload: text };
  }
}

export function GET() {
  return fail(405, "method_not_allowed", "Send a POST with a JSON body to run the agent.", { Allow: "POST" });
}

export async function POST(request: Request, ctx: RouteContext<"/api/hooks/[token]">) {
  const { token } = await ctx.params;
  if (!TOKEN_PATTERN.test(token)) return fail(404, "not_found", "No webhook at this URL.");
  if (!isSupabaseConfigured) return fail(503, "not_configured", "The backend isn't configured.");

  const read = await readPayload(request);
  if ("error" in read) return read.error;
  const input = webhookInput(read.payload);
  if (!input) return fail(400, "empty_payload", "Send a JSON body or text to run the agent.");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tokenHash = hashWebhookToken(token);
  const { data, error } = await supabase.rpc("webhook_begin_run", { p_token_hash: tokenHash, p_input: input });
  if (error) {
    console.error("[hooks] begin", error.message);
    // PGRST202: the database function is missing, i.e. migration 0015_webhooks.sql hasn't been applied.
    if (error.code === "PGRST202") return fail(503, "not_configured", "Webhooks aren't set up on this server yet.");
    return fail(500, "internal_error", "Something went wrong on our side.");
  }
  const begin = data as Begin;
  if (begin.status === "not_found") return fail(404, "not_found", "No webhook at this URL. It may have been deleted or its URL rotated.");
  if (begin.status === "disabled") return fail(403, "webhook_paused", "This webhook is paused. Resume it in Integrations.");
  if (begin.status === "rate_limited") {
    return fail(429, "rate_limited", `Rate limit is ${begin.limit} calls per minute per webhook.`, {
      "Retry-After": String(Math.max(1, begin.retry_after)),
    });
  }
  // Narrowed once here, so the run closure below keeps the "ok" shape.
  const ready: Ready = begin;
  const headers = { "Cache-Control": "no-store", "X-RateLimit-Limit": String(ready.limit), "X-RateLimit-Remaining": String(Math.max(0, ready.remaining)) };

  const finish = async (outcome: Outcome, forwardStatus: number | null, charge: boolean) => {
    const { error: finishError } = await supabase.rpc("webhook_finish_run", {
      p_token_hash: tokenHash,
      p_call_id: ready.call_id,
      p_status: outcome.status,
      p_output: outcome.status === "ok" ? outcome.output : null,
      p_error: outcome.status === "error" ? outcome.error : null,
      p_trace: outcome.status === "ok" ? outcome.trace : null,
      p_tokens: outcome.status === "ok" ? outcome.tokens : 0,
      p_latency_ms: outcome.latencyMs,
      p_forward_status: forwardStatus,
      p_charge: charge,
      p_provider: outcome.status === "ok" ? outcome.provider : null,
    });
    if (finishError) console.error("[hooks] finish", finishError.message);
  };

  const spec = compileAgent(ready.agent.graph, ready.agent.name);
  const unavailable = unavailableModel(spec);
  if (unavailable) {
    await finish({ status: "error", error: unavailable, latencyMs: 0 }, null, false);
    return fail(400, "model_unavailable", unavailable, headers);
  }
  const llm = resolveProvider(
    { anthropicKey: decrypt(ready.secrets.anthropic_key), openaiKey: decrypt(ready.secrets.openai_key), preference: ready.provider },
    spec.model.startsWith("gpt") ? "openai" : "anthropic",
  );
  if (ready.credits <= 0 && !llm.byok) {
    await finish({ status: "error", error: OUT_OF_CREDITS, latencyMs: 0 }, null, false);
    return fail(402, "out_of_credits", OUT_OF_CREDITS, headers);
  }
  const slackWebhookUrl = spec.tools.includes("slack_message") ? (decrypt(ready.slack_webhook) ?? undefined) : undefined;

  const execute = async (): Promise<Outcome> => {
    const started = Date.now();
    let outcome: Outcome;
    try {
      const run = await runAgent({ spec, input, history: [], llm, loadDocs: async () => ready.docs, slackWebhookUrl });
      outcome = { status: "ok", output: run.text, trace: run.steps, tokens: run.tokens, latencyMs: run.latencyMs, provider: run.provider, simulated: run.provider === "demo" };
    } catch (err) {
      console.error("[hooks] run", err);
      outcome = { status: "error", error: describeRunError(err), latencyMs: Date.now() - started };
    }

    let forwardStatus: number | null = null;
    const secret = ready.webhook.forward_url ? decrypt(ready.webhook.signing_secret) : null;
    if (ready.webhook.forward_url && secret) {
      forwardStatus = await forwardResult(ready.webhook.forward_url, secret, outcome.status === "ok" ? "agent.run.completed" : "agent.run.failed", {
        call_id: ready.call_id,
        webhook: { id: ready.webhook.id, name: ready.webhook.name },
        agent: { id: ready.agent.id, name: ready.agent.name },
        input,
        ...(outcome.status === "ok" ? { output: outcome.output } : { error: outcome.error }),
        latency_ms: outcome.latencyMs,
        created_at: new Date().toISOString(),
      });
    }
    await finish(outcome, forwardStatus, outcome.status === "ok" && !llm.byok);
    return outcome;
  };

  if (ready.webhook.forward_url) {
    after(execute);
    return Response.json({ accepted: true, call_id: ready.call_id }, { status: 202, headers });
  }

  const outcome = await execute();
  if (outcome.status === "error") return fail(502, "run_failed", outcome.error, headers);
  return Response.json({ call_id: ready.call_id, output: outcome.output, latency_ms: outcome.latencyMs, simulated: outcome.simulated }, { headers });
}
