"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import type { Project, ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProjectCard } from "./project-card";

type Sort = "recent" | "name" | "created";
const STATUSES: { id: "all" | ProjectStatus | "live"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "planning", label: "Planning" },
  { id: "ready", label: "Built" },
  { id: "live", label: "Live" },
];

export function ProjectsBrowser({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "guided" | "pro">("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number]["id"]>("all");
  const [sort, setSort] = useState<Sort>("recent");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.prompt ?? "").toLowerCase().includes(q))
      .filter((p) => mode === "all" || p.mode === mode)
      .filter((p) => status === "all" || (status === "live" ? p.status === "deployed" : p.status === status))
      .sort((a, b) =>
        sort === "name" ? a.name.localeCompare(b.name) : sort === "created" ? b.created_at.localeCompare(a.created_at) : b.updated_at.localeCompare(a.updated_at),
      );
  }, [projects, query, mode, status, sort]);

  const chip = (active: boolean) =>
    cn("rounded-full border px-3 py-1 text-xs transition", active ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-60 flex-1 items-center gap-2 rounded-lg border bg-card/60 px-3">
          <Search className="size-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or prompt" className="h-9 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="h-9 rounded-lg border bg-card/60 px-2 text-sm">
          <option value="recent">Recently edited</option>
          <option value="created">Newest</option>
          <option value="name">Name</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s.id} className={chip(status === s.id)} onClick={() => setStatus(s.id)}>{s.label}</button>
        ))}
        <span className="mx-1 w-px bg-border" />
        {(["all", "guided", "pro"] as const).map((m) => (
          <button key={m} className={chip(mode === m)} onClick={() => setMode(m)}>
            {m === "all" ? "Any mode" : m === "guided" ? "Guided" : "Pro"}
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/30 px-6 py-12 text-center">
          <Sparkles className="size-6 text-primary" />
          <p className="font-medium">{projects.length ? "Nothing matches those filters" : "No projects yet"}</p>
          <p className="text-sm text-muted-foreground">{projects.length ? "Try a different search or clear a filter." : "Start one from the dashboard."}</p>
        </div>
      )}
    </div>
  );
}
