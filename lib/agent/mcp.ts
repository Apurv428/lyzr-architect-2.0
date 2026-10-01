import "server-only";
import { decrypt } from "@/lib/crypto";
import { validateForwardUrl } from "@/lib/webhooks";

// A small Model Context Protocol client over Streamable HTTP: JSON-RPC POSTs answered with JSON or
// an SSE stream. Enough to list a server's tools and call them during an agent run.

const PROTOCOL = "2025-06-18";
const TIMEOUT_MS = 10_000;
const MAX_RESPONSE = 1_000_000;

export type McpServerConfig = { nodeId: string; url: string; token: string | null; description: string };
export type McpTool = { name: string; description?: string; inputSchema?: Record<string, unknown> };

type JsonRpcResponse = { id?: number | string; result?: Record<string, unknown>; error?: { message?: string } };

/** Tokens are saved encrypted; graphs from the test console may still hold the plain value. */
export const mcpToken = (stored: string | null | undefined) => (stored ? (decrypt(stored) ?? (stored.startsWith("v1:") ? null : stored)) : null);

function parseMessages(body: string, contentType: string): JsonRpcResponse[] {
  if (contentType.includes("text/event-stream")) {
    return body
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .flatMap((line) => {
        try {
          return [JSON.parse(line.slice(5).trim()) as JsonRpcResponse];
        } catch {
          return [];
        }
      });
  }
  const parsed = JSON.parse(body) as JsonRpcResponse | JsonRpcResponse[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

export class McpSession {
  private sessionId: string | null = null;
  private nextId = 1;

  private constructor(
    private readonly url: string,
    private readonly token: string | null,
  ) {}

  /** Checks the URL (public https only), then runs the MCP initialize handshake. */
  static async connect(url: string, token: string | null) {
    const checked = await validateForwardUrl(url);
    if (!checked.ok) throw new Error(checked.reason.replace("Forward URLs", "MCP servers"));
    const session = new McpSession(checked.url, token);
    await session.request("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "architect", version: "2.0" } });
    await session.notify("notifications/initialized");
    return session;
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL,
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
    };
  }

  private async notify(method: string) {
    await fetch(this.url, { method: "POST", headers: this.headers(), body: JSON.stringify({ jsonrpc: "2.0", method }), redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  }

  private async request(method: string, params: Record<string, unknown>) {
    const id = this.nextId++;
    const res = await fetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (res.status === 401 || res.status === 403) throw new Error("The MCP server refused the token.");
    if (!res.ok) throw new Error(`The MCP server answered ${res.status}.`);
    const body = (await res.text()).slice(0, MAX_RESPONSE);
    const message = parseMessages(body, res.headers.get("content-type") ?? "").find((m) => m.id === id);
    if (!message) throw new Error("The MCP server didn't answer the request.");
    if (message.error) throw new Error(message.error.message ?? "The MCP server returned an error.");
    return message.result ?? {};
  }

  async listTools(limit = 20): Promise<McpTool[]> {
    const result = await this.request("tools/list", {});
    return ((result.tools as McpTool[] | undefined) ?? []).filter((t) => typeof t?.name === "string").slice(0, limit);
  }

  /** Calls a tool and returns its text content (other content types are summarised). */
  async callTool(name: string, args: Record<string, unknown>) {
    const result = await this.request("tools/call", { name, arguments: args });
    const content = (result.content as { type: string; text?: string }[] | undefined) ?? [];
    const text = content.map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type} content]`)).join("\n");
    return { text: text.slice(0, 20_000) || JSON.stringify(result).slice(0, 20_000), isError: result.isError === true };
  }
}

/** Model-safe tool name for one MCP tool: `mcp<n>__<tool>`, at most 64 characters. */
export const mcpToolName = (serverIndex: number, tool: string) => `mcp${serverIndex}__${tool.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 64);
