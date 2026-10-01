"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { deleteSchedule, getSchedule, saveSchedule, type Schedule, type ScheduleRun } from "@/lib/actions/schedules";
import { timeAgo } from "@/lib/time";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const field = "h-8 rounded-lg border bg-background px-2 text-sm outline-none focus:border-primary";

/** Times the user already gave in chat (e.g. "Good morning time → 08:45"), to prefill a new schedule. */
function timesFromChat(messages: { role: string; content: string | null }[]) {
  const found = new Set<string>();
  for (const m of messages) {
    if (m.role !== "user" || !m.content) continue;
    for (const match of m.content.matchAll(/→\s*([01]?\d|2[0-3]):([0-5]\d)\b/g)) found.add(`${match[1].padStart(2, "0")}:${match[2]}`);
  }
  return [...found].sort();
}

function timezones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Asia/Kolkata", "Europe/London", "America/New_York", "America/Los_Angeles"];
  }
}

export function ScheduleEditor({ agentId }: { agentId: string }) {
  const messages = useWorkspace((s) => s.messages);
  const hasSlack = useWorkspace((s) => s.agent?.graph.nodes.some((n) => n.data.config.tool === "slack_message") ?? false);
  const zones = useMemo(() => timezones(), []);
  const [loaded, setLoaded] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [saved, setSaved] = useState<Schedule | null>(null);
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [timezone, setTimezone] = useState("UTC");
  const [input, setInput] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    getSchedule(agentId).then((res) => {
      if (!alive) return;
      setSetupNeeded(res.setupNeeded);
      setRuns(res.runs);
      const s = res.schedule;
      setSaved(s);
      const chatTimes = timesFromChat(useWorkspace.getState().messages);
      setTimes(s?.times ?? (chatTimes.length ? chatTimes : ["09:00"]));
      setDays(s?.days ?? [0, 1, 2, 3, 4, 5, 6]);
      setTimezone(s?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
      setInput(s?.input ?? "");
      setEnabled(s?.enabled ?? true);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [agentId]);

  const placeholder = hasSlack ? "e.g. Post today's good-morning greeting to the team channel" : "e.g. Write today's summary and post it";
  const fromChat = !saved && timesFromChat(messages).length > 0;

  async function save() {
    setBusy(true);
    const res = await saveSchedule(agentId, { times, days, timezone, input: input || placeholder.replace(/^e\.g\. /, ""), enabled });
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    setSaved(res.schedule);
    setInput(res.schedule.input);
    toast.success(res.schedule.enabled && res.schedule.next_run_at ? `Scheduled. Next run ${new Date(res.schedule.next_run_at).toLocaleString()}.` : "Schedule saved (paused).");
  }

  async function remove() {
    setBusy(true);
    const res = await deleteSchedule(agentId);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    setSaved(null);
    setRuns([]);
    toast("Schedule removed.");
  }

  if (!loaded) return <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Loading schedule…</p>;
  if (setupNeeded) {
    return (
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        Schedules need the database update in <code>supabase/migrations/0017_schedules.sql</code>, plus the scheduler cron (see docs/ARCHITECTURE.md).
      </p>
    );
  }

  // A run that's more than five minutes overdue means nothing is calling the scheduler.
  const stalled = saved?.enabled && saved.next_run_at && openedAt - new Date(saved.next_run_at).getTime() > 5 * 60_000;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium"><CalendarClock className="size-3.5 text-primary" /> Runs at</p>
      {fromChat && <p className="text-[11px] text-muted-foreground">Prefilled from your answers in the chat.</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {times.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <input type="time" value={t} onChange={(e) => setTimes((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))} className={cn(field, "w-28")} aria-label={`Run time ${i + 1}`} />
            {times.length > 1 && (
              <button onClick={() => setTimes((ts) => ts.filter((_, j) => j !== i))} aria-label="Remove time" className="text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </span>
        ))}
        {times.length < 12 && (
          <Button size="icon-xs" variant="outline" aria-label="Add a time" onClick={() => setTimes((ts) => [...ts, "18:00"])}>
            <Plus />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {DAYS.map((d, i) => {
          const on = days.includes(i);
          return (
            <button
              key={d}
              aria-pressed={on}
              onClick={() => setDays((ds) => (on ? ds.filter((x) => x !== i) : [...ds, i]))}
              className={cn("rounded-md border px-2 py-0.5 text-[11px]", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}
            >
              {d}
            </button>
          );
        })}
      </div>

      <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={cn(field, "w-full text-xs")} aria-label="Timezone">
        {zones.map((z) => (
          <option key={z}>{z}</option>
        ))}
      </select>

      <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} className="min-h-16 text-xs" aria-label="What the agent does on each run" />

      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
      </label>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {saved ? "Update schedule" : "Save schedule"}
        </Button>
        {saved && (
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy} aria-label="Remove schedule">
            <Trash2 />
          </Button>
        )}
      </div>

      {saved && (
        <div className="space-y-1.5 text-[11px] text-muted-foreground">
          <p>
            {saved.enabled && saved.next_run_at ? `Next run: ${new Date(saved.next_run_at).toLocaleString()}` : "Paused."}
            {saved.last_run_at ? ` · Last run ${timeAgo(saved.last_run_at)}${saved.last_status ? ` (${saved.last_status})` : ""}` : ""}
          </p>
          {stalled && (
            <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" /> Nothing has run since this time was due. Check that the scheduler cron is calling
              /api/cron/schedules (see docs/ARCHITECTURE.md).
            </p>
          )}
          {runs.length > 0 && (
            <ul className="space-y-1">
              {runs.map((r) => (
                <li key={r.id} className="truncate">
                  <span className={r.status === "ok" ? "text-emerald-600 dark:text-emerald-400" : r.status === "error" ? "text-destructive" : ""}>{r.status}</span> ·{" "}
                  {timeAgo(r.created_at)} · {r.error ?? r.output ?? ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
