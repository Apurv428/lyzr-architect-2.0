import type { Plan } from "@/lib/ai/schema";
import { DEFAULT_CONFIG, TOOL_CATALOG, type AgentGraph, type GraphNode, type NodeKind } from "./types";

// Map free-text plan tools onto catalog tools where we can.
function matchTool(name: string) {
  const n = name.toLowerCase();
  if (/search|web|browse/.test(n)) return "web_search";
  if (/email|mail/.test(n)) return "send_email";
  if (/slack|notif|alert/.test(n)) return "slack_message";
  if (/crm|hubspot|salesforce|lead|customer/.test(n)) return "crm_lookup";
  if (/ticket|helpdesk|zendesk/.test(n)) return "create_ticket";
  if (/sql|database|query/.test(n)) return "sql_query";
  return null;
}

let seq = 0;
const node = (kind: NodeKind, label: string, x: number, y: number, config = {}): GraphNode => ({
  id: `${kind}-${++seq}-${Math.random().toString(36).slice(2, 6)}`,
  type: "agent",
  position: { x, y },
  data: { kind, label, config: { ...DEFAULT_CONFIG[kind], ...config } },
});

export function graphFromPlan(plan: Plan | undefined, name: string): AgentGraph {
  const agent = plan?.agent;
  const trigger = node("trigger", "Incoming request", 260, 0);
  const llm = node("llm", agent?.name ?? `${name} Agent`, 260, 130, {
    instructions: agent
      ? `You are ${agent.name}. Goal: ${agent.goal}.\n\nWork through these steps:\n${agent.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "You are a helpful assistant.",
  });

  const toolNames = (agent?.tools ?? []).filter((t) => !/knowledge|docs|faq|handbook/i.test(t));
  const seen = new Set<string>();
  const tools = toolNames
    .map((t) => ({ label: t, tool: matchTool(t) }))
    .filter((t) => t.tool && !seen.has(t.tool) && seen.add(t.tool))
    .slice(0, 3);
  if (!tools.length) tools.push({ label: "Web search", tool: "web_search" });

  const toolNodes = tools.map((t, i) =>
    node("tool", TOOL_CATALOG.find((c) => c.id === t.tool)?.label ?? t.label, 40 + i * 220, 290, { tool: t.tool! }),
  );
  const knowledge = node("knowledge", "Help docs", 540, 0);
  const guard = node("guardrail", "Safety rules", 260, 430, { rules: plan?.rules ?? [], redactPII: true });
  const output = node("output", "Reply", 260, 560);

  const edges = [
    [trigger, llm],
    [knowledge, llm],
    ...toolNodes.map((t) => [llm, t] as const),
    ...toolNodes.map((t) => [t, guard] as const),
    [guard, output],
  ].map(([a, b]) => ({ id: `e-${a.id}-${b.id}`, source: a.id, target: b.id }));

  return { nodes: [trigger, llm, knowledge, ...toolNodes, guard, output], edges };
}
