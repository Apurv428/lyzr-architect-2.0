"use server";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { openaiClient } from "@/lib/ai/provider";
import { encrypt } from "@/lib/crypto";
import { getUser } from "@/lib/supabase/server";
import type { Mode } from "@/lib/types";

export async function updateProfile(input: { fullName: string; avatarUrl: string }) {
  const { supabase, user } = await getUser();
  const avatar = input.avatarUrl.trim();
  if (avatar && !/^https:\/\/\S+$/.test(avatar)) return { error: "Avatar must be an https:// image URL." };
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: input.fullName.trim().slice(0, 80) || null, avatar_url: avatar || null })
    .eq("id", user!.id);
  revalidatePath("/", "layout");
  return error ? { error: error.message } : { ok: true };
}

export async function updatePreferences(input: { defaultMode?: Mode; experienceLevel?: number; modelProvider?: "anthropic" | "openai" | null }) {
  const { supabase, user } = await getUser();
  const patch: Record<string, unknown> = {};
  if (input.defaultMode === "guided" || input.defaultMode === "pro") patch.default_mode = input.defaultMode;
  if (typeof input.experienceLevel === "number") patch.experience_level = Math.max(0, Math.min(100, Math.round(input.experienceLevel)));
  if (input.modelProvider !== undefined) patch.model_provider = input.modelProvider;
  const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
  return error ? { error: error.message } : { ok: true };
}

const mask = (key: string) => `${key.slice(0, 7)}…${key.slice(-4)}`;

/** Verifies the key with a cheap model-list call, then stores it encrypted. Pass null to remove. */
export async function saveModelKey(provider: "anthropic" | "openai", key: string | null) {
  const { supabase, user } = await getUser();
  const column = provider === "anthropic" ? "anthropic_key" : "openai_key";

  if (key === null) {
    const { error } = await supabase.from("user_secrets").upsert({ owner_id: user!.id, [column]: null, updated_at: new Date().toISOString() });
    return error ? { error: error.message } : { masked: null };
  }

  const value = key.trim();
  const looksRight = provider === "anthropic" ? /^sk-ant-[\w-]{20,}$/.test(value) : /^sk-[\w-]{20,}$/.test(value);
  if (!looksRight) return { error: `That doesn't look like ${provider === "anthropic" ? "an Anthropic" : "an OpenAI"} API key.` };

  try {
    if (provider === "anthropic") await new Anthropic({ apiKey: value }).models.list({ limit: 1 });
    else await openaiClient(value).models.list();
  } catch (err) {
    const status = err instanceof Anthropic.APIError || err instanceof OpenAI.APIError ? err.status : undefined;
    return { error: status === 401 ? "The provider rejected that key." : "Couldn't verify the key right now — try again." };
  }

  const { error } = await supabase
    .from("user_secrets")
    .upsert({ owner_id: user!.id, [column]: encrypt(value), updated_at: new Date().toISOString() });
  return error ? { error: error.message } : { masked: mask(value) };
}

export async function deleteAllProjects(confirmation: string) {
  if (confirmation !== "delete my projects") return { error: "Type the confirmation phrase exactly." };
  const { supabase, user } = await getUser();
  const { error, count } = await supabase.from("projects").delete({ count: "exact" }).eq("owner_id", user!.id);
  revalidatePath("/", "layout");
  return error ? { error: error.message } : { deleted: count ?? 0 };
}
