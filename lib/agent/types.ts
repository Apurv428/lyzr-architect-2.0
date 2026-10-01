import type { Mode } from "@/lib/types";

export type NodeKind = "trigger" | "llm" | "tool" | "knowledge" | "memory" | "guardrail" | "output" | "manager" | "subagent" | "mcp";

export type AgentNodeData = {
  kind: NodeKind;
  label: string;
  config: Record<string, string | boolean | string[]>;
};

export type GraphNode = { id: string; type: "agent"; position: { x: number; y: number }; data: AgentNodeData };
export type GraphEdge = { id: string; source: string; target: string };
/** How the agent's code changes reach GitHub (Pro → Agent → GitAgent). Used when opening pull requests. */
export type GitAgentSettings = {
  identity: string;
  branchPrefix: string;
  commitStyle: "conventional" | "imperative" | "descriptive";
  rules: string[];
  skills: string[];
};

export type AgentGraph = { nodes: GraphNode[]; edges: GraphEdge[]; git?: GitAgentSettings };

export const DEFAULT_GIT_AGENT: GitAgentSettings = { identity: "", branchPrefix: "architect/", commitStyle: "conventional", rules: [], skills: [] };

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
  mcp: { guided: "Connect a tool", pro: "MCP Server", hint: "Model Context Protocol server integration", color: "text-pink-600 dark:text-pink-400 bg-pink-500/15" },
};

export const kindLabel = (kind: NodeKind, mode: Mode) => KIND_META[kind][mode];

export const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5", note: "Most capable", available: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "Fast & smart", available: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Fastest, cheapest", available: true },
  { id: "gpt-5.5", label: "GPT-5.5 (OpenAI)", note: "Needs an OpenAI key", available: true },
  // Run on an OpenAI-compatible host the server is set up for (see compatibleHost in lib/ai/provider.ts).
  { id: "gemini", label: "Gemini (Google)", note: "Google's Gemini via its OpenAI-compatible API", available: true },
  { id: "llama", label: "Llama (Meta, open-source)", note: "Any OpenAI-compatible Llama host: Groq, Together, Ollama", available: true },
] as const;

// Web search and Slack run for real (Slack requires a webhook URL or OAuth connector); the rest return realistic simulated results.
export type ToolCategory = "Search & Web" | "Communication" | "Workspace" | "CRM & Data" | "Dev & Research" | "Custom";

export const TOOL_CATALOG: readonly { id: string; label: string; description: string; live: boolean; category: ToolCategory }[] = [
  // Search & Web
  { id: "web_search", label: "Web search", description: "Search the web for up-to-date information", live: true, category: "Search & Web" },
  { id: "arxiv_search", label: "Arxiv search", description: "Search scientific papers and preprints", live: false, category: "Search & Web" },
  // Communication
  { id: "send_email", label: "Send email (Gmail)", description: "Send an email via Gmail", live: false, category: "Communication" },
  { id: "slack_message", label: "Post to Slack", description: "Post a message to a Slack channel", live: true, category: "Communication" },
  { id: "teams_message", label: "Post to Teams", description: "Send a message or post to Microsoft Teams", live: false, category: "Communication" },
  { id: "telegram_message", label: "Send Telegram message", description: "Send a Telegram notification", live: false, category: "Communication" },
  { id: "tweet", label: "Post to Twitter / X", description: "Compose and post a tweet", live: false, category: "Communication" },
  { id: "linkedin_post", label: "Post to LinkedIn", description: "Create a LinkedIn post or send a message", live: false, category: "Communication" },
  // Workspace
  { id: "google_calendar", label: "Google Calendar", description: "Create events, check availability, invite participants", live: false, category: "Workspace" },
  { id: "google_docs", label: "Google Docs", description: "Create, read and edit Google Docs", live: false, category: "Workspace" },
  { id: "google_drive", label: "Google Drive", description: "Search, create folders and manage files in Drive", live: false, category: "Workspace" },
  { id: "notion", label: "Notion", description: "Create pages, update databases, search Notion workspace", live: false, category: "Workspace" },
  { id: "confluence", label: "Confluence", description: "Draft docs, update spaces, surface internal knowledge", live: false, category: "Workspace" },
  { id: "asana", label: "Asana", description: "Create tasks, assign members, update statuses", live: false, category: "Workspace" },
  { id: "trello", label: "Trello", description: "Create cards, move tasks between lists", live: false, category: "Workspace" },
  { id: "dropbox", label: "Dropbox", description: "Search, read and save files in Dropbox", live: false, category: "Workspace" },
  // CRM & Data
  { id: "crm_lookup", label: "HubSpot CRM", description: "Look up contacts, log meetings, update deal stages", live: false, category: "CRM & Data" },
  { id: "apollo", label: "Apollo", description: "Search contacts, enrich company profiles, find leads", live: false, category: "CRM & Data" },
  { id: "freshdesk", label: "Freshdesk", description: "Read tickets, draft replies, escalate issues", live: false, category: "CRM & Data" },
  { id: "create_ticket", label: "Create support ticket", description: "Create a ticket in the helpdesk", live: false, category: "CRM & Data" },
  { id: "google_sheets", label: "Google Sheets", description: "Read data, append rows, perform calculations", live: false, category: "CRM & Data" },
  { id: "excel", label: "Microsoft Excel", description: "Read datasets, perform calculations, generate workbooks", live: false, category: "CRM & Data" },
  // Dev & Research
  { id: "sql_query", label: "Query database", description: "Run a read-only SQL query against the app database", live: false, category: "Dev & Research" },
  { id: "github_action", label: "GitHub", description: "Read code, manage pull requests, triage issues", live: false, category: "Dev & Research" },
  { id: "linear", label: "Linear", description: "Create tickets, assign issues, manage project cycles", live: false, category: "Dev & Research" },
  { id: "jira", label: "Jira", description: "Create epics, transition issues, compile release notes", live: false, category: "Dev & Research" },
  // Custom
  { id: "http_request", label: "HTTP request", description: "Call any external REST API", live: false, category: "Custom" },
] as const;

export const TRIGGERS = ["Chat message", "New email", "Webhook", "Schedule", "Form submission"] as const;

/** A Slack incoming webhook URL. The webhook itself decides the channel. */
export const SLACK_WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/;
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
  mcp: { serverUrl: "", authToken: "", description: "" },
};
