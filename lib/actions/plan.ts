"use server";

import { track } from "@/lib/analytics";
import { PlanSchema, type ChatMessage, type Plan } from "@/lib/ai/schema";
import { getUser } from "@/lib/supabase/server";

/** Saves the user's edits to the latest, not-yet-built plan. */
export async function updatePlan(projectId: string, messageId: string, input: Plan) {
  const cleaned: Plan = {
    ...input,
    screens: input.screens.filter((s) => s.name.trim()),
    data: input.data.filter((d) => d.entity.trim()).map((d) => ({ ...d, fields: d.fields.map((f) => f.trim()).filter(Boolean) })),
    agent: { ...input.agent, steps: input.agent.steps.filter((s) => s.trim()), tools: input.agent.tools.filter((t) => t.trim()) },
    rules: input.rules.filter((r) => r.trim()),
    integrations: input.integrations.filter((i) => i.trim()),
    assumptions: input.assumptions.filter((a) => a.trim()),
    edited: true,
  };
  const parsed = PlanSchema.safeParse(cleaned);
  if (!parsed.success) return { error: "A plan needs a summary, at least one screen and at least one agent step." };

  const { supabase } = await getUser();
  const { data: messages } = await supabase
    .from("messages")
    .select("id, kind, role, data, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  const list = (messages ?? []) as ChatMessage[];
  const index = list.findIndex((m) => m.id === messageId);
  if (index < 0 || list[index].kind !== "plan") return { error: "Plan not found." };

  const later = list.slice(index + 1);
  if (later.some((m) => m.kind === "plan")) return { error: "A newer plan replaced this one." };
  if (later.some((m) => m.kind === "changes" || (m.role === "user" && (m.data as { approved?: boolean } | null)?.approved))) {
    return { error: "This plan was already approved — ask for changes in the chat instead." };
  }

  const { error } = await supabase.from("messages").update({ data: parsed.data, content: parsed.data.summary }).eq("id", messageId);
  if (error) return { error: error.message };
  await track(supabase, "plan_edited", {}, projectId);
  return { plan: parsed.data };
}
