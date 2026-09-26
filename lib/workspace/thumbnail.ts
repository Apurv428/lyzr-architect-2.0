"use client";

import { setThumbnail } from "@/lib/actions/thumbnails";
import { createClient } from "@/lib/supabase/client";

/** Uploads a captured preview as the project's dashboard thumbnail. Best-effort: failures are silent. */
export async function saveThumbnail(projectId: string, checkpointId: string, dataUrl: string) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${user.id}/${projectId}.jpg`;
    const { error } = await supabase.storage.from("thumbnails").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) return null;
    // The version suffix busts caches and records which checkpoint the image shows.
    const url = `${supabase.storage.from("thumbnails").getPublicUrl(path).data.publicUrl}?v=${checkpointId.slice(0, 8)}`;
    const res = await setThumbnail(projectId, url);
    return "error" in res ? null : url;
  } catch {
    return null;
  }
}
