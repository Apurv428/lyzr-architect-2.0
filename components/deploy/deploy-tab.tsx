"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Activity, ArrowUpCircle, Check, Copy, ExternalLink, Globe, KeyRound, Link2, Loader2, Plus, Rocket, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createApiKey, listApiKeys, revokeApiKey, type ApiKeyRow } from "@/lib/actions/api-keys";
import { listDeployments, promoteDeployment, renameDeploymentSlug } from "@/lib/actions/deployments";
import { deploymentUrl, type Deployment } from "@/lib/deploy";
import { timeAgo } from "@/lib/time";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof listDeployments>>;

function Section({ icon: Icon, title, badge, children }: { icon: typeof Rocket; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card/60">
      <header className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-medium">
        <Icon className="size-4 text-primary" /> {title}
        {badge && <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{badge}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const noSubscribe = () => () => {};

function Snippets({ agentId, apiKey }: { agentId: string; apiKey: string | null }) {
  const [lang, setLang] = useState<"curl" | "js" | "python">("curl");
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const endpoint = `${origin}/api/v1/agents/${agentId}/run`;
  // Right after a key is created, the snippet exports it so it can be pasted straight into a terminal.
  const exportLine = apiKey ? (lang === "python" ? `# export ARCHITECT_API_KEY=${apiKey}\n` : lang === "js" ? `// ARCHITECT_API_KEY=${apiKey}\n` : `export ARCHITECT_API_KEY=${apiKey}\n`) : "";
  const code =
    exportLine +
    {
      curl: `curl -X POST ${endpoint} \\\n  -H "Authorization: Bearer $ARCHITECT_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"input": "Where is my order #8812?"}'`,
      js: `const res = await fetch("${endpoint}", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.ARCHITECT_API_KEY}\`,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ input: "Where is my order #8812?" }),\n});\nconst { output, trace } = await res.json();`,
      python: `import os, requests\n\nres = requests.post(\n    "${endpoint}",\n    headers={"Authorization": f"Bearer {os.environ['ARCHITECT_API_KEY']}"},\n    json={"input": "Where is my order #8812?"},\n)\nprint(res.json()["output"])`,
    }[lang];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {(["curl", "js", "python"] as const).map((l) => (
          <button key={l} onClick={() => setLang(l)} className={cn("rounded-md px-2 py-1 text-xs", lang === l ? "bg-muted text-foreground" : "text-muted-foreground")}>
            {l === "js" ? "JavaScript" : l === "python" ? "Python" : "cURL"}
          </button>
        ))}
        <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Copy snippet" onClick={() => navigator.clipboard.writeText(code).then(() => toast.success("Copied"))}>
          <Copy />
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg border bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">{code}</pre>
      <p className="text-xs text-muted-foreground">
        Returns <code className="font-mono">{"{ output, trace, tokens, latency_ms }"}</code>. Runs the last saved version of this agent · 60 requests/min per key · 1 credit per call (free with your own model key).
      </p>
    </div>
  );
}

function ApiKeys({ agentId, onCreated }: { agentId: string; onCreated: (key: string | null) => void }) {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listApiKeys(agentId).then((k) => alive && setKeys(k));
    return () => {
      alive = false;
    };
  }, [agentId]);

  async function create() {
    setBusy(true);
    const res = await createApiKey(agentId, `Key ${(keys?.length ?? 0) + 1}`);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    setKeys((k) => [...(k ?? []), res.row]);
    setFresh(res.key);
    onCreated(res.key);
  }

  async function revoke(id: string) {
    setConfirming(null);
    const res = await revokeApiKey(id);
    if ("error" in res) return toast.error(res.error);
    setKeys((k) => (k ?? []).filter((x) => x.id !== id));
    toast.success("Key revoked — calls with it now return 401");
  }

  function dismiss() {
    setFresh(null);
    onCreated(null);
  }

  return (
    <div className="space-y-2">
      {fresh && (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Copy this key now — for your security it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1.5 font-mono text-[11px]">{fresh}</code>
            <Button size="xs" variant="outline" onClick={() => navigator.clipboard.writeText(fresh).then(() => toast.success("Key copied"))}>
              <Copy /> Copy
            </Button>
            <Button size="xs" variant="ghost" onClick={dismiss}>Done</Button>
          </div>
        </div>
      )}
      {keys === null ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading keys…</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
              <KeyRound className="size-3.5 text-muted-foreground" />
              <span className="font-mono">{k.prefix}••••••••••••</span>
              <span className="text-muted-foreground">{k.name}</span>
              <span className="ml-auto text-muted-foreground">{k.last_used_at ? `Used ${timeAgo(k.last_used_at)}` : "Never used"}</span>
              {confirming === k.id ? (
                <span className="flex items-center gap-1">
                  <Button size="xs" variant="destructive" onClick={() => revoke(k.id)}>Revoke</Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
                </span>
              ) : (
                <Button size="xs" variant="ghost" aria-label={`Revoke ${k.name}`} onClick={() => setConfirming(k.id)}>
                  <Trash2 /> Revoke
                </Button>
              )}
            </li>
          ))}
          <li className="flex items-center gap-2 px-3 py-2 text-xs">
            <span className="text-muted-foreground">{keys.length ? `${keys.length} active key${keys.length > 1 ? "s" : ""}` : "No keys yet — create one to call this agent from your code."}</span>
            <Button size="xs" variant="outline" className="ml-auto" onClick={create} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Generate key
            </Button>
          </li>
        </ul>
      )}
    </div>
  );
}

function AgentApi({ agentId }: { agentId: string }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <ApiKeys agentId={agentId} onCreated={setApiKey} />
      <Snippets agentId={agentId} apiKey={apiKey} />
    </div>
  );
}

function UrlRenameSection({ projectId, deployment, origin, onRenamed }: { projectId: string; deployment: Deployment; origin: string; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState(deployment.slug ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = deploymentUrl(origin, deployment);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-card/60 px-4 py-3">
        <Link2 className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Live URL</p>
          <a href={current} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate font-mono text-xs text-primary hover:underline">
            {current} <ExternalLink className="size-3 shrink-0" />
          </a>
        </div>
        <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
          Rename URL
        </Button>
      </div>
    );
  }

  async function save() {
    const clean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
    if (!clean) return;
    setSaving(true);
    setError(null);
    const res = await renameDeploymentSlug(projectId, clean);
    setSaving(false);
    if ("error" in res) {
      setError(res.error ?? "Couldn't rename the link.");
      return;
    }
    toast.success("Link renamed. The old link no longer works, so share the new one.");
    setEditing(false);
    onRenamed();
  }

  return (
    <div className="space-y-2 rounded-xl border bg-card/60 px-4 py-3">
      <p className="text-xs font-medium">Rename live URL</p>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-muted-foreground">{origin}/s/</span>
        <input
          autoFocus
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="my-custom-slug"
          aria-invalid={Boolean(error)}
          className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:border-primary"
        />
        <Button size="xs" onClick={save} disabled={saving || !slug.trim()}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />} Save
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">3–48 lowercase letters, numbers and hyphens. The old link stops working once you rename it.</p>
      )}
    </div>
  );
}

function Bars({ values, format, color }: { values: number[]; format: (n: number) => string; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-20 items-end gap-1">
      {values.map((v, i) => (
        <div key={i} title={format(v)} className={cn("flex-1 rounded-t-sm opacity-80 transition hover:opacity-100", color)} style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function DeployTab() {
  const projectId = useWorkspace((s) => s.projectId);
  const agent = useWorkspace((s) => s.agent);
  const mode = useWorkspace((s) => s.mode);
  const version = useWorkspace((s) => s.deployVersion);
  const hasBuild = useWorkspace((s) => s.checkpoints.length > 0);
  const [data, setData] = useState<Data | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEffect(() => {
    let alive = true;
    listDeployments(projectId).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [projectId, version, refresh]);

  async function promote(d: Deployment) {
    setPromoting(d.id);
    const res = await promoteDeployment(projectId, d.id);
    setPromoting(null);
    if ("error" in res) toast.error(res.error);
    else {
      toast.success("Production now points at this deployment");
      setRefresh((r) => r + 1);
    }
  }

  if (!data) return <p className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>;

  const current = data.deployments.find((d) => d.is_current);
  const runs = data.runs;
  const apiRuns = runs.filter((r) => r.source === "api").length;

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="glow flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5">
          <span className={cn("grid size-11 place-items-center rounded-xl", current ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
            <Globe className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{current ? "Live in production" : "Not deployed yet"}</p>
            {current ? (
              <a href={deploymentUrl(origin, current)} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate font-mono text-xs text-primary hover:underline">
                {deploymentUrl(origin, current)} <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">{hasBuild ? "Ship the current version to a public link." : "Build your app first, then deploy it here."}</p>
            )}
            {data.domain && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{data.domain} · waiting for DNS (CNAME → cname.architect.app)</p>}
          </div>
          <Button onClick={() => useWorkspace.getState().set({ dialog: "deploy" })} disabled={!hasBuild}>
            <Rocket /> {current ? "Redeploy" : "Deploy"}
          </Button>
        </div>

        {current && <UrlRenameSection key={current.slug} projectId={projectId} deployment={current} origin={origin} onRenamed={() => setRefresh((r) => r + 1)} />}

        <Section icon={Terminal} title="Deployments" badge={`${data.deployments.length}`}>
          {data.deployments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Each deploy is kept — roll back to any of them in one click.</p>
          ) : (
            <ul className="divide-y">
              {data.deployments.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={cn("size-2 rounded-full", d.status === "ready" ? "bg-emerald-400" : d.status === "failed" ? "bg-destructive" : "bg-amber-400 animate-pulse")} />
                  <span className="w-20 shrink-0 text-xs capitalize text-muted-foreground">{d.env}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {d.status === "ready" ? (
                      <a href={deploymentUrl(origin, d)} target="_blank" rel="noreferrer" className="hover:underline">{d.label}</a>
                    ) : (
                      <span className="text-muted-foreground">{d.label} · {d.status}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(d.created_at)}</span>
                  {d.is_current ? (
                    <span className="inline-flex w-28 shrink-0 items-center justify-end gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Check className="size-3.5" /> Current</span>
                  ) : d.status === "ready" ? (
                    <Button size="xs" variant="ghost" className="w-28 shrink-0 justify-end" onClick={() => promote(d)} disabled={!!promoting}>
                      {promoting === d.id ? <Loader2 className="animate-spin" /> : <ArrowUpCircle />} {d.env === "production" ? "Roll back" : "Promote"}
                    </Button>
                  ) : (
                    <span className="w-28 shrink-0" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {agent && (
          <Section icon={KeyRound} title={mode === "guided" ? "Use your agent from other apps" : "Agent API"}>
            <AgentApi agentId={agent.id} />
          </Section>
        )}

        <Section icon={Activity} title="Usage" badge={runs.length ? `last ${runs.length} runs${apiRuns ? ` · ${apiRuns} via API` : ""}` : undefined}>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Run your agent in the test console or through the API to see tokens and latency here.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-xs text-muted-foreground">Tokens per run</p>
                  <p className="text-sm font-medium tabular-nums">{Math.round(runs.reduce((n, r) => n + (r.tokens ?? 0), 0) / runs.length).toLocaleString()} avg</p>
                </div>
                <Bars values={runs.map((r) => r.tokens ?? 0)} format={(n) => `${n.toLocaleString()} tokens`} color="bg-primary" />
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-xs text-muted-foreground">Latency</p>
                  <p className="text-sm font-medium tabular-nums">{(runs.reduce((n, r) => n + (r.latency_ms ?? 0), 0) / runs.length / 1000).toFixed(1)}s avg</p>
                </div>
                <Bars values={runs.map((r) => r.latency_ms ?? 0)} format={(n) => `${(n / 1000).toFixed(1)}s`} color="bg-sky-400" />
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
