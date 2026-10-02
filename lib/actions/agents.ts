"use server";

import { SLACK_WEBHOOK_RE, type AgentGraph, type AgentRecord } from "@/lib/agent/types";
import { McpSession, mcpToken } from "@/lib/agent/mcp";
import { decrypt, encrypt } from "@/lib/crypto";
import { getUser } from "@/lib/supabase/server";
import type { SlackResult } from "@/lib/workspace/sandbox";

const COLUMNS = "id, project_id, name, framework, model, graph, updated_at";
const LIST_COLUMNS = "id, name, updated_at";

/** MCP server tokens are stored encrypted, like env vars; already-encrypted values are left alone. */
function sealSecrets(graph: AgentGraph): AgentGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const token = n.data.kind === "mcp" ? n.data.config.authToken : undefined;
      return typeof token === "string" && token && !token.startsWith("v1:")
        ? { ...n, data: { ...n.data, config: { ...n.data.config, authToken: encrypt(token) } } }
        : n;
    }),
  };
}

export async function createAgent(projectId: string, name: string, graph: AgentGraph, framework?: string | null) {
  const { supabase } = await getUser();
  const { data, error } = await supabase
    .from("agents")
    .insert({ project_id: projectId, name, graph: sealSecrets(graph), framework: framework ?? "lyzr-adk" })
    .select(COLUMNS)
    .single();
  return error || !data ? { error: error?.message ?? "Could not create agent" } : { agent: data as AgentRecord };
}

export async function saveAgent(id: string, patch: Partial<Pick<AgentRecord, "name" | "framework" | "model" | "graph">>) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("agents").update(patch.graph ? { ...patch, graph: sealSecrets(patch.graph) } : patch).eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

/** Connects to an MCP server the way a run would and lists its tools (Agent → MCP block → Test). */
export async function testMcpServer(url: string, token: string | null): Promise<{ tools: { name: string; description?: string }[] } | { error: string }> {
  const { user } = await getUser();
  if (!user) return { error: "Not signed in." };
  try {
    const session = await McpSession.connect(url.trim(), mcpToken(token));
    const tools = await session.listTools(50);
    return { tools: tools.map((t) => ({ name: t.name, description: t.description })) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't connect." };
  }
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

/**
 * Sends a generated app's Slack post with the project's saved webhook. Only the owner can read the
 * webhook, so anyone else viewing the app gets a simulated post.
 */
export async function postToProjectSlack(projectId: string, text: string): Promise<SlackResult> {
  const message = text.trim().slice(0, 3000);
  if (!message) return { ok: false, simulated: false, error: "The message is empty." };
  const { supabase, user } = await getUser();
  if (!user) return { ok: true, simulated: true };
  const { data } = await supabase
    .from("env_vars")
    .select("value")
    .eq("project_id", projectId)
    .eq("key", "SLACK_WEBHOOK_URL")
    .eq("env", "production")
    .maybeSingle();
  const url = decrypt(data?.value);
  if (!url || !SLACK_WEBHOOK_RE.test(url)) return { ok: true, simulated: true };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true, simulated: false };
    if (res.status === 403 || res.status === 404) {
      return { ok: false, simulated: false, error: "Slack rejected the webhook. It may have been removed; add a new one in the Agent tab." };
    }
    return { ok: false, simulated: false, error: `Slack returned an error (${res.status}).` };
  } catch {
    return { ok: false, simulated: false, error: "Couldn't reach Slack." };
  }
}

/** List agents the current user owns — used for the sub-agent picker. */
export async function listUserAgents(excludeAgentId?: string): Promise<{ id: string; name: string; updated_at: string; project_id: string | null }[]> {
  const { supabase } = await getUser();
  let q = supabase.from("agents").select(`${LIST_COLUMNS}, project_id`).order("updated_at", { ascending: false }).limit(50);
  if (excludeAgentId) q = q.neq("id", excludeAgentId);
  const { data } = await q;
  return (data ?? []) as { id: string; name: string; updated_at: string; project_id: string | null }[];
}
