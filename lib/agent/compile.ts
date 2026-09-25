import type { Passage } from "./retrieval";
import type { AgentGraph, AgentNodeData } from "./types";

export type AgentSpec = {
  name: string;
  model: string;
  instructions: string;
  tools: string[];
  knowledge: string;
  rules: string[];
  redactPII: boolean;
  trigger: string;
  output: string;
  memory: string | null;
  /** Connected Knowledge blocks — their uploaded files are searched at run time. */
  knowledgeNodeIds: string[];
};

const of = (graph: AgentGraph, kind: AgentNodeData["kind"]) => graph.nodes.filter((n) => n.data.kind === kind).map((n) => n.data);
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

// Only nodes connected (directly or indirectly) to the LLM take part in a run.
function connected(graph: AgentGraph) {
  const llm = graph.nodes.find((n) => n.data.kind === "llm");
  if (!llm) return new Set<string>();
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    adj.set(e.target, [...(adj.get(e.target) ?? []), e.source]);
  }
  const seen = new Set([llm.id]);
  const queue = [llm.id];
  while (queue.length) {
    for (const next of adj.get(queue.shift()!) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

export function compileAgent(graph: AgentGraph, name: string): AgentSpec {
  const live = connected(graph);
  const liveGraph = { ...graph, nodes: graph.nodes.filter((n) => live.has(n.id)) };
  const llm = of(liveGraph, "llm")[0];
  const guards = of(liveGraph, "guardrail");

  return {
    name,
    model: str(llm?.config.model, "claude-opus-5"),
    instructions: str(llm?.config.instructions, "You are a helpful assistant."),
    tools: [...new Set(of(liveGraph, "tool").map((t) => str(t.config.tool)).filter(Boolean))],
    knowledge: of(liveGraph, "knowledge")
      .map((k) => str(k.config.content).trim())
      .filter(Boolean)
      .join("\n\n---\n\n"),
    rules: guards.flatMap((g) => (Array.isArray(g.config.rules) ? g.config.rules : [])).filter(Boolean),
    redactPII: guards.some((g) => g.config.redactPII === true),
    trigger: str(of(liveGraph, "trigger")[0]?.config.source, "Chat message"),
    output: str(of(liveGraph, "output")[0]?.config.format, "Chat reply"),
    memory: of(liveGraph, "memory")[0] ? str(of(liveGraph, "memory")[0].config.scope, "Conversation") : null,
    knowledgeNodeIds: liveGraph.nodes.filter((n) => n.data.kind === "knowledge").map((n) => n.id),
  };
}

export function systemPrompt(spec: AgentSpec, passages: Passage[] = []) {
  const parts = [spec.instructions.trim()];
  if (spec.rules.length) parts.push(`## Rules you must follow\n${spec.rules.map((r) => `- ${r}`).join("\n")}`);
  if (spec.knowledge) parts.push(`## Knowledge base\nAnswer from this material when relevant, and say so when it doesn't cover the question.\n\n${spec.knowledge}`);
  if (passages.length) {
    parts.push(
      `## Retrieved passages\nThese were retrieved from the user's documents for this question. Answer from them, cite the source like (Returns-Policy.pdf, p. 3), and say so if they don't cover the question.\n\n${passages
        .map((p) => `<passage source="${p.doc}" page="${p.page}">\n${p.text}\n</passage>`)
        .join("\n")}`,
    );
  }
  const format: Record<string, string> = {
    JSON: "Respond with a single JSON object and nothing else.",
    "Email draft": "Format your final answer as an email draft with a subject line.",
    "Slack message": "Format your final answer as a short Slack message.",
  };
  if (format[spec.output]) parts.push(`## Output format\n${format[spec.output]}`);
  return parts.join("\n\n");
}

const PII = [
  { name: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { name: "card number", re: /\b(?:\d[ -]?){13,16}\b/g },
  { name: "phone", re: /\+?\d[\d\s().-]{8,}\d/g },
];

export function redact(text: string) {
  let count = 0;
  let out = text;
  for (const { name, re } of PII) {
    out = out.replace(re, () => {
      count++;
      return `[${name} redacted]`;
    });
  }
  return { text: out, count };
}
