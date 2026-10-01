import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { FullPreview } from "@/components/preview/full-preview";
import type { FileMap } from "@/lib/ai/schema";
import { getUser } from "@/lib/supabase/server";

export default async function PreviewPage(props: PageProps<"/p/[id]/preview">) {
  const { id } = await props.params;
  const { supabase, user } = await getUser();
  const [{ data: project }, { data: checkpoint }, { count }] = await Promise.all([
    supabase.from("projects").select("name, owner_id").eq("id", id).single(),
    supabase
      .from("checkpoints")
      .select("files")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("checkpoints").select("id", { count: "exact", head: true }).eq("project_id", id),
  ]);
  if (!project || !checkpoint) notFound();
  const shared = project.owner_id !== user?.id;

  return (
    <div className="relative h-dvh bg-white">
      <FullPreview files={checkpoint.files as FileMap} projectId={id} commentable version={count ?? 1} />
      <Link
        href={shared ? "/dashboard" : `/p/${id}`}
        className="fixed right-4 bottom-4 z-10 inline-flex items-center gap-2 rounded-full bg-zinc-900/90 py-1.5 pr-3 pl-1.5 text-xs text-white shadow-lg backdrop-blur hover:bg-zinc-900"
      >
        <LogoMark className="size-5" /> {project.name} · {shared ? "Shared with you · view only" : "Built with Architect"}
      </Link>
    </div>
  );
}
