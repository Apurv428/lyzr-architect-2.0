"use server";

import { z } from "zod";
import { parseDesignTokens, type DesignTokens } from "@/lib/design-tokens";
import { getUser } from "@/lib/supabase/server";
import { validateForwardUrl } from "@/lib/webhooks";

const SETUP_MESSAGE = "Design systems aren't set up on this server yet: run supabase/migrations/0016_design_system.sql.";
// PostgREST reports a missing column as PGRST204 (write) or 42703 (read).
const missingColumn = (code?: string) => code === "PGRST204" || code === "42703";

const Tokens = z.object({
  source: z.string().max(120),
  colors: z.array(z.object({ name: z.string().max(60), value: z.string().max(80) })).max(16),
  fonts: z.array(z.string().max(60)).max(3),
  radius: z.string().max(20).nullable(),
  importedAt: z.string().max(40),
});

export async function getDesignTokens(): Promise<{ tokens: DesignTokens | null; setupNeeded: boolean }> {
  const { supabase, user } = await getUser();
  if (!user) return { tokens: null, setupNeeded: false };
  const { data, error } = await supabase.from("profiles").select("design_tokens").eq("id", user.id).single();
  if (error) return { tokens: null, setupNeeded: missingColumn(error.code) };
  const parsed = Tokens.safeParse(data?.design_tokens);
  return { tokens: parsed.success ? parsed.data : null, setupNeeded: false };
}

/** Saves (or clears, with null) the user's design tokens. */
export async function saveDesignTokens(tokens: DesignTokens | null) {
  const parsed = tokens === null ? { success: true as const, data: null } : Tokens.safeParse(tokens);
  if (!parsed.success) return { error: "Those tokens couldn't be saved." };
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("profiles").update({ design_tokens: parsed.data }).eq("id", user.id);
  if (error) return { error: missingColumn(error.code) ? SETUP_MESSAGE : error.message };
  return { ok: true as const };
}

/** Reads tokens from a public https URL (a CSS file or token JSON). Doesn't save them. */
export async function fetchDesignTokens(rawUrl: string): Promise<{ tokens: DesignTokens } | { error: string }> {
  const checked = await validateForwardUrl(rawUrl.trim());
  if (!checked.ok) return { error: checked.reason.replace("Forward URLs", "Token URLs") };
  try {
    const res = await fetch(checked.url, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { Accept: "text/css, application/json, text/plain" } });
    if (!res.ok) return { error: `That URL answered ${res.status}.` };
    const text = (await res.text()).slice(0, 200_000);
    return { tokens: parseDesignTokens(text, new URL(checked.url).hostname + new URL(checked.url).pathname) };
  } catch (err) {
    return { error: err instanceof Error && !/fetch failed/.test(err.message) ? err.message : "Couldn't download that URL." };
  }
}
