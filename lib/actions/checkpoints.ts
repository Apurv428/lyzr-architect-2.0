"use server";

import type { ChangesData, ChatMessage, FileMap } from "@/lib/ai/schema";
import { track } from "@/lib/analytics";
import { getUser } from "@/lib/supabase/server";

export type CheckpointMeta = { id: string; label: string; created_at: string };

const MESSAGE_COLUMNS = "id, role, kind, content, data, created_at";

// Restoring never rewrites history: it appends a new checkpoint with the old files.
export async function restoreCheckpoint(projectId: string, checkpointId: string) {
  const { supabase } = await getUser();
  const { data: source } = await supabase
    .from("checkpoints")
    .select("label, files")
    .eq("id", checkpointId)
    .eq("project_id", projectId)
    .single();
  if (!source) return { error: "Checkpoint not found" };

  const label = `Restored “${source.label}”`;
  const { data: message, error: msgError } = await supabase
    .from("messages")
    .insert({ project_id: projectId, role: "system", kind: "checkpoint", content: label, data: { restoredFrom: checkpointId } })
    .select(MESSAGE_COLUMNS)
    .single();
  if (msgError || !message) return { error: msgError?.message ?? "Could not restore" };

  const { data: checkpoint, error } = await supabase
    .from("checkpoints")
    .insert({ project_id: projectId, message_id: message.id, label, files: source.files })
    .select("id, label, created_at")
    .single();
  if (error || !checkpoint) return { error: error?.message ?? "Could not restore" };
  await track(supabase, "restore", {}, projectId);

  return {
    files: source.files as FileMap,
    checkpoint: checkpoint as CheckpointMeta,
    message: message as ChatMessage,
  };
}

// Pro-mode manual edits become a checkpoint like any AI change.
export async function saveManualEdit(projectId: string, files: FileMap, changed: string[]) {
  const { supabase } = await getUser();
  const messageId = crypto.randomUUID();
  const checkpointId = crypto.randomUUID();
  const label = changed.length === 1 ? `Edited ${changed[0]}` : `Edited ${changed.length} files`;
  const data: ChangesData = { label, summary: ["Manual code edit"], files: changed, suggestions: [], checkpointId };

  const { data: message, error: msgError } = await supabase
    .from("messages")
    .insert({ id: messageId, project_id: projectId, role: "system", kind: "changes", content: label, data })
    .select(MESSAGE_COLUMNS)
    .single();
  if (msgError || !message) return { error: msgError?.message ?? "Could not save" };

  const { data: checkpoint, error } = await supabase
    .from("checkpoints")
    .insert({ id: checkpointId, project_id: projectId, message_id: messageId, label, files })
    .select("id, label, created_at")
    .single();
  if (error || !checkpoint) return { error: error?.message ?? "Could not save" };

  return { checkpoint: checkpoint as CheckpointMeta, message: message as ChatMessage };
}
