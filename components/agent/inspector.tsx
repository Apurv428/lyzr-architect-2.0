"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateAgent, updateNode, useAgentUi } from "@/lib/agent/use-agent";
import { KIND_META, MODELS, OUTPUTS, TOOL_CATALOG, TRIGGERS, type GraphNode } from "@/lib/agent/types";
import { useWorkspace } from "@/lib/workspace/store";
import { KnowledgeFiles } from "./knowledge-files";

const field = "w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function RulesEditor({ node }: { node: GraphNode }) {
  const rules = Array.isArray(node.data.config.rules) ? node.data.config.rules : [];
  const [draft, setDraft] = useState("");
  const setRules = (next: string[]) => updateNode(node.id, (n) => ({ ...n, data: { ...n.data, config: { ...n.data.config, rules: next } } }));
  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {rules.map((r, i) => (
          <li key={i} className="flex items-start gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-sm">
            <span className="flex-1">{r}</span>
            <button aria-label="Remove rule" onClick={() => setRules(rules.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              setRules([...rules, draft.trim()]);
              setDraft("");
            }
          }}
          placeholder="e.g. Never promise refunds"
          className={field}
        />
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Add rule"
          onClick={() => {
            if (!draft.trim()) return;
            setRules([...rules, draft.trim()]);
            setDraft("");
          }}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export function Inspector() {
  const selectedId = useAgentUi((s) => s.selectedId);
  const mode = useWorkspace((s) => s.mode);
  const node = useWorkspace((s) => s.agent?.graph.nodes.find((n) => n.id === selectedId));
  const agentId = useWorkspace((s) => s.agent?.id);
  if (!node) return null;

  const c = node.data.config;
  const setConfig = (key: string, value: string | boolean) =>
    updateNode(node.id, (n) => ({ ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } }));
  const meta = KIND_META[node.data.kind];

  function remove() {
    updateAgent((a) => ({
      graph: {
        nodes: a.graph.nodes.filter((n) => n.id !== node!.id),
        edges: a.graph.edges.filter((e) => e.source !== node!.id && e.target !== node!.id),
      },
    }));
    useAgentUi.getState().set({ selectedId: null, panel: null });
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-background">
      <div className="flex h-10 items-center gap-2 border-b px-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{meta[mode]}</span>
        <button className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Close" onClick={() => useAgentUi.getState().set({ selectedId: null, panel: null })}>
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <Field label="Name">
          <input
            value={node.data.label}
            onChange={(e) => updateNode(node.id, (n) => ({ ...n, data: { ...n.data, label: e.target.value } }))}
            className={field}
          />
        </Field>

        {node.data.kind === "llm" && (
          <>
            <Field label={mode === "guided" ? "Which AI" : "Model"}>
              <select value={String(c.model)} onChange={(e) => setConfig("model", e.target.value)} className={field}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.available}>
                    {m.label} — {m.note}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={mode === "guided" ? "What should it do?" : "System prompt"}
              hint={mode === "guided" ? "Describe the job like you would to a new teammate." : "Rules and knowledge are appended automatically."}
            >
              <Textarea value={String(c.instructions)} onChange={(e) => setConfig("instructions", e.target.value)} className="min-h-48 font-mono text-xs" />
            </Field>
          </>
        )}

        {node.data.kind === "tool" && (
          <Field label={mode === "guided" ? "Action" : "Tool"}>
            <select
              value={String(c.tool)}
              onChange={(e) => {
                const t = TOOL_CATALOG.find((x) => x.id === e.target.value)!;
                updateNode(node.id, (n) => ({ ...n, data: { ...n.data, label: t.label, config: { ...n.data.config, tool: t.id } } }));
              }}
              className={field}
            >
              {TOOL_CATALOG.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} {t.live ? "(live)" : "(simulated)"}
                </option>
              ))}
            </select>
            <span className="block text-[11px] text-muted-foreground">
              {TOOL_CATALOG.find((t) => t.id === c.tool)?.live
                ? "Runs for real during tests."
                : "Returns realistic sample data until you connect the integration."}
            </span>
          </Field>
        )}

        {node.data.kind === "knowledge" && agentId && (
          <>
            <Field label="Files" hint="The agent searches these on every question and cites the file and page.">
              <KnowledgeFiles agentId={agentId} nodeId={node.id} />
            </Field>
            <Field label="Or paste text" hint="Website, Notion and Google Drive connectors are coming soon.">
              <Textarea
                value={String(c.content)}
                onChange={(e) => setConfig("content", e.target.value)}
                placeholder="Paste FAQs, policies, product docs…"
                className="min-h-56 text-xs"
              />
            </Field>
          </>
        )}

        {node.data.kind === "guardrail" && (
          <>
            <Field label={mode === "guided" ? "Rules" : "Policy rules"}>
              <RulesEditor node={node} />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium">Redact personal data</span>
                <span className="block text-[11px] text-muted-foreground">Masks emails, phone and card numbers in replies</span>
              </span>
              <input type="checkbox" checked={c.redactPII === true} onChange={(e) => setConfig("redactPII", e.target.checked)} className="size-4 accent-[var(--primary)]" />
            </label>
          </>
        )}

        {node.data.kind === "trigger" && (
          <Field label="Starts when">
            <select value={String(c.source)} onChange={(e) => setConfig("source", e.target.value)} className={field}>
              {TRIGGERS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        )}

        {node.data.kind === "output" && (
          <Field label="Format">
            <select value={String(c.format)} onChange={(e) => setConfig("format", e.target.value)} className={field}>
              {OUTPUTS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        )}

        {node.data.kind === "memory" && (
          <Field label="Remember" hint="Long-term memory arrives with deployment.">
            <select value={String(c.scope)} onChange={(e) => setConfig("scope", e.target.value)} className={field}>
              {["Conversation", "Per user (long-term)", "Shared across users"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        )}
      </div>
      <div className="border-t p-3">
        <Button variant="destructive" size="sm" className="w-full" onClick={remove}>
          <Trash2 /> Remove block
        </Button>
      </div>
    </aside>
  );
}
