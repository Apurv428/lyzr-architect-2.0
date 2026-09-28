import type { Plan } from "@/lib/ai/schema";
import { DEFAULT_CONFIG, TOOL_CATALOG, type AgentGraph, type GraphNode, type NodeKind } from "./types";

// Map free-text plan tools onto catalog tools where we can.
// Named products come first, so "Jira ticket" maps to Jira rather than a generic ticket tool.
const TOOL_PATTERNS: [RegExp, string][] = [
  [/slack/, "slack_message"],
  [/\bteams\b/, "teams_message"],
  [/telegram/, "telegram_message"],
  [/twitter|tweet|\bx post/, "tweet"],
  [/linkedin/, "linkedin_post"],
  [/calendar|schedul.*meeting/, "google_calendar"],
  [/notion/, "notion"],
  [/confluence/, "confluence"],
  [/google doc/, "google_docs"],
  [/google drive|\bdrive\b/, "google_drive"],
  [/dropbox/, "dropbox"],
  [/asana/, "asana"],
  [/trello/, "trello"],
  [/\blinear\b/, "linear"],
  [/jira/, "jira"],
  [/github|pull request/, "github_action"],
  [/apollo|enrich/, "apollo"],
  [/freshdesk/, "freshdesk"],
  [/sheet/, "google_sheets"],
  [/excel/, "excel"],
  [/arxiv|paper/, "arxiv_search"],
  [/search|web|browse/, "web_search"],
  [/email|mail/, "send_email"],
  [/notif|alert/, "slack_message"],
  [/crm|hubspot|salesforce|lead|customer/, "crm_lookup"],
  [/ticket|helpdesk|zendesk/, "create_ticket"],
  [/sql|database|query/, "sql_query"],
  [/\bhttp|\bapi\b|webhook/, "http_request"],
];

function matchTool(name: string) {
  const n = name.toLowerCase();
  return TOOL_PATTERNS.find(([re]) => re.test(n))?.[1] ?? null;
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
  const scheduled = agent && /schedul|daily|every (day|morning|evening|night|week)|\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i.test([agent.goal, ...agent.steps].join(" "));
  const trigger = scheduled ? node("trigger", "On a schedule", 260, 0, { source: "Schedule" }) : node("trigger", "Incoming request", 260, 0);
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
