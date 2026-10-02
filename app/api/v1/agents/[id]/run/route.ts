import { z } from "zod";
import { runWithApiKey } from "@/lib/agent/api-run";
import { parseBearer } from "@/lib/api-keys";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Public agent API. Authenticated by an agent API key (no session cookies), no CORS headers,
// so browsers on other origins can't call it; use it from a server. The same agents are also
// available as MCP servers at /api/mcp/:agentId.

export const maxDuration = 120;

const Body = z.object({
  input: z.string().trim().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(20)
    .default([]),
});

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

  const run = await runWithApiKey(id, key, parsed.data.input, parsed.data.history);
  if (!run.ok) return fail(run.status, run.code, run.message, run.headers);
  return Response.json(
    {
      output: run.output,
      trace: run.trace.map((s) => ({ type: s.type, title: s.title, detail: s.detail, result: s.result, ms: s.ms, tokens: s.tokens, simulated: s.simulated, live: s.live })),
      tokens: run.tokens,
      latency_ms: run.latencyMs,
      simulated: run.simulated,
    },
    { headers: { "Cache-Control": "no-store", ...run.headers } },
  );
}
