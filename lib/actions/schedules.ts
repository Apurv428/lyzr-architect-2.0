"use server";

import { z } from "zod";
import { getUser } from "@/lib/supabase/server";

export type Schedule = {
  id: string;
  agent_id: string;
  times: string[];
  days: number[];
  timezone: string;
  input: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
};

export type ScheduleRun = { id: string; status: "running" | "ok" | "error"; output: string | null; error: string | null; created_at: string };

const COLUMNS = "id, agent_id, times, days, timezone, input, enabled, next_run_at, last_run_at, last_status";
const SETUP = "Schedules need the database update in supabase/migrations/0017_schedules.sql.";
const notSetUp = (code?: string) => code === "PGRST205" || code === "42P01";

const Input = z.object({
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times must look like 08:45")).min(1, "Add at least one time.").max(12),
  days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day.").max(7),
  timezone: z.string().min(1).max(64),
  input: z.string().trim().min(1, "Tell the agent what to do on each run.").max(2000),
  enabled: z.boolean(),
});

export async function getSchedule(agentId: string): Promise<{ schedule: Schedule | null; runs: ScheduleRun[]; setupNeeded: boolean }> {
  const { supabase } = await getUser();
  const { data, error } = await supabase.from("agent_schedules").select(COLUMNS).eq("agent_id", agentId).maybeSingle();
  if (error) return { schedule: null, runs: [], setupNeeded: notSetUp(error.code) };
  if (!data) return { schedule: null, runs: [], setupNeeded: false };
  const { data: runs } = await supabase
    .from("schedule_runs")
    .select("id, status, output, error, created_at")
    .eq("schedule_id", data.id)
    .order("created_at", { ascending: false })
    .limit(5);
  return { schedule: data as Schedule, runs: (runs ?? []) as ScheduleRun[], setupNeeded: false };
}

/** Creates or updates the agent's schedule. The database works out the next run. */
export async function saveSchedule(agentId: string, input: z.input<typeof Input>) {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the schedule." };
  const value = { ...parsed.data, times: [...new Set(parsed.data.times)].sort(), days: [...new Set(parsed.data.days)].sort() };
  const { supabase } = await getUser();
  const { data, error } = await supabase
    .from("agent_schedules")
    .upsert({ agent_id: agentId, ...value }, { onConflict: "agent_id" })
    .select(COLUMNS)
    .single();
  if (error) {
    if (notSetUp(error.code)) return { error: SETUP };
    return { error: error.code === "22023" ? error.message : "Couldn't save the schedule." };
  }
  return { schedule: data as Schedule };
}

export async function deleteSchedule(agentId: string) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("agent_schedules").delete().eq("agent_id", agentId);
  return error ? { error: notSetUp(error.code) ? SETUP : error.message } : { ok: true as const };
}
