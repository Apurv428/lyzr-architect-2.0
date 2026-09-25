import Link from "next/link";
import { Code2, Wand2 } from "lucide-react";
import { getTemplate } from "@/lib/catalog";
import { timeAgo } from "@/lib/time";
import { ProjectMenu } from "./project-menu";
import type { Project, ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<ProjectStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  planning: { label: "Planning", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  building: { label: "Building", className: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  ready: { label: "Ready", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  deployed: { label: "Live", className: "bg-primary/20 text-primary" },
  error: { label: "Needs attention", className: "bg-destructive/15 text-destructive" },
};

export function ProjectCard({ project }: { project: Project }) {
  const template = getTemplate(project.template_id);
  const Icon = template?.icon;
  const status = STATUS[project.status];

  return (
    <div className="group relative transition hover:-translate-y-0.5">
    <Link
      href={`/p/${project.id}`}
      className="block overflow-hidden rounded-xl border bg-card/60 transition group-hover:border-primary/50"
    >
      <div className={cn("relative h-28 bg-gradient-to-br", template?.accent ?? "from-primary/25 to-fuchsia-500/10")}>
        {project.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL, already a small JPEG
          <img src={project.thumbnail_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover object-top" />
        ) : (
          <>
            <div className="bg-grid absolute inset-0 opacity-50" />
            <div className="absolute inset-x-4 top-4 space-y-1.5">
              <div className="h-2 w-1/3 rounded bg-foreground/20" />
              <div className="h-2 w-2/3 rounded bg-foreground/10" />
              <div className="h-2 w-1/2 rounded bg-foreground/10" />
            </div>
            {Icon && <Icon className="absolute right-4 bottom-3 size-6 text-foreground/60" />}
          </>
        )}
      </div>
      <div className="space-y-2 p-3.5">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{project.name}</p>
          <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", status.className)}>
            {status.label}
          </span>
        </div>
        <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">{project.prompt}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {project.mode === "pro" ? <Code2 className="size-3.5" /> : <Wand2 className="size-3.5" />}
          {project.mode === "pro" ? "Pro" : "Guided"}
          <span>·</span>
          <span>Edited {timeAgo(project.updated_at)}</span>
        </div>
      </div>
    </Link>
    <ProjectMenu project={project} className="absolute top-2 right-2 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:has-[[aria-expanded=true]]:opacity-100" />
    </div>
  );
}
