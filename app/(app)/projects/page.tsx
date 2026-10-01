import { ProjectsBrowser } from "@/components/dashboard/projects-browser";
import { getUser } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";

export default async function ProjectsPage() {
  const { supabase, user } = await getUser();
  // Your own projects; ones shared with you through a workspace are listed on the dashboard.
  const { data } = await supabase
    .from("projects")
    .select("id, name, description, prompt, mode, template_id, framework, status, deploy_url, thumbnail_url, created_at, updated_at")
    .eq("owner_id", user!.id)
    .order("updated_at", { ascending: false })
    .limit(500);
  const projects = (data ?? []) as Project[];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">{projects.length} project{projects.length === 1 ? "" : "s"} — rename, duplicate or clean up from the ⋯ menu.</p>
      </header>
      <ProjectsBrowser projects={projects} />
    </div>
  );
}
