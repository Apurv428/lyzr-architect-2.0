import type { Mode } from "@/lib/types";

export type NodeKind = "trigger" | "llm" | "tool" | "knowledge" | "memory" | "guardrail" | "output" | "manager" | "subagent";

export type AgentNodeData = {
  kind: NodeKind;
  label: string;
  config: Record<string, string | boolean | string[]>;
};

export type GraphNode = { id: string; type: "agent"; position: { x: number; y: number }; data: AgentNodeData };
export type GraphEdge = { id: string; source: string; target: string };
export type AgentGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type AgentRecord = {
  id: string;
  project_id: string | null;
  name: string;
  framework: string;
  model: string;
  graph: AgentGraph;
  updated_at: string;
};

export const KIND_META: Record<NodeKind, { guided: string; pro: string; hint: string; color: string }> = {
  trigger: { guided: "Starts when", pro: "Trigger", hint: "What kicks the agent off", color: "text-amber-600 dark:text-amber-400 bg-amber-500/15" },
  llm: { guided: "Brain", pro: "LLM", hint: "The model and its instructions", color: "text-primary bg-primary/15" },
  tool: { guided: "Action", pro: "Tool", hint: "Something the agent can do", color: "text-sky-600 dark:text-sky-400 bg-sky-500/15" },
  knowledge: { guided: "Knowledge", pro: "Knowledge (RAG)", hint: "Docs the agent answers from", color: "text-violet-600 dark:text-violet-400 bg-violet-500/15" },
  memory: { guided: "Remembers", pro: "Memory", hint: "What it keeps between chats", color: "text-teal-600 dark:text-teal-400 bg-teal-500/15" },
  guardrail: { guided: "Rules", pro: "Guardrails", hint: "Lines it must never cross", color: "text-rose-600 dark:text-rose-400 bg-rose-500/15" },
  output: { guided: "Replies with", pro: "Output", hint: "How results are delivered", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15" },
  manager: { guided: "Coordinator", pro: "Manager", hint: "Splits the task between specialists", color: "text-orange-600 dark:text-orange-400 bg-orange-500/15" },
  subagent: { guided: "Specialist", pro: "Sub-agent", hint: "A linked agent this coordinator can call", color: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/15" },
};

export const kindLabel = (kind: NodeKind, mode: Mode) => KIND_META[kind][mode];

export const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5", note: "Most capable", available: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "Fast & smart", available: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Fastest, cheapest", available: true },
  { id: "gpt-5.5", label: "GPT-5.5 (OpenAI)", note: "Needs an OpenAI key", available: true },
  { id: "gemini", label: "Gemini (Google)", note: "Bring your own key", available: false },
  { id: "llama", label: "Llama (Meta)", note: "Bring your own key", available: false },
] as const;

// Web search runs for real (Anthropic server tool); the rest return realistic simulated results.
export const TOOL_CATALOG = [
  { id: "web_search", label: "Web search", description: "Search the web for up-to-date information", live: true },
  { id: "send_email", label: "Send email", description: "Send an email to a recipient", live: false },
  { id: "slack_message", label: "Post to Slack", description: "Post a message to a Slack channel", live: false },
  { id: "crm_lookup", label: "CRM lookup", description: "Look up a customer or lead in the CRM", live: false },
  { id: "create_ticket", label: "Create ticket", description: "Create a ticket in the helpdesk", live: false },
  { id: "sql_query", label: "Query database", description: "Run a read-only SQL query against the app database", live: false },
  { id: "http_request", label: "HTTP request", description: "Call an external REST API", live: false },
] as const;

export const TRIGGERS = ["Chat message", "New email", "Webhook", "Schedule", "Form submission"] as const;
export const OUTPUTS = ["Chat reply", "JSON", "Email draft", "Slack message"] as const;

export const DEFAULT_CONFIG: Record<NodeKind, AgentNodeData["config"]> = {
  trigger: { source: "Chat message" },
  llm: { model: "claude-opus-5", instructions: "" },
  tool: { tool: "web_search" },
  knowledge: { source: "Pasted text", content: "" },
  memory: { scope: "Conversation" },
  guardrail: { rules: [], redactPII: true },
  output: { format: "Chat reply" },
  manager: { strategy: "auto", maxCalls: "4" },
  subagent: { agentId: "", label: "" },
};
