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

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

/**
 * Renames the project's public link (/s/<slug>). Every deployment of the project moves with it;
 * the old link stops working. Slugs are unique across all projects.
 */
export async function renameDeploymentSlug(projectId: string, input: string) {
  const slug = input.trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug.includes("--")) {
    return { error: "Use 3–48 lowercase letters, numbers and single hyphens, starting and ending with a letter or number." };
  }
  const { supabase } = await getUser();
  const { data: project } = await supabase.from("projects").select("slug, deploy_url").eq("id", projectId).single();
  if (!project) return { error: "Project not found." };
  if (project.slug === slug) return { slug };

  const deployUrl = (project.deploy_url as string | null)?.replace(/\/s\/[^/?#]+/, `/s/${slug}`) ?? null;
  const { error } = await supabase.from("projects").update({ slug, deploy_url: deployUrl }).eq("id", projectId);
  if (error) return { error: error.code === "23505" ? "That link is taken. Try another." : error.message };
  const { error: moveError } = await supabase.from("deployments").update({ slug }).eq("project_id", projectId);
  if (moveError) {
    await supabase.from("projects").update({ slug: project.slug, deploy_url: project.deploy_url }).eq("id", projectId);
    return { error: moveError.message };
  }
  return { slug };
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
