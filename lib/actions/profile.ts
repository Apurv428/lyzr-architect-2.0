"use server";

import { redirect } from "next/navigation";
import { track } from "@/lib/analytics";
import { safeNext } from "@/lib/safe-redirect";
import { getUser } from "@/lib/supabase/server";
import { createProject } from "./projects";

export async function completeOnboarding(input: {
  role: string;
  experienceLevel: number;
  templateId?: string;
  prompt?: string;
  next?: string;
}) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  const mode = input.experienceLevel >= 50 ? "pro" : "guided";
  const { error } = await supabase
    .from("profiles")
    .update({
      role: input.role,
      experience_level: input.experienceLevel,
      default_mode: mode,
      onboarded: true,
    })
    .eq("id", user.id);
  if (error) return { error: error.message };
  await track(supabase, "onboarded", { mode, role: input.role });

  if (input.templateId || input.prompt?.trim()) {
    return createProject({ templateId: input.templateId, prompt: input.prompt, mode });
  }
  redirect(safeNext(input.next));
}

export async function setDefaultMode(mode: "guided" | "pro") {
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("profiles").update({ default_mode: mode }).eq("id", user.id);
}

export async function finishTour(input: { completed: boolean; seen: number; total: number; mode: "guided" | "pro" }) {
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("profiles").update({ tour_completed: true }).eq("id", user.id);
  await track(supabase, "tour_finished", { completed: input.completed, seen: input.seen, total: input.total, mode: input.mode });
}

/** "Replay tour" in Settings: the tour plays again the next time a project opens. */
export async function resetTour() {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sign in again." };
  const { error } = await supabase.from("profiles").update({ tour_completed: false }).eq("id", user.id);
  return error ? { error: "Couldn't reset the tour." } : { ok: true as const };
}
