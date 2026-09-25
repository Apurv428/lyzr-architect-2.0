import type { SupabaseClient } from "@supabase/supabase-js";

export const DAILY_CREDITS = 100;
export const OUT_OF_CREDITS = `You've used today's ${DAILY_CREDITS} credits — they refill at midnight UTC.`;

/** Current balance, refilling it first if a new day has started. */
export async function currentCredits(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("current_credits");
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/** Deduct one credit atomically and return the new balance. */
export async function spendCredit(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("spend_credit");
  if (error) throw error;
  return (data as number | null) ?? 0;
}
