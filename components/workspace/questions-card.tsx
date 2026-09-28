"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, CheckCircle2, ChevronDown, ExternalLink, HelpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getSlackWebhookConfigured, saveSlackWebhook } from "@/lib/actions/agents";
import { SLACK_WEBHOOK_RE } from "@/lib/agent/types";
import type { Questions } from "@/lib/ai/schema";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

const OTHER = "__other__";
const input = "h-8 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60";

/** "connected" = a webhook was already saved for this project; "later" = the user will add one later. */
type SlackState = { url: string; channel: string; status: "new" | "connected" | "later"; replacing: boolean };

const channelName = (c: string) => (c.trim() ? `#${c.trim().replace(/^#+/, "")}` : "");

export function QuestionsCard({
  data,
  open,
  busy,
  onAnswer,
  onSkip,
}: {
  data: Questions;
  open: boolean;
  busy: boolean;
  onAnswer: (text: string) => void;
  onSkip: () => void;
}) {
  const projectId = useWorkspace((s) => s.projectId);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [slack, setSlack] = useState<SlackState>({ url: "", channel: "", status: "new", replacing: false });
  const [saving, setSaving] = useState(false);

  const fields = data.fields ?? [];
  const slackField = fields.find((f) => f.type === "slack_webhook");

  useEffect(() => {
    if (!slackField || !open) return;
    let alive = true;
    getSlackWebhookConfigured(projectId).then((yes) => {
      if (alive && yes) setSlack((s) => ({ ...s, status: "connected" }));
    });
    return () => {
      alive = false;
    };
  }, [slackField, open, projectId]);

  const answerFor = (id: string) => (picked[id] === OTHER ? other[id]?.trim() : picked[id]);
  const urlValid = SLACK_WEBHOOK_RE.test(slack.url.trim());
  const slackReady = slack.status === "later" || (slack.status === "connected" && !slack.replacing) || urlValid;
  const complete =
    data.questions.every((q) => answerFor(q.id)) &&
    fields.every((f) => (f.type === "slack_webhook" ? slackReady : values[f.id]?.trim()));

  async function submit() {
    if (!complete || busy || saving) return;
    const lines = data.questions.map((q) => `${q.question} → ${answerFor(q.id)}`);

    for (const f of fields) {
      if (f.type !== "slack_webhook") {
        lines.push(`${f.label} → ${values[f.id].trim()}`);
        continue;
      }
      if (slack.status === "later" && !urlValid) {
        lines.push("Slack → not connected yet (simulate posts until a webhook is added in the Agent tab)");
        continue;
      }
      if (urlValid) {
        // The URL is a secret: it's saved encrypted with the project and never enters the chat.
        setSaving(true);
        const res = await saveSlackWebhook(projectId, slack.url.trim());
        setSaving(false);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        setSlack((s) => ({ ...s, url: "", status: "connected", replacing: false }));
      }
      const channel = channelName(slack.channel);
      lines.push(`Slack → connected (posts to ${channel || "the channel picked for the webhook"})`);
    }
    onAnswer(lines.join("\n"));
  }

  const disabled = !open || busy || saving;

  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card", open ? "glow" : "opacity-70")}>
      <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2.5 text-sm">
        <HelpCircle className="size-4 text-primary" />
        <span className="font-medium">{open ? "Quick questions" : "Questions"}</span>
        {!open && <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400"><Check className="size-3" /> Answered</span>}
      </div>
      <div className="space-y-4 p-4">
        {data.intro && <p className="text-sm text-muted-foreground">{data.intro}</p>}
        {data.questions.map((q, i) => (
          <fieldset key={q.id} className="space-y-2" disabled={disabled}>
            <legend className="mb-2 text-sm font-medium">
              <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
              {q.question}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {[...q.options, ...(q.allow_other ? [OTHER] : [])].map((opt) => {
                const active = picked[q.id] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPicked((p) => ({ ...p, [q.id]: opt }))}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition disabled:cursor-default",
                      active ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50",
                    )}
                  >
                    {opt === OTHER ? "Other…" : opt}
                  </button>
                );
              })}
            </div>
            {picked[q.id] === OTHER && (
              <input
                autoFocus
                value={other[q.id] ?? ""}
                onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Type your answer"
                className={input}
              />
            )}
          </fieldset>
        ))}
        {fields.map((f, i) => (
          <fieldset key={f.id} className="space-y-2" disabled={disabled}>
            <legend className="mb-2 text-sm font-medium">
              <span className="mr-1.5 text-muted-foreground">{data.questions.length + i + 1}.</span>
              {f.label}
            </legend>
            {f.type === "slack_webhook" ? (
              <SlackWebhookInput state={slack} onChange={(patch) => setSlack((s) => ({ ...s, ...patch }))} urlValid={urlValid} open={open} />
            ) : (
              <input
                type={f.type === "time" ? "time" : "text"}
                value={values[f.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={f.placeholder ?? "Type your answer"}
                className={cn(input, f.type === "time" && "w-36")}
              />
            )}
          </fieldset>
        ))}
      </div>
      {open && (
        <div className="flex items-center gap-3 border-t p-3">
          <Button size="lg" className="flex-1" onClick={submit} disabled={!complete || busy || saving}>
            {saving ? <><Loader2 className="animate-spin" /> Connecting Slack…</> : <>Continue to plan <ArrowRight /></>}
          </Button>
          <button onClick={onSkip} disabled={busy || saving} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
            Skip, just plan it
          </button>
        </div>
      )}
    </div>
  );
}

function SlackWebhookInput({
  state,
  onChange,
  urlValid,
  open,
}: {
  state: SlackState;
  onChange: (patch: Partial<SlackState>) => void;
  urlValid: boolean;
  open: boolean;
}) {
  const [help, setHelp] = useState(false);

  if (state.status === "connected" && !state.replacing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
          <span className="flex-1">Slack is connected. Posts go to the channel you picked for the webhook.</span>
          {open && (
            <button type="button" onClick={() => onChange({ replacing: true })} className="text-xs text-muted-foreground underline hover:text-foreground">
              Use another
            </button>
          )}
        </div>
        <ChannelInput value={state.channel} onChange={(channel) => onChange({ channel })} />
      </div>
    );
  }

  if (state.status === "later") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <span className="flex-1">Posts will be simulated until you add a webhook in the Agent tab.</span>
        {open && (
          <button type="button" onClick={() => onChange({ status: "new" })} className="text-xs underline hover:text-foreground">
            Add it now
          </button>
        )}
      </div>
    );
  }

  const showError = state.url.trim().length > 12 && !urlValid;
  return (
    <div className="space-y-2">
      <input
        type="url"
        value={state.url}
        onChange={(e) => onChange({ url: e.target.value })}
        placeholder="https://hooks.slack.com/services/…"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={showError}
        className={cn(input, "font-mono text-xs", showError && "border-destructive focus:border-destructive")}
      />
      {showError && <p className="text-xs text-destructive">That doesn&apos;t look like a Slack webhook URL. It starts with https://hooks.slack.com/services/</p>}
      <ChannelInput value={state.channel} onChange={(channel) => onChange({ channel })} />
      <p className="text-[11px] text-muted-foreground">Saved encrypted with this project. It never appears in the chat or the app&apos;s code.</p>

      <div className="rounded-lg border bg-muted/30">
        <button type="button" onClick={() => setHelp((h) => !h)} className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium">
          How do I get one? <span className="font-normal text-muted-foreground">About 2 minutes</span>
          <ChevronDown className={cn("ml-auto size-3.5 transition", help && "rotate-180")} />
        </button>
        {help && (
          <ol className="list-decimal space-y-1 px-3 pb-3 pl-7 text-xs text-muted-foreground">
            <li>
              Open{" "}
              <a href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary underline">
                Slack apps <ExternalLink className="size-3" />
              </a>{" "}
              → <b>Create New App</b> → <b>From scratch</b>, and pick your workspace.
            </li>
            <li>In the app&apos;s menu, open <b>Incoming Webhooks</b> and switch them on.</li>
            <li>Click <b>Add New Webhook to Workspace</b>, choose the channel, then <b>Allow</b>.</li>
            <li>Copy the webhook URL and paste it above.</li>
          </ol>
        )}
      </div>

      {open && (
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={() => onChange({ status: "later", url: "" })} className="text-muted-foreground underline hover:text-foreground">
            Connect later
          </button>
          {state.replacing && (
            <button type="button" onClick={() => onChange({ replacing: false, url: "" })} className="text-muted-foreground underline hover:text-foreground">
              Keep the current webhook
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChannelInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0">Channel you picked</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#general (optional)" className={cn(input, "h-7 text-xs")} />
    </label>
  );
}
