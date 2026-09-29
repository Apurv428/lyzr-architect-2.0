"use server";

import { redirect } from "next/navigation";
import { track } from "@/lib/analytics";
import { getUser } from "@/lib/supabase/server";
import { getTemplate } from "@/lib/catalog";
import { MAX_ATTACHMENTS, type Attachment } from "@/lib/attachments";
import type { Mode } from "@/lib/types";

function nameFromPrompt(prompt: string) {
  const cleaned = prompt
    .replace(/^(please\s+)?(build|create|make|generate)\s+(me\s+)?(an?\s+)?/i, "")
    .split(/[.,;\n]| that | which | where /i)[0]
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 5).join(" ");
  return words ? words[0].toUpperCase() + words.slice(1) : "Untitled project";
}

export async function createProject(input: {
  prompt?: string;
  templateId?: string;
  mode?: Mode;
  framework?: string;
  attachments?: Attachment[];
}) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const template = getTemplate(input.templateId);
  const prompt = (input.prompt?.trim() || template?.prompt || "").slice(0, 4000);
  if (!prompt) return { error: "Tell Architect what you want to build." };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: template?.name ?? nameFromPrompt(prompt),
      prompt,
      mode: input.mode ?? "guided",
      template_id: template?.id ?? null,
      framework: input.framework ?? null,
      status: "planning",
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create project." };

  await supabase.from("messages").insert({
    project_id: data.id,
    role: "user",
    kind: "text",
    content: prompt,
    data: input.attachments?.length
      ? { attachments: input.attachments.filter((a) => a.path.startsWith(`${user.id}/`)).slice(0, MAX_ATTACHMENTS) }
      : null,
  });
  await track(supabase, "project_created", { source: template ? "template" : "prompt", mode: input.mode ?? "guided" }, data.id);

  redirect(`/p/${data.id}`);
}

export async function deleteProject(id: string) {
  const { supabase } = await getUser();
  // Record first: the event keeps no project reference once the row is gone.
  await track(supabase, "project_deleted", { id });
  const { error } = await supabase.from("projects").delete().eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

/** Copies the project, its latest checkpoint and its agent — not the chat or deployments. */
export async function duplicateProject(id: string, customName?: string, fromCheckpointId?: string) {
  const { supabase } = await getUser();

  const checkpointQuery = fromCheckpointId
    ? supabase.from("checkpoints").select("label, files").eq("id", fromCheckpointId).eq("project_id", id).maybeSingle()
    : supabase.from("checkpoints").select("label, files").eq("project_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const [{ data: source }, { data: checkpoint }, { data: agent }] = await Promise.all([
    supabase.from("projects").select("name, description, prompt, mode, template_id, framework, github_repo, github_branch").eq("id", id).single(),
    checkpointQuery,
    supabase.from("agents").select("name, framework, model, graph").eq("project_id", id).limit(1).maybeSingle(),
  ]);
  if (!source) return { error: "Project not found" };

  const copyName = (customName ?? `Copy of ${source.name}`).slice(0, 80);
  const { data: copy, error } = await supabase
    .from("projects")
    .insert({ ...source, name: copyName, status: checkpoint ? "ready" : "draft" })
    .select("id")
    .single();
  if (error || !copy) return { error: error?.message ?? "Could not duplicate" };

  const label = `Duplicated from “${source.name}”`;
  const { data: message } = await supabase
    .from("messages")
    .insert({ project_id: copy.id, role: "system", kind: "checkpoint", content: label })
    .select("id")
    .single();
  await Promise.all([
    checkpoint &&
      supabase.from("checkpoints").insert({ project_id: copy.id, message_id: message?.id ?? null, label, files: checkpoint.files }),
    agent && supabase.from("agents").insert({ ...agent, project_id: copy.id }),
    track(supabase, "project_created", { source: "duplicate", mode: source.mode }, copy.id),
  ]);
  return { id: copy.id as string };
}

export async function updateProject(id: string, patch: { name?: string; mode?: Mode }) {
  const { supabase } = await getUser();
  const update: { name?: string; mode?: Mode } = {};
  if (patch.name?.trim()) update.name = patch.name.trim().slice(0, 80);
  if (patch.mode === "guided" || patch.mode === "pro") update.mode = patch.mode;
  const { error } = await supabase.from("projects").update(update).eq("id", id);
  if (!error && update.mode) await track(supabase, "mode_switched", { to: update.mode }, id);
  return error ? { error: error.message } : { ok: true };
}
