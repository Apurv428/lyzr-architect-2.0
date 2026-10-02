"use client";

import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Loader2, Plus, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { applyFix, type AgentFix, type Scenario } from "@/lib/agent/autopilot";
import type { EvalEvent, EvalKind, EvalResult } from "@/lib/agent/evals";
import type { AgentGraph } from "@/lib/agent/types";
import { updateAgent } from "@/lib/agent/use-agent";
import { useWorkspace } from "@/lib/workspace/store";
import { cn } from "@/lib/utils";

type Phase = "idle" | "writing" | "testing" | "tested" | "fixing" | "proposed" | "retesting" | "done";

/** Streams one-off scenarios through the evals runner against the given graph. */
async function runScenarios(agent: { id: string; name: string }, graph: AgentGraph, cases: Scenario[], onResult: (r: EvalResult) => void, onStart: (id: string) => void) {
  const res = await fetch("/api/agents/evals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId: agent.id, name: agent.name, graph, scenarios: cases.map(({ id, input, kind, expectation }) => ({ id, input, kind, expectation })) }),
  });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't run the tests");
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
      const e = JSON.parse(line) as EvalEvent;
      if (e.t === "start") onStart(e.caseId);
      else if (e.t === "result") onResult(e.result);
      else if (e.t === "done") {
        const ws = useWorkspace.getState();
        ws.set({ credits: Math.max(0, ws.credits - e.charged) });
      } else if (e.t === "error") throw new Error(e.message);
    }
  }
}

const passed = (results: Record<string, EvalResult>, cases: Scenario[]) => cases.filter((c) => results[c.id]?.pass === true).length;

function Verdict({ result, running }: { result?: EvalResult; running?: boolean }) {
  if (running) return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  if (!result) return <span className="size-3.5 rounded-full border" />;
  return (
    <span
      className={cn(
        "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
        result.pass === true ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : result.pass === false ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      )}
    >
      {result.pass === true ? "✓" : result.pass === false ? "✗" : "?"}
    </span>
  );
}

export function AutopilotTab({ guided, onSave }: { guided: boolean; onSave: (c: { input: string; kind: EvalKind; expectation: string }) => Promise<boolean> }) {
  const agent = useWorkspace((s) => s.agent)!;
  const [phase, setPhase] = useState<Phase>("idle");
  const [cases, setCases] = useState<Scenario[]>([]);
  const [first, setFirst] = useState<Record<string, EvalResult>>({});
  const [after, setAfter] = useState<Record<string, EvalResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [fix, setFix] = useState<AgentFix | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const failures = cases.filter((c) => first[c.id]?.pass === false);
  const busy = phase === "writing" || phase === "testing" || phase === "fixing" || phase === "retesting";

  async function findWeakSpots() {
    setPhase("writing");
    setCases([]);
    setFirst({});
    setAfter({});
    setFix(null);
    setSaved(false);
    setNote(null);
    try {
      const res = await fetch("/api/agents/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", agentId: agent.id, name: agent.name, graph: agent.graph }),
      });
      const data = (await res.json()) as { cases?: Scenario[]; fallback?: boolean; error?: string; credits?: number | null };
      if (!res.ok || !data.cases) throw new Error(data.error ?? "Couldn't write the tests");
      if (typeof data.credits === "number") useWorkspace.getState().set({ credits: data.credits });
      if (data.fallback) setNote("Using the standard scenarios (no model reply to build custom ones from).");
      setCases(data.cases);
      setPhase("testing");
      const results: Record<string, EvalResult> = {};
      await runScenarios(agent, agent.graph, data.cases, (r) => {
        results[r.case_id] = r;
        setFirst((s) => ({ ...s, [r.case_id]: r }));
        setRunning(null);
      }, setRunning);
      setPhase("tested");
      const failed = data.cases.filter((c) => results[c.id]?.pass === false).length;
      const unrun = data.cases.filter((c) => results[c.id]?.pass == null).length;
      if (failed) toast.warning(`${failed} weak spot${failed > 1 ? "s" : ""} found`);
      else if (unrun) toast.warning(`${unrun} scenario${unrun > 1 ? "s" : ""} couldn't be graded — see why below`);
      else toast.success("No weak spots found");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Autopilot failed");
      setPhase(cases.length ? "tested" : "idle");
    } finally {
      setRunning(null);
    }
  }

  async function proposeFix() {
    setPhase("fixing");
    try {
      const res = await fetch("/api/agents/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fix",
          agentId: agent.id,
          name: agent.name,
          graph: agent.graph,
          failures: failures.map((c) => ({ input: c.input, expectation: c.expectation, output: first[c.id]?.output ?? "", reason: first[c.id]?.reason ?? "" })),
        }),
      });
      const data = (await res.json()) as { fix?: AgentFix; error?: string; credits?: number | null };
      if (!res.ok || !data.fix) throw new Error(data.error ?? "Couldn't propose a fix");
      if (typeof data.credits === "number") useWorkspace.getState().set({ credits: data.credits });
      setFix(data.fix);
      setPhase("proposed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't propose a fix");
      setPhase("tested");
    }
  }

  async function applyAndRetest() {
    if (!fix) return;
    const graph = applyFix(agent.graph, fix);
    updateAgent({ graph });
    setPhase("retesting");
    try {
      // Re-test everything, so a fix that breaks a passing case shows up in the score.
      await runScenarios({ id: agent.id, name: agent.name }, graph, cases, (r) => {
        setAfter((s) => ({ ...s, [r.case_id]: r }));
        setRunning(null);
      }, setRunning);
      setPhase("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-test failed");
      setPhase("proposed");
    } finally {
      setRunning(null);
    }
  }

  async function saveAll() {
    let ok = 0;
    for (const c of cases) if (await onSave({ input: c.input, kind: c.kind, expectation: c.expectation })) ok++;
    if (ok) {
      setSaved(true);
      toast.success(`Saved ${ok} scenario${ok > 1 ? "s" : ""} as tests`);
    }
  }

  const firstScore = passed(first, cases);
  const finalScore = passed(after, cases);
  const graded = cases.filter((c) => first[c.id]).length;
  const ungraded = cases.filter((c) => first[c.id] && first[c.id].pass === null).length;

  const primary =
    phase === "tested" && failures.length
      ? { label: "Fix it for me", icon: Wand2, run: proposeFix }
      : phase === "proposed"
        ? { label: "Apply fix & re-test", icon: Check, run: applyAndRetest }
        : { label: cases.length ? "Run again" : "Find weak spots", icon: Sparkles, run: findWeakSpots };

  const status =
    phase === "writing"
      ? `Writing tests aimed at ${agent.name}…`
      : phase === "testing"
        ? `Testing ${Object.keys(first).length + 1} of ${cases.length}…`
        : phase === "fixing"
          ? "Reading the failures and working out a fix…"
          : phase === "retesting"
            ? `Re-testing ${Object.keys(after).length + 1} of ${cases.length}…`
            : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="space-y-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15">
              <Sparkles className="size-4 text-primary" />
            </span>
            <div>
              <p className="text-sm font-medium">Autopilot</p>
              <p className="text-xs text-muted-foreground">
                {guided
                  ? "Architect writes tricky tests for this agent, finds where it slips, and fixes it for you."
                  : "Generates adversarial scenarios from this agent's own job and rules, runs them, diagnoses failures and proposes rule/instruction fixes. One credit per model step."}
              </p>
            </div>
          </div>
          {status ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {status}
            </p>
          ) : (
            <Button className="w-full" size="sm" onClick={primary.run} disabled={busy}>
              <primary.icon /> {primary.label}
            </Button>
          )}
          {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
        </div>

        {graded > 0 && (
          <div className="flex items-center justify-center gap-3 rounded-xl border bg-card/60 p-3">
            <div className="text-center">
              <p className="text-2xl font-bold tabular-nums">
                {firstScore}/{cases.length}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {phase === "done" ? "before" : "passed"}
                {ungraded > 0 && phase !== "done" ? ` · ${ungraded} not graded` : ""}
              </p>
            </div>
            {phase === "done" && (
              <>
                <ArrowRight className="size-4 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {finalScore}/{cases.length}
                  </p>
                  <p className="text-[11px] text-muted-foreground">after the fix</p>
                </div>
              </>
            )}
          </div>
        )}

        {fix && (
          <div className="space-y-2 rounded-xl border bg-card/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Wand2 className="size-3.5 text-primary" /> {phase === "done" ? "Applied fix" : "Proposed fix"}
            </p>
            <p className="text-xs text-muted-foreground">{fix.diagnosis}</p>
            {fix.rules.length > 0 && (
              <ul className="space-y-1">
                {fix.rules.map((r) => (
                  <li key={r} className="flex gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-800 dark:text-emerald-300">
                    <Plus className="mt-0.5 size-3 shrink-0" /> {r}
                  </li>
                ))}
              </ul>
            )}
            {fix.instructions && (
              <div>
                <button onClick={() => setShowInstructions((v) => !v)} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                  Instructions rewritten <ChevronDown className={cn("size-3 transition", showInstructions && "rotate-180")} />
                </button>
                {showInstructions && <pre className="mt-1 max-h-40 overflow-y-auto rounded-md bg-muted/50 p-2 text-[11px] whitespace-pre-wrap">{fix.instructions}</pre>}
              </div>
            )}
            {phase === "proposed" && (
              <button onClick={() => { setFix(null); setPhase("tested"); }} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                <X className="size-3" /> Discard
              </button>
            )}
          </div>
        )}

        <ul className="space-y-2">
          {cases.map((c) => (
            <li key={c.id} className="space-y-1.5 rounded-lg border bg-card/60 p-2.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex shrink-0 items-center gap-1">
                  <Verdict result={first[c.id]} running={running === c.id && phase === "testing"} />
                  {(after[c.id] || (running === c.id && phase === "retesting")) && (
                    <>
                      <ArrowRight className="size-3 text-muted-foreground" />
                      <Verdict result={after[c.id]} running={running === c.id && phase === "retesting"} />
                    </>
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.persona} · “{c.input}”
                  </p>
                </div>
              </div>
              {(after[c.id] ?? first[c.id]) && (
                <div className="space-y-1 pl-7">
                  <p className="text-[11px] text-muted-foreground">{(after[c.id] ?? first[c.id])!.reason}</p>
                  {(after[c.id] ?? first[c.id])!.output && <p className="line-clamp-3 rounded-md bg-muted/50 px-2 py-1 text-[11px]">{(after[c.id] ?? first[c.id])!.output}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>

        {cases.length > 0 && !busy && (
          <Button size="sm" variant="outline" className="w-full" onClick={saveAll} disabled={saved}>
            {saved ? <Check /> : <Plus />} {saved ? "Saved as tests" : "Save these scenarios as tests"}
          </Button>
        )}
      </div>
    </div>
  );
}
