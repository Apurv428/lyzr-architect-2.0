"use server";

import type { Deployment } from "@/lib/deploy";
import { getUser } from "@/lib/supabase/server";

const COLUMNS = "id, env, status, slug, label, is_current, created_at";

export async function listDeployments(projectId: string) {
  const { supabase } = await getUser();
  const [{ data }, { data: project }, { data: runs }] = await Promise.all([
    supabase.from("deployments").select(COLUMNS).eq("project_id", projectId).order("created_at", { ascending: false }).limit(20),
    supabase.from("projects").select("custom_domain").eq("id", projectId).single(),
    supabase
      .from("agent_runs")
      .select("tokens, latency_ms, created_at, source, agent:agents!inner(project_id)")
      .eq("agent.project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  return {
    deployments: (data ?? []) as Deployment[],
    domain: (project?.custom_domain as string | null) ?? null,
    runs: ((runs ?? []) as { tokens: number | null; latency_ms: number | null; created_at: string; source: string }[]).reverse(),
  };
}

// Rollback = point production at an earlier ready deployment. Nothing is deleted.
export async function promoteDeployment(projectId: string, deploymentId: string) {
  const { supabase } = await getUser();
  const { data: target } = await supabase.from("deployments").select("id, status").eq("id", deploymentId).eq("project_id", projectId).single();
  if (!target || target.status !== "ready") return { error: "That deployment can't be promoted." };
  await supabase.from("deployments").update({ is_current: false }).eq("project_id", projectId).eq("env", "production");
  const { error } = await supabase.from("deployments").update({ is_current: true, env: "production" }).eq("id", deploymentId);
  return error ? { error: error.message } : { ok: true };
}
