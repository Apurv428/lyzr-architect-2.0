"use server";

import type { AgentGraph, AgentRecord } from "@/lib/agent/types";
import { getUser } from "@/lib/supabase/server";

const COLUMNS = "id, project_id, name, framework, model, graph, updated_at";

export async function createAgent(projectId: string, name: string, graph: AgentGraph, framework?: string | null) {
  const { supabase } = await getUser();
  const { data, error } = await supabase
    .from("agents")
    .insert({ project_id: projectId, name, graph, framework: framework ?? "lyzr-adk" })
    .select(COLUMNS)
    .single();
  return error || !data ? { error: error?.message ?? "Could not create agent" } : { agent: data as AgentRecord };
}

export async function saveAgent(id: string, patch: Partial<Pick<AgentRecord, "name" | "framework" | "model" | "graph">>) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("agents").update(patch).eq("id", id);
  return error ? { error: error.message } : { ok: true };
}
