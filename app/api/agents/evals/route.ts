import { z } from "zod";
import { compileAgent } from "@/lib/agent/compile";
import { gradeText, summarize, type EvalCase, type EvalEvent, type EvalResult } from "@/lib/agent/evals";
import { judge } from "@/lib/agent/judge";
import { describeRunError, runAgent, unavailableModel, type KnowledgeDoc } from "@/lib/agent/run";
import type { AgentGraph } from "@/lib/agent/types";
import { resolveProvider, userAI } from "@/lib/ai/keys";
import { track } from "@/lib/analytics";
import { OUT_OF_CREDITS, currentCredits, spendCredit } from "@/lib/credits";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const Body = z.object({
  agentId: z.string().uuid(),
  name: z.string().max(120),
  graph: z.object({ nodes: z.array(z.any()).max(40), edges: z.array(z.any()).max(80) }),
  /** Run only these cases (e.g. re-run one); all cases when omitted. */
  caseIds: z.array(z.string().uuid()).max(25).optional(),
  /** One-off scenarios (the Simulate tab) instead of saved tests; not recorded in the pass-rate history. */
  scenarios: z
    .array(
      z.object({
        id: z.string().max(40),
        input: z.string().trim().min(1).max(2000),
        kind: z.enum(["contains", "not_contains", "judge"]),
        expectation: z.string().max(500),
      }),
    )
    .max(8)
    .optional(),
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

  const [{ data: agent }, { data: rows }, credits, ai] = await Promise.all([
    supabase.from("agents").select("id, project_id").eq("id", body.agentId).single(),
    supabase.from("eval_cases").select("id, input, expectation, kind, created_at").eq("agent_id", body.agentId).order("created_at"),
    currentCredits(supabase),
    userAI(supabase, user.id),
  ]);
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  const cases: EvalCase[] = body.scenarios
    ? body.scenarios.map((s) => ({ ...s, created_at: "" }))
    : ((rows ?? []) as EvalCase[]).filter((c) => !body.caseIds || body.caseIds.includes(c.id));
  if (!cases.length) return Response.json({ error: "Add a test first." }, { status: 400 });

  // Evals run the canvas as it is now, including unsaved edits, so a change can be checked immediately.
  const spec = compileAgent(body.graph as AgentGraph, body.name);
  const unavailable = unavailableModel(spec);
  if (unavailable) return Response.json({ error: unavailable }, { status: 400 });
  const llm = resolveProvider(ai, spec.model.startsWith("gpt") ? "openai" : "anthropic");
  if (credits <= 0 && !llm.byok) return Response.json({ error: OUT_OF_CREDITS }, { status: 402 });

  let docs: KnowledgeDoc[] | null = null;
  const loadDocs = async () =>
    (docs ??= (await supabase.from("knowledge_docs").select("name, node_id, content").eq("agent_id", body.agentId)).data ?? []);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: EvalEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const results: EvalResult[] = [];
      let balance = credits;
      let charged = 0;
      try {
        for (const c of cases) {
          const base = { case_id: c.id, input: c.input, kind: c.kind, expectation: c.expectation };
          if (!llm.byok && balance <= 0) {
            const result = { ...base, pass: null, output: "", reason: "Not run — out of credits." };
            results.push(result);
            send({ t: "result", result, ms: 0 });
            continue;
          }
          send({ t: "start", caseId: c.id });
          const t0 = Date.now();
          let result: EvalResult;
          try {
            const run = await runAgent({ spec, input: c.input, history: [], llm, loadDocs, supabase, agentId: agent.id, projectId: agent.project_id ?? undefined });
            const verdict =
              c.kind === "judge"
                ? c.expectation
                  ? await judge(llm, c.expectation, c.input, run.text)
                  : { pass: null, reason: "Describe what a good reply looks like." }
                : gradeText(c.kind, c.expectation, run.text);
            result = { ...base, ...verdict, output: run.text };
          } catch (err) {
            console.error("[evals] case", err);
            result = { ...base, pass: null, output: "", reason: describeRunError(err) };
          }
          if (!llm.byok) {
            balance = await spendCredit(supabase);
            charged++;
          }
          results.push(result);
          send({ t: "result", result, ms: Date.now() - t0 });
        }

        const { passed, graded, passRate } = summarize(results);
        // Only full runs of saved tests go into the pass-rate history; re-runs and simulations are spot checks.
        const { data: run } = body.caseIds || body.scenarios
          ? { data: null }
          : await supabase.from("eval_runs").insert({ agent_id: body.agentId, results, passed, graded, pass_rate: passRate }).select("id").single();
        send({ t: "done", runId: run?.id ?? null, passed, graded, charged });
        await track(supabase, "evals_run", { cases: results.length, passed, graded, provider: llm.provider });
      } catch (err) {
        console.error("[evals]", err);
        send({ t: "error", message: describeRunError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
