import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileMap } from "@/lib/ai/schema";
import { track } from "@/lib/analytics";
import type { Mode } from "@/lib/types";
import { IMPORT_LABEL, prepareImport } from "@/lib/workspace/import";

/** What an import message records, so a later pull request can tell Architect's additions from the repo's files. */
export type ImportData = { import: { source: "github" | "zip"; added: string[]; files: number; skipped: number } };

type NewImport = {
  name: string;
  description: string;
  prompt: string | null;
  mode: Mode;
  framework?: string | null;
  githubRepo?: string;
  githubBranch?: string;
  source: "github" | "zip";
  files: FileMap;
  skipped: number;
  summary: string;
};

/** Creates the project, its first checkpoint (the imported files) and the opening messages. */
export async function createImportedProject(supabase: SupabaseClient, input: NewImport) {
  const { files, added } = prepareImport(input.files);
  const fileCount = Object.keys(input.files).length;

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name: input.name.slice(0, 80) || "Imported project",
      description: input.description,
      prompt: input.prompt,
      mode: input.mode,
      framework: input.framework ?? null,
      github_repo: input.githubRepo ?? null,
      github_branch: input.githubBranch ?? null,
      status: input.prompt ? "planning" : "ready",
    })
    .select("id")
    .single();
  if (error || !project) return { error: error?.message ?? "Could not import." };

  const data: ImportData = { import: { source: input.source, added, files: fileCount, skipped: input.skipped } };
  const { data: message } = await supabase
    .from("messages")
    .insert({ project_id: project.id, role: "system", kind: "checkpoint", content: input.summary, data })
    .select("id")
    .single();
  if (fileCount) {
    await supabase.from("checkpoints").insert({ project_id: project.id, message_id: message?.id ?? null, label: IMPORT_LABEL, files });
  }
  // A goal starts the usual plan → build loop; without one the project just opens on its files.
  if (input.prompt) await supabase.from("messages").insert({ project_id: project.id, role: "user", kind: "text", content: input.prompt });
  await track(supabase, "project_created", { source: input.source === "github" ? "import" : "zip_import", files: fileCount }, project.id);
  return { id: project.id as string };
}
