"use server";

import { redirect } from "next/navigation";
import type { FileMap } from "@/lib/ai/schema";
import { createImportedProject } from "@/lib/import-project";
import { getUser } from "@/lib/supabase/server";
import { IMPORT_LIMITS, importablePath } from "@/lib/workspace/import";

/** Imports a local project the browser has already unzipped and filtered. */
export async function importZipProject(input: { name: string; goal: string; files: FileMap; skipped: number }) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  // Re-apply the limits on the server: the browser's filtering is only a convenience.
  const files: FileMap = {};
  let total = 0;
  for (const [path, content] of Object.entries(input.files ?? {})) {
    if (typeof content !== "string" || !importablePath(path) || content.length > IMPORT_LIMITS.fileBytes) continue;
    if (Object.keys(files).length >= IMPORT_LIMITS.files || total + content.length > IMPORT_LIMITS.totalBytes) break;
    files[path] = content;
    total += content.length;
  }
  const count = Object.keys(files).length;
  if (!count) return { error: "No readable source files found in that ZIP." };

  const fileName = String(input.name ?? "project.zip").slice(0, 120);
  const goal = String(input.goal ?? "").trim().slice(0, 4000);
  const res = await createImportedProject(supabase, {
    name: fileName.replace(/\.zip$/i, "").trim() || "Imported project",
    description: `Imported from ${fileName} (${count} files). Keep working on the existing code: edit files in place and keep their paths.`,
    prompt: goal || null,
    mode: "pro",
    source: "zip",
    files,
    skipped: Math.max(0, Number(input.skipped) || 0),
    summary: `Imported ${count} files from ${fileName}${input.skipped ? ` · skipped ${input.skipped}` : ""}`,
  });
  if ("error" in res) return res;
  redirect(`/p/${res.id}`);
}
