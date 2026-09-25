"use client";

import { useState } from "react";
import { Bot, Check, Database, LayoutPanelTop, Lightbulb, Loader2, Pencil, Plug, ShieldCheck, UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Plan } from "@/lib/ai/schema";
import type { Mode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DataEditor, ScreensEditor, StringListEditor, editorField } from "./plan-editor";

const LABELS: Record<Mode, Record<string, string>> = {
  guided: { screens: "Screens", data: "What it keeps track of", agent: "Your AI helper", rules: "Rules it follows", integrations: "Connects to", assumptions: "I assumed" },
  pro: { screens: "Screens / routes", data: "Data model", agent: "Agent pipeline", rules: "Guardrails", integrations: "Integrations", assumptions: "Assumptions" },
};

function Section({ icon: Icon, title, children }: { icon: typeof Bot; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" /> {title}
      </p>
      {children}
    </div>
  );
}

export function PlanCard({
  plan,
  mode,
  state,
  onApprove,
  onRefine,
  onSave,
  busy = false,
}: {
  plan: Plan;
  mode: Mode;
  state: "actionable" | "approved" | "superseded";
  onApprove: () => void;
  onRefine: () => void;
  onSave?: (plan: Plan) => Promise<boolean>;
  busy?: boolean;
}) {
  const L = LABELS[mode];
  const [draft, setDraft] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);

  if (draft) {
    const set = (patch: Partial<Plan>) => setDraft({ ...draft, ...patch });
    const setAgent = (patch: Partial<Plan["agent"]>) => setDraft({ ...draft, agent: { ...draft.agent, ...patch } });
    return (
      <div className="glow overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2.5 text-sm">
          <Pencil className="size-4 text-primary" />
          <span className="font-medium">Editing plan</span>
          <span className="ml-auto text-[11px] text-muted-foreground">Changes apply when you approve</span>
        </div>
        <div className="space-y-4 p-4 text-sm">
          <Textarea value={draft.summary} onChange={(e) => set({ summary: e.target.value })} className="min-h-16 text-sm" aria-label="Summary" />
          <Section icon={LayoutPanelTop} title={L.screens}>
            <ScreensEditor screens={draft.screens} onChange={(screens) => set({ screens })} />
          </Section>
          <Section icon={Bot} title={L.agent}>
            <div className="flex gap-1">
              <input value={draft.agent.name} onChange={(e) => setAgent({ name: e.target.value })} className={cn(editorField, "w-40 shrink-0 font-medium")} aria-label="Agent name" />
              <input value={draft.agent.goal} onChange={(e) => setAgent({ goal: e.target.value })} className={editorField} aria-label="Agent goal" />
            </div>
            <p className="pt-1 text-xs text-muted-foreground">{mode === "guided" ? "Steps, in order — drag to reorder" : "Pipeline steps (drag to reorder)"}</p>
            <StringListEditor items={draft.agent.steps} onChange={(steps) => setAgent({ steps })} placeholder="Add step" reorder />
            <p className="pt-1 text-xs text-muted-foreground">{mode === "guided" ? "What it can use" : "Tools"}</p>
            <StringListEditor items={draft.agent.tools} onChange={(tools) => setAgent({ tools })} placeholder="Add tool" />
          </Section>
          <Section icon={Database} title={L.data}>
            <DataEditor data={draft.data} onChange={(data) => set({ data })} />
          </Section>
          <Section icon={ShieldCheck} title={L.rules}>
            <StringListEditor items={draft.rules} onChange={(rules) => set({ rules })} placeholder="Add rule" />
          </Section>
          <Section icon={Plug} title={L.integrations}>
            <StringListEditor items={draft.integrations} onChange={(integrations) => set({ integrations })} placeholder="Add integration" />
          </Section>
          <Section icon={Lightbulb} title={L.assumptions}>
            <StringListEditor items={draft.assumptions} onChange={(assumptions) => set({ assumptions })} placeholder="Add assumption" />
          </Section>
        </div>
        <div className="flex gap-2 border-t p-3">
          <Button
            size="lg"
            className="flex-1"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await onSave?.(draft);
              setSaving(false);
              if (ok) setDraft(null);
            }}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Check />} Save plan
          </Button>
          <Button size="lg" variant="outline" onClick={() => setDraft(null)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card", state === "actionable" && "glow", state === "superseded" && "opacity-60")}>
      <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2.5 text-sm">
        <LayoutPanelTop className="size-4 text-primary" />
        <span className="font-medium">Build plan</span>
        {plan.edited && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <UserPen className="size-3" /> Edited by you
          </span>
        )}
        {state === "actionable" && onSave && (
          <button
            onClick={() => setDraft(structuredClone(plan))}
            disabled={busy}
            aria-label="Edit plan"
            className={cn("grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50", !plan.edited && "ml-auto")}
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            !plan.edited && !(state === "actionable" && onSave) && "ml-auto",
            state === "approved" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
            state === "actionable" && "bg-primary/15 text-primary",
            state === "superseded" && "bg-muted text-muted-foreground",
          )}
        >
          {state === "approved" ? "Approved" : state === "actionable" ? "Awaiting approval" : "Replaced"}
        </span>
      </div>

      <div className="space-y-4 p-4 text-sm">
        <p className="text-foreground/90">{plan.summary}</p>

        <Section icon={LayoutPanelTop} title={L.screens}>
          <ul className="space-y-1">
            {plan.screens.map((s) => (
              <li key={s.name}>
                <span className="font-medium">{s.name}</span> <span className="text-muted-foreground">— {s.purpose}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Bot} title={L.agent}>
          <p>
            <span className="font-medium">{plan.agent.name}</span> <span className="text-muted-foreground">— {plan.agent.goal}</span>
          </p>
          <ol className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            {plan.agent.steps.map((step, i) => (
              <li key={step} className="flex items-center gap-1.5">
                <span className="rounded-md border bg-muted/60 px-2 py-1">{step}</span>
                {i < plan.agent.steps.length - 1 && <span className="text-muted-foreground">→</span>}
              </li>
            ))}
          </ol>
          {plan.agent.tools.length > 0 && (
            <p className="text-xs text-muted-foreground">Uses: {plan.agent.tools.join(" · ")}</p>
          )}
        </Section>

        {plan.data.length > 0 && (
          <Section icon={Database} title={L.data}>
            <ul className="space-y-1">
              {plan.data.map((d) => (
                <li key={d.entity}>
                  <span className="font-medium">{d.entity}</span>{" "}
                  <span className={cn("text-muted-foreground", mode === "pro" && "font-mono text-xs")}>
                    {mode === "pro" ? `{ ${d.fields.join(", ")} }` : `— ${d.fields.join(", ")}`}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {plan.rules.length > 0 && (
          <Section icon={ShieldCheck} title={L.rules}>
            <ul className="list-disc space-y-0.5 pl-5">
              {plan.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Section>
        )}

        {plan.integrations.length > 0 && (
          <Section icon={Plug} title={L.integrations}>
            <div className="flex flex-wrap gap-1.5">
              {plan.integrations.map((i) => (
                <span key={i} className="rounded-full border px-2 py-0.5 text-xs">{i}</span>
              ))}
            </div>
          </Section>
        )}

        {plan.assumptions.length > 0 && (
          <Section icon={Lightbulb} title={L.assumptions}>
            <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
              {plan.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {state === "actionable" && (
        <div data-tour="plan" className="flex gap-2 border-t p-3">
          <Button size="lg" className="flex-1" onClick={onApprove} disabled={busy}>
            <Check /> Approve & build
          </Button>
          {onSave && (
            <Button size="lg" variant="outline" onClick={() => setDraft(structuredClone(plan))} disabled={busy}>
              <Pencil /> Edit
            </Button>
          )}
          <Button size="lg" variant="ghost" onClick={onRefine} disabled={busy}>
            Ask for changes
          </Button>
        </div>
      )}
    </div>
  );
}
