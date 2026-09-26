"use server";

import { generateApiKey } from "@/lib/api-keys";
import { getUser } from "@/lib/supabase/server";

export type ApiKeyRow = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null };

const COLUMNS = "id, name, prefix, created_at, last_used_at";
const MAX_KEYS = 5;

export async function listApiKeys(agentId: string): Promise<ApiKeyRow[]> {
  const { supabase } = await getUser();
  const { data } = await supabase.from("api_keys").select(COLUMNS).eq("agent_id", agentId).is("revoked_at", null).order("created_at");
  return data ?? [];
}

/** Creates a key and returns it in full — the only time it is ever available. */
export async function createApiKey(agentId: string, name: string) {
  const { supabase } = await getUser();
  const { count } = await supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("agent_id", agentId).is("revoked_at", null);
  if ((count ?? 0) >= MAX_KEYS) return { error: `An agent can have up to ${MAX_KEYS} active keys — revoke one first.` };

  const { key, prefix, hash } = generateApiKey();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({ agent_id: agentId, name: name.trim().slice(0, 60) || "Default key", prefix, key_hash: hash })
    .select(COLUMNS)
    .single();
  if (error || !data) return { error: "Couldn't create a key for this agent." };
  return { key, row: data as ApiKeyRow };
}

export async function revokeApiKey(id: string) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  return error ? { error: "Couldn't revoke the key." } : { ok: true as const };
}
