import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { compileAgent } from "@/lib/agent/compile";
import { describeRunError, runAgent, unavailableModel, type KnowledgeDoc } from "@/lib/agent/run";
import type { AgentGraph } from "@/lib/agent/types";
import { resolveProvider } from "@/lib/ai/keys";
import { OUT_OF_CREDITS } from "@/lib/credits";
import { decrypt } from "@/lib/crypto";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/env";

// Runs scheduled agents (Agent tab → trigger "Schedule"). Something calls this every minute with
// `Authorization: Bearer <CRON_SECRET>`: Supabase pg_cron + pg_net, cron-job.org, or Vercel Cron.
// The database decides what's due and checks the same secret, so no service-role key is needed.

export const maxDuration = 300;

type Claimed = {
  run_id: string;
  schedule_id: string;
  input: string;
  agent: { id: string; name: string; graph: AgentGraph; project_id: string | null };
  credits: number | null;
  provider: "anthropic" | "openai" | null;
  secrets: { anthropic_key: string | null; openai_key: string | null } | null;
  slack_webhook: string | null;
  docs: KnowledgeDoc[];
};

async function handle(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || !isSupabaseConfigured) return Response.json({ error: "The scheduler isn't configured on this server (CRON_SECRET)." }, { status: 503 });
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (secret !== expected) return Response.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("scheduler_claim", { p_secret: secret });
  if (error) {
    const missing = error.code === "PGRST202";
    if (!missing) console.error("[cron] claim", error.message);
    return Response.json({ error: missing ? "Run supabase/migrations/0017_schedules.sql first." : "Couldn't read the schedules." }, { status: missing ? 503 : 500 });
  }
  const claim = data as { status: "ok"; runs: Claimed[] } | { status: "forbidden" };
  if (claim.status !== "ok") return Response.json({ error: "CRON_SECRET doesn't match private.scheduler_secret." }, { status: 403 });

  const results = [];
  for (const run of claim.runs) {
    results.push(await execute(supabase, secret, run));
  }
  return Response.json({ ran: results.length, results }, { headers: { "Cache-Control": "no-store" } });
}

async function execute(supabase: SupabaseClient, secret: string, run: Claimed) {
  const finish = (status: "ok" | "error", fields: { output?: string; error?: string; trace?: unknown; tokens?: number; latencyMs?: number; charge?: boolean; provider?: string }) =>
    supabase.rpc("scheduler_finish", {
      p_secret: secret,
      p_run_id: run.run_id,
      p_status: status,
      p_output: fields.output ?? null,
      p_error: fields.error ?? null,
      p_trace: fields.trace ?? null,
      p_tokens: fields.tokens ?? 0,
      p_latency_ms: fields.latencyMs ?? 0,
      p_charge: fields.charge ?? false,
      p_provider: fields.provider ?? null,
    });

  const spec = compileAgent(run.agent.graph, run.agent.name);
  const unavailable = unavailableModel(spec);
  if (unavailable) {
    await finish("error", { error: unavailable });
    return { schedule_id: run.schedule_id, status: "error", error: unavailable };
  }
  const llm = resolveProvider(
    { anthropicKey: decrypt(run.secrets?.anthropic_key), openaiKey: decrypt(run.secrets?.openai_key), preference: run.provider },
    spec.model.startsWith("gpt") ? "openai" : "anthropic",
  );
  if ((run.credits ?? 0) <= 0 && !llm.byok) {
    await finish("error", { error: OUT_OF_CREDITS });
    return { schedule_id: run.schedule_id, status: "error", error: OUT_OF_CREDITS };
  }
  const slackWebhookUrl = spec.tools.includes("slack_message") ? (decrypt(run.slack_webhook) ?? undefined) : undefined;

  const started = Date.now();
  try {
    const result = await runAgent({ spec, input: run.input, history: [], llm, loadDocs: async () => run.docs, slackWebhookUrl, projectId: run.agent.project_id ?? undefined });
    await finish("ok", { output: result.text, trace: result.steps, tokens: result.tokens, latencyMs: result.latencyMs, charge: !llm.byok, provider: result.provider });
    return { schedule_id: run.schedule_id, status: "ok", latency_ms: result.latencyMs };
  } catch (err) {
    console.error("[cron] run", err);
    const message = describeRunError(err);
    await finish("error", { error: message, latencyMs: Date.now() - started });
    return { schedule_id: run.schedule_id, status: "error", error: message };
  }
}

export const GET = handle;
export const POST = handle;
