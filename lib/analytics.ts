import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EventName =
  | "onboarded"
  | "project_created"
  | "plan_proposed"
  | "plan_approved"
  | "plan_edited"
  | "questions_answered"
  | "build_succeeded"
  | "restore"
  | "autofix_clicked"
  | "mode_switched"
  | "agent_tested"
  | "evals_run"
  | "eval_case_saved"
  | "tour_finished"
  | "deployed"
  | "pr_opened"
  | "project_duplicated"
  | "project_deleted"
  | "webhook_created"
  | "autopilot_generated"
  | "autopilot_fixed";

/** Record a product event. Never throws — analytics must not break the product. */
export async function track(
  supabase: SupabaseClient,
  name: EventName,
  props: Record<string, unknown> = {},
  projectId?: string | null,
) {
  const { error } = await supabase.from("events").insert({ name, props, project_id: projectId ?? null });
  if (error) console.warn(`[track] ${name}:`, error.message);
}
