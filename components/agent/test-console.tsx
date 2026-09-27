"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpen, Bot, ChevronDown, Globe, ListPlus, Loader2, MessageSquareReply, Network, RotateCcw, ShieldCheck, Wrench, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addEvalCase } from "@/lib/actions/evals";
import { KIND_LABEL, type EvalKind } from "@/lib/agent/evals";
import type { TraceEvent, TraceStep } from "@/lib/agent/trace";
import { useAgentUi } from "@/lib/agent/use-agent";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/workspace/markdown";

type Turn = {
  input: string;
  reply?: string;
  steps: TraceStep[];
  error?: string;
  stats?: { tokens: number; latencyMs: number; simulated: boolean };
};

const STEP_ICON: Record<TraceStep["type"], typeof Bot> = {
  trigger: Zap,
  knowledge: BookOpen,
  llm: Bot,
  tool: Wrench,
  guardrail: ShieldCheck,
  output: MessageSquareReply,
  manager_call: Network,
};

function TraceItem({ s }: { s: TraceStep }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = s.title.startsWith("Web search") || s.title.includes("web results") ? Globe : STEP_ICON[s.type];
  const hasSubSteps = s.type === "manager_call" && s.subSteps?.length;

  return (
    <li className="relative pb-2.5 text-xs">
      <span className="absolute top-0.5 -left-[19px] grid size-3.5 place-items-center rounded-full bg-background">
        <Icon className="size-3 text-muted-foreground" />
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-foreground">{s.title}</span>
        {s.live && <span className="rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-600 dark:text-emerald-400">live</span>}
        {s.simulated && <span className="rounded bg-amber-500/15 px-1 text-[10px] text-amber-600 dark:text-amber-400">simulated</span>}
        {s.ms != null && <span className="text-muted-foreground">{(s.ms / 1000).toFixed(1)}s</span>}
        {s.tokens != null && <span className="text-muted-foreground">{s.tokens.toLocaleString()} tok</span>}
        {hasSubSteps && (
          <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn("size-3 transition", expanded && "rotate-180")} />
            {s.subSteps!.length} step{s.subSteps!.length > 1 ? "s" : ""}
          </button>
        )}
      </div>
      {s.detail && <p className="mt-0.5 line-clamp-2 break-all text-muted-foreground">{s.detail}</p>}
      {s.result && <p className="mt-0.5 line-clamp-2 font-mono break-all text-[10px] text-muted-foreground/80">→ {s.result}</p>}
      {hasSubSteps && expanded && (
        <ol className="mt-1.5 space-y-0 border-l pl-3">
          {s.subSteps!.map((sub) => <TraceItem key={sub.id} s={sub} />)}
        </ol>
      )}
    </li>
  );
}

function Trace({ steps, open }: { steps: TraceStep[]; open: boolean }) {
  if (!open) return null;
  return (
    <ol className="mt-2 space-y-0 border-l pl-3">
      {steps.map((s) => <TraceItem key={s.id} s={s} />)}
    </ol>
  );
}

function SaveAsTest({ input, onDone }: { input: string; onDone: () => void }) {
  const agentId = useWorkspace((s) => s.agent!.id);
  const guided = useWorkspace((s) => s.mode) === "guided";
  const [kind, setKind] = useState<EvalKind>("judge");
  const [expectation, setExpectation] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await addEvalCase(agentId, { input, kind, expectation });
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    useAgentUi.getState().set({ evalsVersion: useAgentUi.getState().evalsVersion + 1 });
    toast.success("Saved as a test", { action: { label: guided ? "Open checks" : "Open evals", onClick: () => useAgentUi.getState().set({ panel: "evals" }) } });
    onDone();
  }

  return (
    <div className="mt-2 space-y-2 border-t pt-2">
      <p className="text-xs text-muted-foreground">A good reply to this message…</p>
      <div className="flex gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as EvalKind)}
          aria-label="Check type"
          className="h-8 shrink-0 rounded-lg border bg-background px-1.5 text-xs outline-none focus:border-primary"
        >
          {(["judge", "contains", "not_contains"] as const).map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k][guided ? "guided" : "pro"]}</option>
          ))}
        </select>
        <input
          autoFocus
          value={expectation}
          onChange={(e) => setExpectation(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && expectation.trim() && save()}
          aria-label="Expectation"
          placeholder={kind === "judge" ? "e.g. Doesn't promise a refund" : "Text to look for"}
          className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-xs outline-none focus:border-primary"
        />
      </div>
      <div className="flex justify-end gap-1.5">
        <Button size="xs" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="xs" onClick={save} disabled={!expectation.trim() || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <ListPlus />} Save test
        </Button>
      </div>
    </div>
  );
}

export function TestConsole() {
  const agent = useWorkspace((s) => s.agent)!;
  const mode = useWorkspace((s) => s.mode);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [openTrace, setOpenTrace] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function run() {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setRunning(true);
    const index = turns.length;
    const history = turns
      .filter((t) => t.reply)
      .flatMap((t) => [
        { role: "user" as const, content: t.input },
        { role: "assistant" as const, content: t.reply! },
      ])
      .slice(-20);
    setTurns((ts) => [...ts, { input: text, steps: [] }]);
    setOpenTrace((o) => ({ ...o, [index]: true }));
    const patch = (fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t, i) => (i === index ? fn(t) : t)));

    try {
      const res = await fetch("/api/agents/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, name: agent.name, graph: agent.graph, input: text, history }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Test failed");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as TraceEvent;
          if (e.t === "step") patch((t) => ({ ...t, steps: [...t.steps, e.step] }));
          else if (e.t === "reply") patch((t) => ({ ...t, reply: e.text }));
          else if (e.t === "done") {
            patch((t) => ({ ...t, stats: e }));
            if (e.charged) useWorkspace.getState().set({ credits: Math.max(0, useWorkspace.getState().credits - 1) });
          } else if (e.t === "error") patch((t) => ({ ...t, error: e.message }));
        }
      }
      setOpenTrace((o) => ({ ...o, [index]: false }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test failed";
      patch((t) => ({ ...t, error: message }));
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l bg-background">
      <div className="flex h-10 items-center gap-2 border-b px-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{mode === "guided" ? "Try your agent" : "Test console"}</span>
        <div className="ml-auto flex items-center gap-1">
          {turns.length > 0 && (
            <Button size="icon-xs" variant="ghost" aria-label="Clear" onClick={() => setTurns([])} disabled={running}>
              <RotateCcw />
            </Button>
          )}
          <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={() => useAgentUi.getState().set({ panel: null })}>
            <X />
          </Button>
        </div>
      </div>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto p-3">
        {turns.length === 0 && (
          <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            <Bot className="mx-auto mb-2 size-5 text-primary" />
            Send a message to run <span className="text-foreground">{agent.name}</span> with its current blocks. You’ll see every step it takes.
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-sm">{t.input}</div>
            <div className="rounded-xl border bg-card/60 p-3 text-sm">
              {t.reply ? (
                <Markdown text={t.reply} />
              ) : t.error ? (
                <p className="text-destructive">{t.error}</p>
              ) : (
                <p className="inline-flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> {t.steps.at(-1)?.title ?? "Starting…"}
                </p>
              )}
              {t.steps.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <button
                    onClick={() => setOpenTrace((o) => ({ ...o, [i]: !o[i] }))}
                    className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className={cn("size-3.5 transition", openTrace[i] && "rotate-180")} />
                    {t.steps.length} steps
                    {t.stats && (
                      <span className="ml-auto">
                        {(t.stats.latencyMs / 1000).toFixed(1)}s · {t.stats.tokens.toLocaleString()} tokens{t.stats.simulated ? " · demo" : ""}
                      </span>
                    )}
                  </button>
                  <Trace steps={t.steps} open={!!openTrace[i]} />
                </div>
              )}
              {t.reply && saving !== i && (
                <button onClick={() => setSaving(i)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <ListPlus className="size-3.5" /> Save as test
                </button>
              )}
              {saving === i && <SaveAsTest input={t.input} onDone={() => setSaving(null)} />}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder={mode === "guided" ? "Ask it something a customer would…" : "Test input"}
            className="h-9 flex-1 rounded-lg border bg-card px-3 text-sm outline-none focus:border-primary"
          />
          <Button size="icon-lg" onClick={run} disabled={!input.trim() || running} aria-label="Run">
            {running ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
