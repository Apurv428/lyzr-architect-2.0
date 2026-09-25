import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { FullPreview } from "@/components/preview/full-preview";
import type { FileMap } from "@/lib/ai/schema";
import { getUser } from "@/lib/supabase/server";

export default async function PreviewPage(props: PageProps<"/p/[id]/preview">) {
  const { id } = await props.params;
  const { supabase } = await getUser();
  const [{ data: project }, { data: checkpoint }] = await Promise.all([
    supabase.from("projects").select("name").eq("id", id).single(),
    supabase
      .from("checkpoints")
      .select("files")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!project || !checkpoint) notFound();

  return (
    <div className="relative h-dvh bg-white">
      <FullPreview files={checkpoint.files as FileMap} />
      <Link
        href={`/p/${id}`}
        className="fixed right-4 bottom-4 z-10 inline-flex items-center gap-2 rounded-full bg-zinc-900/90 py-1.5 pr-3 pl-1.5 text-xs text-white shadow-lg backdrop-blur hover:bg-zinc-900"
      >
        <LogoMark className="size-5" /> {project.name} · Built with Architect
      </Link>
    </div>
  );
}
