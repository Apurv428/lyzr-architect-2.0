"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  Check,
  CircleAlert,
  Copy,
  Eye,
  History,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  createWebhook,
  deleteWebhook,
  listWebhookCalls,
  revealSigningSecret,
  rotateWebhookUrl,
  updateWebhook,
  type WebhookAgent,
  type WebhookCall,
  type WebhookRow,
} from "@/lib/actions/webhooks";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

const field = "h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary";
const code = "overflow-x-auto rounded-lg border bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-zinc-300";
const SAMPLE = { message: "Test event from Architect: a customer asks where order #8812 is." };

const copy = (text: string, label: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));

function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1.5 font-mono text-[11px]" title={value}>{value}</code>
      <Button size="xs" variant="outline" onClick={() => copy(value, label)}>
        <Copy /> Copy
      </Button>
    </div>
  );
}

type TestResult = { ok: boolean; status: number; text: string };

/** Fires the sample payload at the webhook exactly as an outside app would. */
async function sendTest(url: string): Promise<TestResult> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(SAMPLE) });
    const body = (await res.json().catch(() => null)) as { output?: string; error?: { message?: string } } | null;
    if (res.status === 202) return { ok: true, status: 202, text: "Accepted. The agent’s answer will be POSTed to your forward URL — check Recent calls in a few seconds." };
    if (res.ok) return { ok: true, status: res.status, text: body?.output || "(the agent returned an empty answer)" };
    return { ok: false, status: res.status, text: body?.error?.message ?? `The webhook answered with HTTP ${res.status}.` };
  } catch {
    return { ok: false, status: 0, text: "Couldn’t reach the webhook URL." };
  }
}

/** Statuses the route returns only after a call was recorded, so the counters can move optimistically. */
const recorded = (status: number) => ![0, 403, 404, 413, 429].includes(status);

function TestResultBox({ result }: { result: TestResult }) {
  return (
    <div className={cn("rounded-lg border p-3 text-xs", result.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5")}>
      <p className="mb-1 font-medium">
        {result.ok ? (result.status === 202 ? "Accepted" : "The agent answered") : "Test failed"}
        <span className="font-normal text-muted-foreground"> · HTTP {result.status || "—"}</span>
      </p>
      <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">{result.text}</p>
    </div>
  );
}

export function IntegrationsView({
  initialWebhooks,
  agents,
  setupNeeded,
  preselectAgentId,
}: {
  initialWebhooks: WebhookRow[];
  agents: WebhookAgent[];
  setupNeeded: boolean;
  preselectAgentId: string | null;
}) {
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [creating, setCreating] = useState(Boolean(preselectAgentId) && !setupNeeded && agents.length > 0);
  const replace = (row: WebhookRow) => setWebhooks((ws) => ws.map((w) => (w.id === row.id ? row : w)));

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Webhook className="size-5 text-primary" /> Webhooks
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Give any app a secret URL that runs one of your agents: Stripe, Typeform, GitHub, Zapier, Make or n8n. The answer comes back in the
              response, or is POSTed to your own URL.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} disabled={setupNeeded || !agents.length}>
            <Plus /> New webhook
          </Button>
        </div>

        {setupNeeded ? (
          <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <p className="font-medium">Webhooks need one database update</p>
              <p className="text-muted-foreground">
                Run <code className="font-mono text-xs">supabase/migrations/0015_webhooks.sql</code> in the Supabase SQL editor, then reload this page.
              </p>
            </div>
          </div>
        ) : !agents.length ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/30 px-6 py-12 text-center">
            <Webhook className="size-6 text-primary" />
            <p className="font-medium">Webhooks run an agent — build one first</p>
            <p className="max-w-sm text-sm text-muted-foreground">Every project gets an agent in its Agent tab. Come back here to give it a URL.</p>
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}>Go to dashboard</Link>
          </div>
        ) : webhooks.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/30 p-6">
            <ol className="grid gap-4 text-sm sm:grid-cols-3">
              {[
                ["Pick an agent", "Architect gives it a secret URL."],
                ["Paste the URL into any app", "Anything that sends webhooks can now run your agent."],
                ["Get the answer back", "In the HTTP response, or signed and POSTed to your URL."],
              ].map(([title, body], i) => (
                <li key={title} className="space-y-1">
                  <span className="grid size-6 place-items-center rounded-full bg-primary/15 text-xs font-medium text-primary">{i + 1}</span>
                  <p className="font-medium">{title}</p>
                  <p className="text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
            <Button className="mt-5" onClick={() => setCreating(true)}>
              <Plus /> Create your first webhook
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {webhooks.map((w) => (
              <WebhookCard key={w.id} webhook={w} onChange={replace} onDelete={(id) => setWebhooks((ws) => ws.filter((x) => x.id !== id))} />
            ))}
          </div>
        )}

        {webhooks.some((w) => w.forwardUrl) && <VerifyHelp />}
      </section>

      <AppsSection />

      {!setupNeeded && agents.length > 0 && (
        <NewWebhookDialog
          open={creating}
          onOpenChange={setCreating}
          agents={agents}
          preselectAgentId={preselectAgentId}
          onCreated={(row) => setWebhooks((ws) => [row, ...ws])}
        />
      )}
    </div>
  );
}

function WebhookCard({ webhook: w, onChange, onDelete }: { webhook: WebhookRow; onChange: (row: WebhookRow) => void; onDelete: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [calls, setCalls] = useState<WebhookCall[] | null>(null);
  const [showCalls, setShowCalls] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  const loadCalls = () => listWebhookCalls(w.id).then(setCalls);

  const runTest = () =>
    act("test", async () => {
      if (!w.url) return;
      const result = await sendTest(w.url);
      setTest(result);
      if (recorded(result.status)) onChange({ ...w, callCount: w.callCount + 1, lastCalledAt: new Date().toISOString() });
      if (showCalls) await loadCalls();
    });

  const toggle = () =>
    act("toggle", async () => {
      const res = await updateWebhook(w.id, { enabled: !w.enabled });
      if ("error" in res) return void toast.error(res.error);
      onChange(res.row);
      toast.success(res.row.enabled ? "Webhook resumed" : "Webhook paused — calls to its URL now get 403");
    });

  const rotate = () =>
    act("rotate", async () => {
      const res = await rotateWebhookUrl(w.id);
      if ("error" in res) return void toast.error(res.error);
      onChange(res.row);
      setTest(null);
      toast.success("New URL issued — the old one stopped working");
    });

  const remove = () =>
    act("delete", async () => {
      const res = await deleteWebhook(w.id);
      if ("error" in res) return void toast.error(res.error);
      onDelete(w.id);
      toast.success(`Deleted “${w.name}”`);
    });

  function openCalls() {
    setShowCalls((v) => !v);
    if (!showCalls) void loadCalls();
  }

  return (
    <div className={cn("rounded-xl border bg-card/60", !w.enabled && "opacity-80")}>
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{w.name}</p>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                w.enabled ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", w.enabled ? "bg-emerald-500" : "bg-muted-foreground")} />
              {w.enabled ? "Active" : "Paused"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Runs <span className="text-foreground">{w.agentName}</span>
            {w.projectName && ` · ${w.projectName}`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={runTest} disabled={!w.url || !w.enabled || busy !== null}>
          {busy === "test" ? <Loader2 className="animate-spin" /> : <Send />} Send test
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`Actions for ${w.name}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            {busy && busy !== "test" ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={openCalls}>
              <History /> {showCalls ? "Hide recent calls" : "Recent calls"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil /> Forward URL & signing
            </DropdownMenuItem>
            <DropdownMenuItem onClick={toggle}>
              {w.enabled ? <Pause /> : <Play />} {w.enabled ? "Pause" : "Resume"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={rotate}>
              <RefreshCw /> Rotate URL
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2 border-t px-4 py-3">
        {w.url ? (
          <CopyField value={w.url} label="Webhook URL" />
        ) : (
          <p className="text-xs text-destructive">This URL can’t be shown because the app’s secret key changed. Rotate it to get a new one.</p>
        )}
        <p className="text-xs text-muted-foreground">
          {w.forwardUrl ? (
            <>
              Results are signed and POSTed to <span className="break-all font-mono text-foreground">{w.forwardUrl}</span>
            </>
          ) : (
            "Results come back in the HTTP response."
          )}
          {" · "}
          {w.callCount ? `${w.callCount} call${w.callCount === 1 ? "" : "s"}, last ${w.lastCalledAt ? timeAgo(w.lastCalledAt) : "—"}` : "Never called"}
        </p>
      </div>

      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-destructive/5 px-4 py-2.5 text-xs">
          <span className="flex-1">Delete this webhook? Apps calling its URL will get 404.</span>
          <Button size="xs" variant="destructive" onClick={remove} disabled={busy !== null}>
            Delete
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </div>
      )}

      {test && (
        <div className="border-t px-4 py-3">
          <TestResultBox result={test} />
        </div>
      )}

      {showCalls && (
        <div className="border-t px-4 py-3">
          <div className="mb-2 flex items-center">
            <p className="text-xs font-medium">Recent calls</p>
            <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Refresh calls" onClick={() => void loadCalls()}>
              <RefreshCw />
            </Button>
          </div>
          {calls === null ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading calls…
            </p>
          ) : calls.length === 0 ? (
            <p className="text-xs text-muted-foreground">No calls yet — send a test event.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-xs">
              {calls.map((c) => (
                <li key={c.id} className="space-y-1 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("size-2 rounded-full", c.status === "ok" ? "bg-emerald-400" : c.status === "error" ? "bg-destructive" : "bg-amber-400")} />
                    <span className="font-medium">{c.status === "ok" ? "Answered" : c.status === "error" ? "Failed" : "Running"}</span>
                    <span className="text-muted-foreground">{timeAgo(c.created_at)}</span>
                    {c.latency_ms !== null && <span className="text-muted-foreground">· {(c.latency_ms / 1000).toFixed(1)}s</span>}
                    {c.forward_status !== null && (
                      <span
                        className={cn(
                          "ml-auto rounded px-1.5 py-0.5",
                          c.forward_status >= 200 && c.forward_status < 300 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-destructive/15 text-destructive",
                        )}
                      >
                        forward {c.forward_status || "failed"}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-1 text-muted-foreground">In: {c.input}</p>
                  {c.error ? <p className="line-clamp-2 text-destructive">{c.error}</p> : c.output && <p className="line-clamp-2">Out: {c.output}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ForwardDialog webhook={w} open={editing} onOpenChange={setEditing} onSaved={onChange} />
    </div>
  );
}

function ForwardDialog({ webhook: w, open, onOpenChange, onSaved }: { webhook: WebhookRow; open: boolean; onOpenChange: (o: boolean) => void; onSaved: (row: WebhookRow) => void }) {
  const [value, setValue] = useState(w.forwardUrl ?? "");
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateWebhook(w.id, { forwardUrl: value.trim() || null });
      if ("error" in res) return void toast.error(res.error);
      onSaved(res.row);
      onOpenChange(false);
      toast.success(res.row.forwardUrl ? "Results will be POSTed to your URL" : "Results now come back in the response");
    });
  }

  function reveal() {
    start(async () => {
      const res = await revealSigningSecret(w.id);
      if ("error" in res) return void toast.error(res.error);
      setSecret(res.secret);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setValue(w.forwardUrl ?? "");
        else setSecret(null);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Forward URL & signing</DialogTitle>
          <DialogDescription>
            With a forward URL, calls return 202 straight away and the agent’s answer is POSTed there when it finishes. Leave it empty to get the answer
            in the response.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Forward results to</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://your-app.com/hooks/architect"
            spellCheck={false}
            className={field}
          />
        </label>
        <div className="space-y-1.5 text-sm">
          <p className="font-medium">Signing secret</p>
          {secret ? (
            <CopyField value={secret} label="Signing secret" />
          ) : (
            <Button size="sm" variant="outline" onClick={reveal} disabled={pending}>
              <Eye /> Reveal signing secret
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Every forward carries an <code className="font-mono">X-Architect-Signature</code> header made with this secret.</p>
        </div>
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function NewWebhookDialog({
  open,
  onOpenChange,
  agents,
  preselectAgentId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  agents: WebhookAgent[];
  preselectAgentId: string | null;
  onCreated: (row: WebhookRow) => void;
}) {
  const [agentId, setAgentId] = useState(agents.some((a) => a.id === preselectAgentId) ? preselectAgentId! : agents[0].id);
  const [name, setName] = useState("");
  const [forward, setForward] = useState("");
  const [created, setCreated] = useState<{ row: WebhookRow; signingSecret: string } | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [pending, start] = useTransition();
  const agent = agents.find((a) => a.id === agentId);
  const fallbackName = `${agent?.name ?? "Agent"} webhook`;

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setCreated(null);
      setName("");
      setForward("");
      setTest(null);
    }
  }

  function submit() {
    start(async () => {
      const res = await createWebhook({ agentId, name: name.trim() || fallbackName, forwardUrl: forward.trim() || null });
      if ("error" in res) return void toast.error(res.error);
      setCreated(res);
      onCreated(res.row);
    });
  }

  async function runTest(url: string) {
    setTesting(true);
    setTest(await sendTest(url));
    setTesting(false);
  }

  const curl = created?.row.url
    ? `curl -X POST ${created.row.url} \\\n  -H "Content-Type: application/json" \\\n  -d '{"message": "Where is my order #8812?"}'`
    : "";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>New webhook</DialogTitle>
              <DialogDescription>Any app that POSTs to this webhook’s URL runs the agent you pick.</DialogDescription>
            </DialogHeader>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Agent</span>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={field}>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.projectName ? ` — ${a.projectName}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={fallbackName} maxLength={60} className={field} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">
                Forward results to <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <input
                value={forward}
                onChange={(e) => setForward(e.target.value)}
                placeholder="https://your-app.com/hooks/architect"
                spellCheck={false}
                className={field}
              />
              <span className="block text-xs text-muted-foreground">
                Leave empty to get the answer in the HTTP response. With a URL, calls return 202 at once and the signed result is POSTed there.
              </span>
            </label>
            <Button onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Webhook />} Create webhook
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="size-5 text-emerald-500" /> Webhook ready
              </DialogTitle>
              <DialogDescription>Paste the URL into any app that sends webhooks. Keep it secret — anyone who has it can run your agent.</DialogDescription>
            </DialogHeader>
            {created.row.url && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Webhook URL</p>
                <CopyField value={created.row.url} label="Webhook URL" />
              </div>
            )}
            {created.row.forwardUrl && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Signing secret</p>
                <CopyField value={created.signingSecret} label="Signing secret" />
                <p className="text-xs text-muted-foreground">Use it to verify the X-Architect-Signature header on results sent to your URL.</p>
              </div>
            )}
            {curl && (
              <div className="space-y-1.5">
                <div className="flex items-center">
                  <p className="text-xs font-medium">Try it from a terminal</p>
                  <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Copy command" onClick={() => copy(curl, "Command")}>
                    <Copy />
                  </Button>
                </div>
                <pre className={code}>{curl}</pre>
              </div>
            )}
            {test && <TestResultBox result={test} />}
            <div className="flex gap-2">
              {created.row.url && (
                <Button variant="outline" className="flex-1" onClick={() => runTest(created.row.url!)} disabled={testing}>
                  {testing ? <Loader2 className="animate-spin" /> : <Send />} Send test event
                </Button>
              )}
              <Button className="flex-1" onClick={() => close(false)}>
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const VERIFY_SNIPPET = `import crypto from "node:crypto";

// header looks like: t=1727600000,v1=5f2c…  (rawBody = the exact request body string)
export function verifyArchitect(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((part) => part.split("=")));
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300; // reject replays older than 5 minutes
  return fresh && v1?.length === expected.length && crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}`;

function VerifyHelp() {
  return (
    <details className="group rounded-xl border bg-card/40 text-sm">
      <summary className="cursor-pointer list-none px-4 py-3 font-medium">
        Verify deliveries <span className="font-normal text-muted-foreground">— check that forwarded results really came from Architect</span>
      </summary>
      <div className="space-y-2 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Each forward is a JSON POST with <code className="font-mono">X-Architect-Event</code> (<code className="font-mono">agent.run.completed</code> or{" "}
          <code className="font-mono">agent.run.failed</code>) and <code className="font-mono">X-Architect-Signature</code>.
        </p>
        <div className="flex justify-end">
          <Button size="xs" variant="ghost" onClick={() => copy(VERIFY_SNIPPET, "Snippet")}>
            <Copy /> Copy
          </Button>
        </div>
        <pre className={code}>{VERIFY_SNIPPET}</pre>
      </div>
    </details>
  );
}

type AppStatus = "live" | "setup" | "simulated" | "webhook" | "soon";

const STATUS_BADGE: Record<AppStatus, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  setup: { label: "Needs setup", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  simulated: { label: "Simulated", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  webhook: { label: "Via webhook", className: "bg-primary/15 text-primary" },
  soon: { label: "Soon", className: "bg-muted text-muted-foreground" },
};

const APPS: { name: string; icon: typeof Boxes; body: string; status: AppStatus }[] = [
  { name: "Slack", icon: MessageSquare, body: "Agents and generated apps post to a channel through an incoming webhook.", status: "live" },
  { name: "MCP servers", icon: Plug, body: "Give an agent every tool on any Model Context Protocol server: add an MCP block.", status: "live" },
  { name: "Web search", icon: Search, body: "Up-to-date answers from the web (agents running on Claude).", status: "live" },
  { name: "Zapier, Make & n8n", icon: Zap, body: "Run agents from thousands of apps with a webhook URL.", status: "webhook" },
  { name: "Gmail", icon: Mail, body: "Send email as one of an agent’s actions once Google OAuth is configured.", status: "setup" },
  { name: "HubSpot", icon: Users, body: "Look up and update contacts once HubSpot OAuth is configured.", status: "setup" },
  { name: "Notion, Google Drive & Sheets", icon: Boxes, body: "Available as agent actions that return realistic sample data.", status: "simulated" },
  { name: "Jira, Linear & GitHub issues", icon: Boxes, body: "Available as agent actions that return realistic sample data.", status: "simulated" },
  { name: "Microsoft Teams & Telegram", icon: MessageSquare, body: "Available as agent actions that return realistic sample data.", status: "simulated" },
  { name: "Salesforce", icon: Boxes, body: "Sync leads and opportunities with your agents.", status: "soon" },
];

function AppsSection() {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Boxes className="size-5 text-primary" /> Apps
        </h2>
        <p className="text-sm text-muted-foreground">What an agent can do in other tools is set up on its Action blocks, per agent.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {APPS.map(({ name, icon: Icon, body, status }) => (
          <div key={name} className={cn("flex flex-col gap-2 rounded-xl border bg-card/60 p-4", status === "soon" && "opacity-60")}>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
                <Icon className="size-4" />
              </span>
              <p className="font-medium">{name}</p>
              <span className={cn("ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", STATUS_BADGE[status].className)}>
                {STATUS_BADGE[status].label}
              </span>
            </div>
            <p className="flex-1 text-sm text-muted-foreground">{body}</p>
            {(status === "live" || status === "setup" || status === "simulated") && (
              <Link href="/agents" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Set up in an agent <ArrowUpRight className="size-3" />
              </Link>
            )}
            {status === "webhook" && <span className="text-xs text-muted-foreground">Create a webhook above and paste its URL into your zap or scenario.</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
