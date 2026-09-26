"use server";

import type { AgentGraph, AgentRecord } from "@/lib/agent/types";
import { encrypt } from "@/lib/crypto";
import { getUser } from "@/lib/supabase/server";

const SLACK_WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/;

const COLUMNS = "id, project_id, name, framework, model, graph, updated_at";
const LIST_COLUMNS = "id, name, updated_at";

export async function createAgent(projectId: string, name: string, graph: AgentGraph, framework?: string | null) {
  const { supabase } = await getUser();
  const { data, error } = await supabase
    .from("agents")
    .insert({ project_id: projectId, name, graph, framework: framework ?? "lyzr-adk" })
    .select(COLUMNS)
    .single();
  return error || !data ? { error: error?.message ?? "Could not create agent" } : { agent: data as AgentRecord };
}

export async function saveAgent(id: string, patch: Partial<Pick<AgentRecord, "name" | "framework" | "model" | "graph">>) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("agents").update(patch).eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

/** Returns true when a SLACK_WEBHOOK_URL is saved for this project. */
export async function getSlackWebhookConfigured(projectId: string): Promise<boolean> {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("env_vars")
    .select("id")
    .eq("project_id", projectId)
    .eq("key", "SLACK_WEBHOOK_URL")
    .maybeSingle();
  return Boolean(data);
}

/** Save (or overwrite) the Slack incoming webhook URL for this project. */
export async function saveSlackWebhook(projectId: string, webhookUrl: string) {
  if (!SLACK_WEBHOOK_RE.test(webhookUrl.trim())) {
    return { error: "Must be a valid Slack incoming webhook URL (https://hooks.slack.com/services/…)." };
  }
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated." };
  const { error } = await supabase.from("env_vars").upsert(
    { project_id: projectId, owner_id: user.id, key: "SLACK_WEBHOOK_URL", value: encrypt(webhookUrl.trim()), env: "production" },
    { onConflict: "project_id,key,env" },
  );
  return error ? { error: error.message } : { ok: true };
}

/** Remove the Slack webhook URL for this project. */
export async function removeSlackWebhook(projectId: string) {
  const { supabase } = await getUser();
  const { error } = await supabase
    .from("env_vars")
    .delete()
    .eq("project_id", projectId)
    .eq("key", "SLACK_WEBHOOK_URL");
  return error ? { error: error.message } : { ok: true };
}

/** List agents the current user owns — used for the sub-agent picker. */
export async function listUserAgents(excludeAgentId?: string): Promise<{ id: string; name: string; updated_at: string }[]> {
  const { supabase } = await getUser();
  let q = supabase.from("agents").select(LIST_COLUMNS).order("updated_at", { ascending: false }).limit(50);
  if (excludeAgentId) q = q.neq("id", excludeAgentId);
  const { data } = await q;
  return (data ?? []) as { id: string; name: string; updated_at: string }[];
}
