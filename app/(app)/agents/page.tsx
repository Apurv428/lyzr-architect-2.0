import Link from "next/link";
import { Bot, BookOpen, Globe, ShieldCheck, Wrench } from "lucide-react";
import { compileAgent } from "@/lib/agent/compile";
import { MODELS, TOOL_CATALOG, type AgentGraph } from "@/lib/agent/types";
import { FRAMEWORKS } from "@/lib/catalog";
import { getUser } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";

type Row = {
  id: string;
  name: string;
  framework: string;
  graph: AgentGraph;
  updated_at: string;
  project: { id: string; name: string } | null;
  runs: { count: number }[];
};

export default async function AgentsPage() {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("agents")
    .select("id, name, framework, graph, updated_at, project:projects(id, name), runs:agent_runs(count)")
    .order("updated_at", { ascending: false });
  const agents = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground">Every agent across your projects — its brain, tools, knowledge and rules at a glance.</p>
      </header>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/30 px-6 py-14 text-center">
          <Bot className="size-6 text-primary" />
          <p className="font-medium">No agents yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Agents are created from a project’s plan. Open a project and head to its Agent tab.</p>
          <Link href="/dashboard" className="mt-2 text-sm font-medium text-primary hover:underline">Go to projects</Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((a) => {
            const spec = compileAgent(a.graph, a.name);
            const model = MODELS.find((m) => m.id === spec.model)?.label ?? spec.model;
            const framework = FRAMEWORKS.find((f) => f.id === a.framework)?.name ?? a.framework;
            const runs = a.runs?.[0]?.count ?? 0;
            return (
              <Link
                key={a.id}
                href={a.project ? `/p/${a.project.id}` : "/dashboard"}
                className="group space-y-4 rounded-xl border bg-card/60 p-5 transition hover:-translate-y-0.5 hover:border-primary/50"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15"><Bot className="size-5 text-primary" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.project?.name ?? "No project"} · updated {timeAgo(a.updated_at)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{framework}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-md bg-muted px-2 py-1">{model}</span>
                  {spec.tools.map((t) => {
                    const meta = TOOL_CATALOG.find((x) => x.id === t);
                    const Icon = t === "web_search" ? Globe : Wrench;
                    return (
                      <span key={t} className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-1 text-sky-700 dark:text-sky-300">
                        <Icon className="size-3" /> {meta?.label ?? t}
                      </span>
                    );
                  })}
                  {spec.knowledge && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-1 text-violet-700 dark:text-violet-300"><BookOpen className="size-3" /> Knowledge</span>
                  )}
                  {(spec.rules.length > 0 || spec.redactPII) && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-rose-700 dark:text-rose-300">
                      <ShieldCheck className="size-3" /> {spec.rules.length} rules{spec.redactPII ? " + PII" : ""}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {a.graph.nodes.length} blocks · {runs} test run{runs === 1 ? "" : "s"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
