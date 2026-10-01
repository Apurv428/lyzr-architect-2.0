"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScheduleEditor } from "./schedule-editor";
import { Textarea } from "@/components/ui/textarea";
import { getSlackWebhookConfigured, listUserAgents, removeSlackWebhook, saveSlackWebhook, testMcpServer } from "@/lib/actions/agents";
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

function OAuthConnectorField({ provider, projectId, label }: { provider: string; projectId: string; label: string }) {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/oauth/${provider}/status?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d: { connected: boolean }) => { if (alive) setConnected(d.connected); })
      .catch(() => { if (alive) setConnected(false); });
    return () => { alive = false; };
  }, [provider, projectId]);

  function connect() {
    const popup = window.open(`/api/oauth/${provider}/start?projectId=${projectId}`, "_blank", "width=600,height=700");
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "oauth_success" && e.data.provider === provider) {
        setConnected(true);
        popup?.close();
        window.removeEventListener("message", handler);
      }
    };
    window.addEventListener("message", handler);
  }

  if (connected === null) return <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Loading…</p>;

  if (connected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2">
        <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
        <span className="flex-1 text-xs font-medium">{label} connected</span>
        <button onClick={() => setConnected(false)} className="text-[11px] text-muted-foreground hover:text-foreground underline">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
    >
      <ExternalLink className="size-3.5" /> Connect {label}
    </button>
  );
}

function SlackWebhookField({ projectId }: { projectId: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getSlackWebhookConfigured(projectId).then((v) => { if (alive) setConfigured(v); });
    return () => { alive = false; };
  }, [projectId]);

  async function save() {
    setSaving(true);
    const res = await saveSlackWebhook(projectId, draft);
    setSaving(false);
    if ("error" in res) { toast.error(res.error); return; }
    setConfigured(true);
    setDraft("");
    toast.success("Slack webhook saved.");
  }

  async function remove() {
    const res = await removeSlackWebhook(projectId);
    if ("error" in res) { toast.error(res.error); return; }
    setConfigured(false);
    toast("Slack webhook removed.");
  }

  if (configured === null) return <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Loading…</p>;

  if (configured) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2">
        <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
        <span className="flex-1 text-xs font-medium">Webhook configured</span>
        <button onClick={remove} className="text-[11px] text-muted-foreground hover:text-foreground underline">Remove</button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="https://hooks.slack.com/services/…"
        className={field}
        type="url"
        autoComplete="off"
      />
      <Button size="sm" className="w-full" disabled={saving || !draft.trim()} onClick={save}>
        {saving ? <><Loader2 className="size-3 animate-spin" /> Saving…</> : "Save webhook"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer" className="underline">Create an incoming webhook</a> in your Slack workspace.
      </p>
    </div>
  );
}

const SAFE_AI_PRESETS = [
  { label: "Stay on topic", rule: "Only answer questions directly related to this product or service." },
  { label: "No promises", rule: "Never promise refunds, discounts or outcomes you can't guarantee." },
  { label: "No legal advice", rule: "Do not give legal, financial or medical advice; refer users to a professional." },
  { label: "No harmful content", rule: "Refuse requests for harmful, illegal or offensive content politely." },
  { label: "Be honest about being AI", rule: "Always acknowledge you are an AI if asked directly." },
  { label: "Cite uncertainty", rule: "When unsure, say so rather than guessing." },
] as const;

function SafeAIPresets({ node }: { node: GraphNode }) {
  const [open, setOpen] = useState(false);
  const rules = Array.isArray(node.data.config.rules) ? (node.data.config.rules as string[]) : [];
  const setRules = (next: string[]) => updateNode(node.id, (n) => ({ ...n, data: { ...n.data, config: { ...n.data.config, rules: next } } }));

  const unused = SAFE_AI_PRESETS.filter((p) => !rules.includes(p.rule));
  if (unused.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-dashed px-2.5 py-2 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
      >
        <span className="font-medium">Safe AI presets</span>
        <span className="text-[10px] text-muted-foreground">Quick rules for responsible AI</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {unused.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setRules([...rules, p.rule])}
              className="flex w-full items-center gap-2 rounded-lg border bg-muted/20 px-2.5 py-1.5 text-left text-xs transition hover:bg-muted/50"
            >
              <Plus className="size-3 shrink-0 text-primary" />
              <span className="font-medium text-foreground">{p.label}</span>
              <span className="truncate text-muted-foreground">{p.rule}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Connects to the MCP server like a run would and lists its tools. */
function McpTest({ url, token }: { url: string; token: string | null }) {
  const [state, setState] = useState<{ busy: boolean; tools?: { name: string; description?: string }[]; error?: string }>({ busy: false });
  async function test() {
    setState({ busy: true });
    const res = await testMcpServer(url, token);
    setState("error" in res ? { busy: false, error: res.error } : { busy: false, tools: res.tools });
  }
  return (
    <div className="space-y-1.5">
      <Button size="sm" variant="outline" className="w-full" onClick={test} disabled={state.busy || !url.trim()}>
        {state.busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Test connection
      </Button>
      {state.error && <p className="text-[11px] text-destructive">{state.error}</p>}
      {state.tools && (
        <p className="text-[11px] text-muted-foreground">
          {state.tools.length ? `Connected · ${state.tools.length} tool${state.tools.length === 1 ? "" : "s"}: ${state.tools.map((t) => t.name).join(", ")}` : "Connected, but the server offers no tools."}
        </p>
      )}
    </div>
  );
}

function SubAgentPicker({
  node,
  excludeAgentId,
  setConfig,
}: {
  node: import("@/lib/agent/types").GraphNode;
  excludeAgentId?: string;
  setConfig: (k: string, v: string) => void;
}) {
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    listUserAgents(excludeAgentId).then(setAgents);
  }, [excludeAgentId]);

  const linked = String(node.data.config.agentId || "");

  return (
    <Field label="Linked agent" hint="The coordinator will call this agent's full pipeline.">
      <select
        value={linked}
        onChange={(e) => {
          const selected = agents.find((a) => a.id === e.target.value);
          setConfig("agentId", e.target.value);
          if (selected) setConfig("label", selected.name);
        }}
        className={field}
      >
        <option value="">— Pick an agent —</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      {linked && (
        <button
          className="mt-1 text-[11px] text-primary underline"
          onClick={() => window.open(`/p/${linked}`, "_blank")}
        >
          Open agent in new tab ↗
        </button>
      )}
    </Field>
  );
}

export function Inspector() {
  const selectedId = useAgentUi((s) => s.selectedId);
  const mode = useWorkspace((s) => s.mode);
  const node = useWorkspace((s) => s.agent?.graph.nodes.find((n) => n.id === selectedId));
  const agentId = useWorkspace((s) => s.agent?.id);
  const projectId = useWorkspace((s) => s.projectId);
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
          <>
            <Field label={mode === "guided" ? "Action" : "Tool"}>
              {(() => {
                const categories = [...new Set(TOOL_CATALOG.map((t) => t.category))];
                return (
                  <select
                    value={String(c.tool)}
                    onChange={(e) => {
                      const t = TOOL_CATALOG.find((x) => x.id === e.target.value)!;
                      updateNode(node.id, (n) => ({ ...n, data: { ...n.data, label: t.label, config: { ...n.data.config, tool: t.id } } }));
                    }}
                    className={field}
                  >
                    {categories.map((cat) => (
                      <optgroup key={cat} label={cat}>
                        {TOOL_CATALOG.filter((t) => t.category === cat).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label} {t.live ? "(live)" : "(simulated)"}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                );
              })()}
              <span className="block text-[11px] text-muted-foreground">
                {TOOL_CATALOG.find((t) => t.id === c.tool)?.live
                  ? "Runs for real during tests."
                  : "Returns realistic sample data until you connect the integration."}
              </span>
            </Field>
            {c.tool === "slack_message" && projectId && (
              <>
                <Field
                  label={mode === "guided" ? "Slack (OAuth)" : "Slack OAuth connector"}
                  hint="Connects via OAuth — more reliable than a webhook URL."
                >
                  <OAuthConnectorField provider="slack" projectId={projectId} label="Slack" />
                </Field>
                <Field
                  label={mode === "guided" ? "Or use a webhook URL" : "Or: incoming webhook URL"}
                  hint={mode === "guided" ? "Legacy option — use the OAuth connection above if possible." : undefined}
                >
                  <SlackWebhookField projectId={projectId} />
                </Field>
              </>
            )}
            {c.tool === "send_email" && projectId && (
              <Field label={mode === "guided" ? "Gmail account" : "Gmail OAuth connector"}>
                <OAuthConnectorField provider="gmail" projectId={projectId} label="Gmail" />
              </Field>
            )}
            {c.tool === "crm_lookup" && projectId && (
              <Field label={mode === "guided" ? "HubSpot account" : "HubSpot OAuth connector"}>
                <OAuthConnectorField provider="hubspot" projectId={projectId} label="HubSpot" />
              </Field>
            )}
          </>
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
            <SafeAIPresets node={node} />
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
          <>
            <Field label="Starts when">
              <select value={String(c.source)} onChange={(e) => setConfig("source", e.target.value)} className={field}>
                {TRIGGERS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            {c.source === "Schedule" && agentId && <ScheduleEditor agentId={agentId} />}
            {c.source === "Webhook" && agentId && (
              <p className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                Any app can run this agent by POSTing to its webhook URL.{" "}
                <Link href={`/integrations?agent=${agentId}`} className="text-primary hover:underline">
                  Create one in Integrations →
                </Link>
              </p>
            )}
          </>
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

        {node.data.kind === "manager" && (
          <>
            <Field label={mode === "guided" ? "Strategy" : "Routing strategy"} hint="Auto lets the model decide which specialist to call.">
              <select value={String(c.strategy)} onChange={(e) => setConfig("strategy", e.target.value)} className={field}>
                <option value="auto">Auto (model decides)</option>
                <option value="sequential">Sequential (call all in order)</option>
              </select>
            </Field>
            <Field label="Max specialist calls" hint="Hard cap to limit costs. Includes all sub-agent calls in one turn.">
              <input
                type="number"
                min={1}
                max={8}
                value={String(c.maxCalls)}
                onChange={(e) => setConfig("maxCalls", e.target.value)}
                className={field}
              />
            </Field>
            <p className="text-xs text-muted-foreground">Connect Sub-agent blocks to this node on the canvas to add specialists.</p>
          </>
        )}

        {node.data.kind === "subagent" && (
          <SubAgentPicker node={node} excludeAgentId={agentId} setConfig={setConfig} />
        )}

        {node.data.kind === "mcp" && (
          <>
            <Field
              label={mode === "guided" ? "Server address" : "MCP server URL"}
              hint={mode === "guided" ? "The address of the tool server to connect." : "e.g. https://mcp.example.com or a localhost URL for local servers."}
            >
              <input
                value={String(c.serverUrl)}
                onChange={(e) => setConfig("serverUrl", e.target.value)}
                placeholder="https://mcp.example.com"
                className={field}
                type="url"
                autoComplete="off"
              />
            </Field>
            <Field
              label={mode === "guided" ? "Access token (optional)" : "Auth token (optional)"}
              hint="Encrypted when the agent saves, sent as a Bearer token, and never included in exported code."
            >
              <input
                value={String(c.authToken ?? "").startsWith("v1:") ? "" : String(c.authToken ?? "")}
                onChange={(e) => setConfig("authToken", e.target.value)}
                placeholder={String(c.authToken ?? "").startsWith("v1:") ? "Saved (encrypted). Type to replace" : "Bearer token or API key"}
                className={field}
                type="password"
                autoComplete="off"
              />
            </Field>
            <McpTest url={String(c.serverUrl ?? "")} token={String(c.authToken ?? "") || null} />
            <Field label="Description" hint="What this server provides — shown in the agent's system prompt.">
              <Textarea
                value={String(c.description)}
                onChange={(e) => setConfig("description", e.target.value)}
                placeholder="e.g. Internal knowledge base with company docs"
                className="min-h-20 text-xs"
              />
            </Field>
            <p className="rounded-lg border border-pink-500/30 bg-pink-500/5 px-3 py-2 text-xs text-muted-foreground">
              MCP (Model Context Protocol) lets the agent call tools from any compatible server over Streamable HTTP. Connect this block to the
              brain; each run lists the server&apos;s tools and the model can call them. Public https servers only.{" "}
              <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Learn more ↗
              </a>
            </p>
          </>
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
