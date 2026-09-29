import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { loadWorkspaces } from "@/lib/actions/workspaces";
import { getUser } from "@/lib/supabase/server";
import type { Mode } from "@/lib/types";
import { ProjectSettingsForm } from "./project-settings-form";

export const metadata = { title: "Project settings — Architect" };

export default async function ProjectSettingsPage(props: PageProps<"/p/[id]/settings">) {
  const { id } = await props.params;
  const { supabase, user } = await getUser();

  const [{ data: project }, { data: envRow }, sharing, { workspaces, setupNeeded }] = await Promise.all([
    supabase.from("projects").select("id, name, mode, owner_id").eq("id", id).single(),
    supabase.from("env_vars").select("id").eq("project_id", id).eq("key", "SLACK_WEBHOOK_URL").maybeSingle(),
    // Separate query: before migration 0011 the column doesn't exist, and that must not 404 the page.
    supabase.from("projects").select("workspace_id").eq("id", id).maybeSingle(),
    loadWorkspaces(),
  ]);

  if (!project) notFound();
  // Workspace members can see shared projects, but only the owner manages them.
  if (project.owner_id !== user?.id) redirect(`/p/${id}/preview`);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/p/${id}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to project
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Settings</span>
      </div>

      <h1 className="mb-6 text-xl font-semibold">Project settings</h1>

      <ProjectSettingsForm
        projectId={project.id}
        name={project.name}
        mode={project.mode as Mode}
        slackConfigured={Boolean(envRow)}
        workspaceId={(sharing.data as { workspace_id: string | null } | null)?.workspace_id ?? null}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
        sharingSetupNeeded={setupNeeded || Boolean(sharing.error)}
      />
    </div>
  );
}
