"use server";

import { headers } from "next/headers";
import { track } from "@/lib/analytics";
import { decrypt, encrypt } from "@/lib/crypto";
import { getUser } from "@/lib/supabase/server";
import { generateWebhookSecrets, validateForwardUrl } from "@/lib/webhooks";

export type WebhookRow = {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  projectName: string | null;
  /** Null only if the URL can't be decrypted (ARCHITECT_SECRET changed) — rotating fixes it. */
  url: string | null;
  forwardUrl: string | null;
  enabled: boolean;
  callCount: number;
  lastCalledAt: string | null;
  createdAt: string;
};

export type WebhookCall = {
  id: string;
  status: "running" | "ok" | "error";
  input: string | null;
  output: string | null;
  error: string | null;
  latency_ms: number | null;
  forward_status: number | null;
  created_at: string;
};

export type WebhookAgent = { id: string; name: string; projectName: string | null };

const MAX_WEBHOOKS = 10;
const COLUMNS = "id, agent_id, name, token_ciphertext, forward_url, enabled, call_count, last_called_at, created_at, agent:agents(name, project:projects(name))";

type Raw = {
  id: string;
  agent_id: string;
  name: string;
  token_ciphertext: string;
  forward_url: string | null;
  enabled: boolean;
  call_count: number;
  last_called_at: string | null;
  created_at: string;
  agent: { name: string; project: { name: string } | null } | null;
};

async function baseUrl() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

function toRow(r: Raw, base: string): WebhookRow {
  const token = decrypt(r.token_ciphertext);
  return {
    id: r.id,
    name: r.name,
    agentId: r.agent_id,
    agentName: r.agent?.name ?? "Deleted agent",
    projectName: r.agent?.project?.name ?? null,
    url: token ? `${base}/api/hooks/${token}` : null,
    forwardUrl: r.forward_url,
    enabled: r.enabled,
    callCount: r.call_count,
    lastCalledAt: r.last_called_at,
    createdAt: r.created_at,
  };
}

/** `setupNeeded` means migration 0015_webhooks.sql hasn't been applied to this database yet. */
export async function listWebhooks(): Promise<{ rows: WebhookRow[]; setupNeeded: boolean }> {
  const { supabase, user } = await getUser();
  const { data, error } = await supabase.from("webhooks").select(COLUMNS).eq("owner_id", user!.id).order("created_at", { ascending: false });
  if (error) return { rows: [], setupNeeded: error.code === "PGRST205" || error.code === "42P01" };
  const base = await baseUrl();
  return { rows: ((data ?? []) as unknown as Raw[]).map((r) => toRow(r, base)), setupNeeded: false };
}

export async function listWebhookAgents(): Promise<WebhookAgent[]> {
  const { supabase, user } = await getUser();
  const { data } = await supabase
    .from("agents")
    .select("id, name, project:projects(name)")
    .eq("owner_id", user!.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as unknown as { id: string; name: string; project: { name: string } | null }[]).map((a) => ({
    id: a.id,
    name: a.name,
    projectName: a.project?.name ?? null,
  }));
}

async function forwardOrError(forwardUrl: string | null | undefined) {
  if (!forwardUrl?.trim()) return { value: null };
  const checked = await validateForwardUrl(forwardUrl);
  return checked.ok ? { value: checked.url } : { error: checked.reason };
}

/** Creates a webhook. The signing secret is returned here and can be revealed again later. */
export async function createWebhook(input: { agentId: string; name: string; forwardUrl?: string | null }) {
  const { supabase, user } = await getUser();
  const { count } = await supabase.from("webhooks").select("id", { count: "exact", head: true }).eq("owner_id", user!.id);
  if ((count ?? 0) >= MAX_WEBHOOKS) return { error: `You can have up to ${MAX_WEBHOOKS} webhooks — delete one first.` };

  const forward = await forwardOrError(input.forwardUrl);
  if ("error" in forward) return { error: forward.error };

  const { token, hash, signingSecret } = generateWebhookSecrets();
  const { data, error } = await supabase
    .from("webhooks")
    .insert({
      agent_id: input.agentId,
      name: input.name.trim().slice(0, 60) || "Webhook",
      token_hash: hash,
      token_ciphertext: encrypt(token),
      signing_secret_ciphertext: encrypt(signingSecret),
      forward_url: forward.value,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) return { error: "Couldn't create the webhook for that agent." };
  await track(supabase, "webhook_created", { forward: Boolean(forward.value) });
  return { row: toRow(data as unknown as Raw, await baseUrl()), signingSecret };
}

export async function updateWebhook(id: string, patch: { name?: string; enabled?: boolean; forwardUrl?: string | null }) {
  const { supabase } = await getUser();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 60) || "Webhook";
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.forwardUrl !== undefined) {
    const forward = await forwardOrError(patch.forwardUrl);
    if ("error" in forward) return { error: forward.error };
    update.forward_url = forward.value;
  }
  const { data, error } = await supabase.from("webhooks").update(update).eq("id", id).select(COLUMNS).single();
  if (error || !data) return { error: "Couldn't update the webhook." };
  return { row: toRow(data as unknown as Raw, await baseUrl()) };
}

/** Issues a new URL; the old one stops working immediately. */
export async function rotateWebhookUrl(id: string) {
  const { supabase } = await getUser();
  const { token, hash } = generateWebhookSecrets();
  const { data, error } = await supabase
    .from("webhooks")
    .update({ token_hash: hash, token_ciphertext: encrypt(token) })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error || !data) return { error: "Couldn't rotate the URL." };
  return { row: toRow(data as unknown as Raw, await baseUrl()) };
}

export async function revealSigningSecret(id: string) {
  const { supabase } = await getUser();
  const { data } = await supabase.from("webhooks").select("signing_secret_ciphertext").eq("id", id).single();
  const secret = decrypt(data?.signing_secret_ciphertext);
  return secret ? { secret } : { error: "Couldn't read the signing secret." };
}

export async function deleteWebhook(id: string) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("webhooks").delete().eq("id", id);
  return error ? { error: "Couldn't delete the webhook." } : { ok: true as const };
}

export async function listWebhookCalls(webhookId: string): Promise<WebhookCall[]> {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("webhook_calls")
    .select("id, status, input, output, error, latency_ms, forward_status, created_at")
    .eq("webhook_id", webhookId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as WebhookCall[];
}
