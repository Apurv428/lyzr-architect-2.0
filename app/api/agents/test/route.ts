import { z } from "zod";
import { compileAgent } from "@/lib/agent/compile";
import { describeRunError, runAgent, unavailableModel } from "@/lib/agent/run";
import type { AgentGraph } from "@/lib/agent/types";
import type { TraceEvent } from "@/lib/agent/trace";
import { resolveProvider, userAI } from "@/lib/ai/keys";
import { track } from "@/lib/analytics";
import { OUT_OF_CREDITS, currentCredits, spendCredit } from "@/lib/credits";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const Body = z.object({
  agentId: z.string().uuid(),
  name: z.string().max(120),
  graph: z.object({ nodes: z.array(z.any()).max(40), edges: z.array(z.any()).max(80) }),
  input: z.string().trim().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(20)
    .default([]),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured) return Response.json({ error: "Backend not configured" }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const body = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: agent }, credits, ai] = await Promise.all([
    supabase.from("agents").select("id").eq("id", body.agentId).single(),
    currentCredits(supabase),
    userAI(supabase, user.id),
  ]);
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  const spec = compileAgent(body.graph as AgentGraph, body.name);
  const unavailable = unavailableModel(spec);
  if (unavailable) return Response.json({ error: unavailable }, { status: 400 });
  const llm = resolveProvider(ai, spec.model.startsWith("gpt") ? "openai" : "anthropic");
  if (credits <= 0 && !llm.byok) return Response.json({ error: OUT_OF_CREDITS }, { status: 402 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: TraceEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const run = await runAgent({
          spec,
          input: body.input,
          history: body.history,
          llm,
          loadDocs: async () =>
            (await supabase.from("knowledge_docs").select("name, node_id, content").eq("agent_id", body.agentId)).data ?? [],
          onStep: (step) => send({ t: "step", step }),
        });
        send({ t: "reply", text: run.text });
        const charged = !llm.byok;
        send({ t: "done", tokens: run.tokens, latencyMs: run.latencyMs, simulated: run.provider === "demo", charged });
        await Promise.all([
          supabase
            .from("agent_runs")
            .insert({ agent_id: body.agentId, input: body.input, output: run.text, trace: run.steps, tokens: run.tokens, latency_ms: run.latencyMs }),
          charged ? spendCredit(supabase) : Promise.resolve(),
          track(supabase, "agent_tested", { provider: run.provider, tools: spec.tools.length, ms: run.latencyMs }),
        ]);
      } catch (err) {
        console.error("[agent-test]", err);
        send({ t: "error", message: describeRunError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
