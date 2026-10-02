// Serves one Architect agent as a Model Context Protocol server (Streamable HTTP, JSON replies).
// The agent appears as a single tool, so Claude, Cursor, VS Code or another agent can call it.
// Transport and auth live in app/api/mcp/[agentId]/route.ts; this module is the protocol.

export const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

type JsonRpcId = string | number;
export type JsonRpcRequest = { jsonrpc?: string; id?: JsonRpcId | null; method?: string; params?: Record<string, unknown> };
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId | null; result: Record<string, unknown> }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string } };

export type ToolCall = { message: string; history: { role: "user" | "assistant"; content: string }[] };
export type ToolResult = { text: string; isError: boolean };

export type AgentServer = {
  /** Shown to the client as the tool name, e.g. "ask_support_agent". */
  toolName: string;
  agentName: string;
  call: (args: ToolCall) => Promise<ToolResult>;
};

/** A tool name MCP clients accept: lowercase letters, digits and underscores, at most 64 characters. */
export function toolNameFor(agentName: string) {
  const slug = agentName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
  return `ask_${slug || "agent"}`;
}

const ok = (id: JsonRpcId | null, result: Record<string, unknown>): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
const fail = (id: JsonRpcId | null, code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

function readArgs(raw: unknown): ToolCall | null {
  if (!raw || typeof raw !== "object") return null;
  const args = raw as { message?: unknown; history?: unknown };
  if (typeof args.message !== "string" || !args.message.trim()) return null;
  const history = Array.isArray(args.history)
    ? args.history
        .filter((h): h is { role: "user" | "assistant"; content: string } => !!h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
        .slice(-20)
        .map((h) => ({ role: h.role, content: h.content.slice(0, 8000) }))
    : [];
  return { message: args.message.trim().slice(0, 4000), history };
}

/** Handles one JSON-RPC message. Notifications (no id) return null: nothing is sent back. */
export async function handleMcpMessage(msg: JsonRpcRequest, server: AgentServer): Promise<JsonRpcResponse | null> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined || msg.id === null;
  if (typeof msg.method !== "string") return isNotification ? null : fail(id, -32600, "Invalid request");
  if (msg.method.startsWith("notifications/")) return null;

  switch (msg.method) {
    case "initialize": {
      const asked = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_VERSIONS as readonly string[]).includes(asked) ? asked : SUPPORTED_VERSIONS[0];
      return ok(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "architect-agent", title: `${server.agentName} (Architect)`, version: "2.0" },
        instructions: `Call ${server.toolName} to ask the "${server.agentName}" agent. Send the request in plain words; it replies with its answer.`,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: [
          {
            name: server.toolName,
            title: `Ask ${server.agentName}`,
            description: `Ask the "${server.agentName}" agent, built in Architect. Send the user's request in plain words; it uses its own tools, knowledge and rules and replies with the answer.`,
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "What to ask the agent." },
                history: {
                  type: "array",
                  description: "Earlier turns of the conversation, oldest first (optional).",
                  items: { type: "object", properties: { role: { type: "string", enum: ["user", "assistant"] }, content: { type: "string" } }, required: ["role", "content"] },
                },
              },
              required: ["message"],
            },
          },
        ],
      });
    case "tools/call": {
      if (msg.params?.name !== server.toolName) return fail(id, -32602, `Unknown tool: ${String(msg.params?.name)}`);
      const args = readArgs(msg.params?.arguments);
      if (!args) return ok(id, { content: [{ type: "text", text: "Send a non-empty \"message\" to ask the agent." }], isError: true });
      const result = await server.call(args);
      return ok(id, { content: [{ type: "text", text: result.text }], isError: result.isError });
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return fail(id, -32601, `Method not found: ${msg.method}`);
  }
}
