import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { HAS_ANTHROPIC, HAS_OPENAI, type Provider } from "./provider";

export type UserAI = {
  anthropicKey: string | null;
  openaiKey: string | null;
  preference: "anthropic" | "openai" | null;
};

export async function userAI(supabase: SupabaseClient, userId: string): Promise<UserAI> {
  const [{ data: secrets }, { data: profile }] = await Promise.all([
    supabase.from("user_secrets").select("anthropic_key, openai_key").eq("owner_id", userId).maybeSingle(),
    supabase.from("profiles").select("model_provider").eq("id", userId).single(),
  ]);
  return {
    anthropicKey: decrypt(secrets?.anthropic_key),
    openaiKey: decrypt(secrets?.openai_key),
    preference: (profile?.model_provider as UserAI["preference"]) ?? null,
  };
}

export type ResolvedProvider = {
  provider: Provider;
  /** The user's own key when one is used; otherwise undefined and the server key applies. */
  apiKey?: string;
  /** Bring-your-own-key calls don't spend platform credits. */
  byok: boolean;
};

function pick(provider: "anthropic" | "openai", ai: UserAI): ResolvedProvider | null {
  const own = provider === "anthropic" ? ai.anthropicKey : ai.openaiKey;
  if (own) return { provider, apiKey: own, byok: true };
  if (provider === "anthropic" ? HAS_ANTHROPIC : HAS_OPENAI) return { provider, byok: false };
  return null;
}

/**
 * Choose who runs a request. Order: the provider asked for (a model choice or the user's
 * preference), then the env AI_PROVIDER, then whatever has a key — user keys before server keys.
 */
export function resolveProvider(ai: UserAI, wanted?: "anthropic" | "openai" | null): ResolvedProvider {
  const envPref = process.env.AI_PROVIDER === "openai" || process.env.AI_PROVIDER === "anthropic" ? process.env.AI_PROVIDER : null;
  for (const p of [wanted, ai.preference, envPref, "anthropic", "openai"] as const) {
    if (!p) continue;
    const hit = pick(p, ai);
    if (hit) return hit;
  }
  return { provider: "demo", byok: false };
}
