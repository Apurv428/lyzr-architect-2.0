"use server";

import { SUPABASE_URL } from "@/lib/supabase/env";
import { getUser } from "@/lib/supabase/server";

/** Points a project at its freshly uploaded thumbnail (must be the caller's own public object). */
export async function setThumbnail(projectId: string, url: string) {
  const { supabase, user } = await getUser();
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/thumbnails/${user!.id}/`;
  if (!url.startsWith(prefix)) return { error: "Invalid thumbnail location." };
  const { error } = await supabase.from("projects").update({ thumbnail_url: url }).eq("id", projectId);
  return error ? { error: error.message } : { ok: true };
}
