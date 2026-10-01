"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { BookOpen, Bot, Brain, Globe, MessageSquareReply, Network, PlugZap, ShieldCheck, Users, Wrench, Zap } from "lucide-react";
import { KIND_META, MODELS, TOOL_CATALOG, type AgentNodeData, type NodeKind } from "@/lib/agent/types";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

export const KIND_ICON: Record<NodeKind, typeof Bot> = {
  trigger: Zap,
  llm: Bot,
  tool: Wrench,
  knowledge: BookOpen,
  memory: Brain,
  guardrail: ShieldCheck,
  output: MessageSquareReply,
  manager: Network,
  subagent: Users,
  mcp: PlugZap,
};

function summary(data: AgentNodeData) {
  const c = data.config;
  switch (data.kind) {
    case "llm":
      return MODELS.find((m) => m.id === c.model)?.label ?? String(c.model);
    case "tool": {
      const t = TOOL_CATALOG.find((x) => x.id === c.tool);
      return t ? (t.live ? `${t.label} · live` : t.label) : "Pick a tool";
    }
    case "knowledge": {
      const files = Array.isArray(c.files) ? c.files.length : 0;
      const pasted = typeof c.content === "string" && c.content.trim() ? `${c.content.trim().length.toLocaleString()} chars` : "";
      if (files) return [`${files} file${files > 1 ? "s" : ""}`, pasted].filter(Boolean).join(" · ");
      return pasted || "No content yet";
    }
    case "guardrail": {
      const n = Array.isArray(c.rules) ? c.rules.length : 0;
      return `${n} rule${n === 1 ? "" : "s"}${c.redactPII ? " · PII redaction" : ""}`;
    }
    case "trigger":
      return String(c.source);
    case "output":
      return String(c.format);
    case "memory":
      return String(c.scope);
    case "mcp":
      return c.serverUrl ? String(c.serverUrl).replace(/^https?:\/\//, "") : "No server URL";
  }
}

export function AgentNode({ data, selected }: NodeProps<Node<AgentNodeData, "agent">>) {
  const mode = useWorkspace((s) => s.mode);
  const meta = KIND_META[data.kind];
  const Icon = data.kind === "tool" && data.config.tool === "web_search" ? Globe : KIND_ICON[data.kind];

  return (
    <div
      className={cn(
        "w-52 rounded-xl border bg-card px-3 py-2.5 shadow-lg transition",
        selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40",
        data.kind === "llm" && "w-60",
      )}
    >
      {data.kind !== "trigger" && <Handle type="target" position={Position.Top} className="!size-2.5 !border-2 !border-background !bg-muted-foreground" />}
      <div className="flex items-center gap-2.5">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", meta.color)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{meta[mode]}</p>
          <p className="truncate text-sm font-medium">{data.label}</p>
        </div>
      </div>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">{summary(data)}</p>
      {data.kind !== "output" && <Handle type="source" position={Position.Bottom} className="!size-2.5 !border-2 !border-background !bg-primary" />}
    </div>
  );
}
