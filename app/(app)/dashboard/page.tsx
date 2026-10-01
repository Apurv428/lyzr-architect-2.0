import Link from "next/link";
import { FolderGit2, Sparkles, Users } from "lucide-react";
import { ProjectCard } from "@/components/dashboard/project-card";
import { PromptBox } from "@/components/dashboard/prompt-box";
import { TemplateGrid } from "@/components/dashboard/template-grid";
import { ImportRepoCard } from "@/components/dashboard/import-repo-card";
import { getUser } from "@/lib/supabase/server";
import type { Mode, Project } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const { prompt } = await props.searchParams;
  const { supabase, user } = await getUser();

  const [{ data: profile }, { data: projects }, { data: sharedRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, default_mode").eq("id", user!.id).single(),
    supabase
      .from("projects")
      .select("id, name, description, prompt, mode, template_id, framework, status, deploy_url, thumbnail_url, created_at, updated_at")
      .eq("owner_id", user!.id)
      .order("updated_at", { ascending: false })
      .limit(9),
    // Projects teammates shared through a workspace (visible once migration 0011 is in).
    supabase
      .from("projects")
      .select("id, name, updated_at")
      .neq("owner_id", user!.id)
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  const firstName = (profile?.full_name ?? user!.email ?? "").split(/[\s@]/)[0];
  const mode = (profile?.default_mode ?? "guided") as Mode;
  const list = (projects ?? []) as Project[];
  const shared = (sharedRows ?? []) as { id: string; name: string; updated_at: string }[];

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_70%)]" />
      <div className="relative mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-8 sm:py-14">
        <section className="mx-auto max-w-3xl space-y-6">
          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </p>
            <h1 className="text-gradient text-3xl font-semibold tracking-tight sm:text-4xl">
              What will you build today?
            </h1>
          </div>
          <PromptBox defaultMode={mode} initialPrompt={typeof prompt === "string" ? prompt : ""} />
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-semibold">Recent projects</h2>
            {list.length > 0 && (
              <Link href="/projects" className="text-sm text-primary hover:underline">View all →</Link>
            )}
          </div>
          {list.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/30 px-6 py-12 text-center">
              <Sparkles className="size-6 text-primary" />
              <p className="font-medium">No projects yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Describe an idea above or start from a template — Architect will propose a plan before building anything.
              </p>
            </div>
          )}
        </section>

        {shared.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Users className="size-5" /> Shared with you
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {shared.map((p) => (
                <Link key={p.id} href={`/p/${p.id}/preview`} className="flex items-center justify-between gap-3 rounded-xl border bg-card/60 px-4 py-3 text-sm hover:border-primary/40">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">View · comment</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section id="templates" className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Start from a template</h2>
            <TemplateGrid mode={mode} />
          </div>
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <FolderGit2 className="size-5" /> Bring your code
            </h2>
            <ImportRepoCard />
          </div>
        </section>
      </div>
    </div>
  );
}
