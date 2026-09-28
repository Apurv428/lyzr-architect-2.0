import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { FullPreview } from "@/components/preview/full-preview";
import type { FileMap } from "@/lib/ai/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

async function load(slug: string, id?: string) {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  let query = supabase.from("deployments").select("project_id, label, files, env, created_at").eq("slug", slug).eq("status", "ready");
  query = id ? query.eq("id", id) : query.eq("is_current", true);
  const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function generateMetadata(props: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const d = await load(slug);
  return { title: d?.label ? `${d.label} · Built with Architect` : "Architect app" };
}

export default async function PublicApp(props: PageProps<"/s/[slug]">) {
  const { slug } = await props.params;
  const { d } = await props.searchParams;
  const deployment = await load(slug, typeof d === "string" ? d : undefined);
  if (!deployment?.files) notFound();

  return (
    <div className="relative h-dvh bg-white">
      <FullPreview files={deployment.files as FileMap} projectId={deployment.project_id as string} />
      {deployment.env === "preview" && (
        <div className="fixed top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-1 text-xs font-medium text-amber-950 shadow">Preview deployment</div>
      )}
      <Link
        href="/"
        className="fixed right-4 bottom-4 z-10 inline-flex items-center gap-2 rounded-full bg-zinc-900/90 py-1.5 pr-3 pl-1.5 text-xs text-white shadow-lg backdrop-blur hover:bg-zinc-900"
      >
        <LogoMark className="size-5" /> Built with Architect
      </Link>
    </div>
  );
}
