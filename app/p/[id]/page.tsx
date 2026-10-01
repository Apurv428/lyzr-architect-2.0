import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";
import type { CheckpointMeta } from "@/lib/actions/checkpoints";
import type { AgentRecord } from "@/lib/agent/types";
import type { ChatMessage, FileMap } from "@/lib/ai/schema";
import { currentCredits } from "@/lib/credits";
import { getUser } from "@/lib/supabase/server";
import type { Mode } from "@/lib/types";

export default async function WorkspacePage(props: PageProps<"/p/[id]">) {
  const { id } = await props.params;
  const { runtime } = await props.searchParams;
  const { supabase, user } = await getUser();
  if (!user) notFound();

  const [{ data: project }, { data: messages }, { data: latest }, credits, { data: checkpoints }, { data: agent }, { data: profile }] = await Promise.all([
    supabase.from("projects").select("id, name, mode, github_repo, thumbnail_url, owner_id").eq("id", id).single(),
    supabase
      .from("messages")
      .select("id, role, kind, content, data, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("checkpoints")
      .select("id, label, created_at, files")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(2),
    currentCredits(supabase),
    supabase.from("checkpoints").select("id, label, created_at").eq("project_id", id).order("created_at", { ascending: true }),
    supabase
      .from("agents")
      .select("id, project_id, name, framework, model, graph, updated_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("tour_completed").eq("id", user.id).single(),
  ]);
  const [current, previous] = latest ?? [];
  if (!project) notFound();
  // A project shared through a workspace opens read-only for members: the live app plus comments.
  if (project.owner_id !== user.id) redirect(`/p/${id}/preview`);

  return (
    <Workspace
      key={project.id}
      projectId={project.id}
      name={project.name}
      mode={project.mode as Mode}
      githubRepo={project.github_repo ?? null}
      thumbnailUrl={project.thumbnail_url ?? null}
      messages={(messages ?? []) as ChatMessage[]}
      files={(current?.files ?? {}) as FileMap}
      prevFiles={(previous?.files ?? {}) as FileMap}
      checkpointId={current?.id ?? null}
      checkpoints={(checkpoints ?? []) as CheckpointMeta[]}
      agent={(agent ?? null) as AgentRecord | null}
      credits={credits}
      previewRuntime={runtime === "webcontainer" ? "webcontainer" : "sandpack"}
      tourCompleted={profile?.tour_completed ?? false}
    />
  );
}
