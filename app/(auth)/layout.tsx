import { Check, GitBranch, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function PlanPreview() {
  const rows = [
    ["Screens", "Inbox · Ticket detail · Analytics"],
    ["Data", "tickets, categories, replies"],
    ["Agent", "Classify → Prioritise → Draft reply"],
    ["Rules", "No refunds promised · Redact PII"],
  ];
  return (
    <div className="glow w-full max-w-md rounded-2xl border bg-card/80 p-5 backdrop-blur">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Sparkles className="size-4 text-primary" />
        <span className="font-medium">Here’s my plan</span>
        <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Awaiting approval</span>
      </div>
      <dl className="space-y-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-16 shrink-0 text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          <Check className="size-3.5" /> Approve & build
        </span>
        <span className="inline-flex items-center rounded-lg border px-3 py-1.5 text-xs">Refine</span>
      </div>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col p-6 sm:p-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">{children}</div>
        {!isSupabaseConfigured && (
          <p className="text-center text-xs text-amber-600 dark:text-amber-400">
            Dev notice: Supabase env vars are missing — auth is disabled.
          </p>
        )}
      </div>
      <div className="relative hidden overflow-hidden border-l bg-sidebar lg:flex lg:flex-col lg:items-center lg:justify-center lg:gap-8 lg:p-12">
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-3 text-center">
          <h2 className="text-gradient text-3xl font-semibold tracking-tight">
            Describe it. Approve the plan.
            <br />
            Ship the agent.
          </h2>
          <p className="text-sm text-muted-foreground">
            Guided when you want help — raw code when you want control.
          </p>
        </div>
        <div className="relative w-full max-w-md">
          <PlanPreview />
          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><GitBranch className="size-3.5" /> Checkpoint saved</span>
            <span>·</span>
            <span>Deploys in one click</span>
          </div>
        </div>
      </div>
    </div>
  );
}
