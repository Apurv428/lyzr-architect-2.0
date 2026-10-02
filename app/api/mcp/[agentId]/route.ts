import { z } from "zod";
import { runWithApiKey } from "@/lib/agent/api-run";
import { handleMcpMessage, toolNameFor, type JsonRpcRequest } from "@/lib/agent/mcp-server";
import { parseBearer } from "@/lib/api-keys";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Every agent is an MCP server: POST JSON-RPC here (Streamable HTTP, JSON replies) with the
// agent's API key as a Bearer token. Claude, Cursor, VS Code or another agent then sees one tool
// that asks this agent. Runs share keys, rate limits, credits and logs with /api/v1.

export const maxDuration = 120;

const jsonRpcError = (status: number, message: string, extra: HeadersInit = {}) =>
  Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message } }, { status, headers: { "Cache-Control": "no-store", ...extra } });

export async function POST(request: Request, ctx: RouteContext<"/api/mcp/[agentId]">) {
  if (!isSupabaseConfigured) return jsonRpcError(503, "The backend isn't configured.");
  const { agentId } = await ctx.params;
  if (!z.guid().safeParse(agentId).success) return jsonRpcError(404, "No agent with that id.");
  const key = parseBearer(request.headers.get("authorization"));
  if (!key) return jsonRpcError(401, "Send the agent's API key as `Authorization: Bearer arc_live_…`.", { "WWW-Authenticate": "Bearer" });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  // The tool is named after the agent; the URL Architect hands out carries the name.
  const agentName = (new URL(request.url).searchParams.get("name") ?? "").trim().slice(0, 80) || "Architect agent";
  let rejected: string | null = null;
  const server = {
    toolName: toolNameFor(agentName),
    agentName,
    call: async ({ message, history }: { message: string; history: { role: "user" | "assistant"; content: string }[] }) => {
      const run = await runWithApiKey(agentId, key, message, history);
      if (!run.ok && run.status === 401) rejected = run.message;
      return run.ok ? { text: run.output, isError: false } : { text: run.message, isError: true };
    },
  };

  const messages = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(messages.slice(0, 20).map((m) => handleMcpMessage((m ?? {}) as JsonRpcRequest, server)))).filter((r) => r !== null);
  // A revoked or wrong key is an auth failure, not a tool error, so the client can ask for a new one.
  if (rejected) return jsonRpcError(401, rejected, { "WWW-Authenticate": 'Bearer error="invalid_token"' });
  // Only notifications: nothing to return.
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0], { headers: { "Cache-Control": "no-store" } });
}

// No server-initiated stream: clients fall back to plain POST requests.
export function GET() {
  return new Response("This MCP server answers POST requests only.", { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
