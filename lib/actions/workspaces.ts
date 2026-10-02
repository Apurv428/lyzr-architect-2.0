"use server";

import { getUser } from "@/lib/supabase/server";

// PostgREST: missing table (PGRST205) or relation (42P01) means migration 0011 hasn't been run.
const notSetUp = (code?: string) => code === "PGRST205" || code === "42P01";
const COMMENTS_SETUP = "Comments need the database update in supabase/migrations/0011_workspaces.sql.";
const TEAMS_SETUP = "Team workspaces need the database update in supabase/migrations/0011_workspaces.sql.";

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  sso_domain: string | null;
  created_at: string;
};

export type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
  profile: { full_name: string | null; avatar_url: string | null; email: string | null } | null;
};

export type WorkspaceInvite = {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  /** The secret in the invite link; only the workspace's owners and admins can read invites. */
  token: string;
  expires_at: string;
  created_at: string;
};

/** Generate a URL-safe slug from a name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace";
}

export async function createWorkspace(name: string) {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated." };
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return { error: "Name is required." };

  // Make slug unique by appending a short suffix on conflict.
  let slug = slugify(trimmed);
  const { count } = await supabase
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .like("slug", `${slug}%`);
  if (count) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const { data: ws, error } = await supabase
    .from("workspaces")
    .insert({ name: trimmed, slug })
    .select("id, name, slug, plan, sso_domain, created_at")
    .single();
  // The database adds the creator as owner (trigger in 0011_workspaces.sql).
  if (error || !ws) return { error: notSetUp(error?.code) ? TEAMS_SETUP : "Couldn't create workspace." };
  return { workspace: ws as Workspace };
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return (await loadWorkspaces()).workspaces;
}

/** The user's workspaces, plus whether the server still needs migration 0011. */
export async function loadWorkspaces(): Promise<{ workspaces: Workspace[]; setupNeeded: boolean }> {
  const { supabase, user } = await getUser();
  if (!user) return { workspaces: [], setupNeeded: false };
  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, slug, plan, sso_domain, created_at")
    .order("created_at");
  return { workspaces: (data ?? []) as Workspace[], setupNeeded: notSetUp(error?.code) };
}

/** Shares a project with a workspace (or stops sharing, with null). Members can view it and comment. */
export async function setProjectWorkspace(projectId: string, workspaceId: string | null) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("projects").update({ workspace_id: workspaceId }).eq("id", projectId);
  if (!error) return { ok: true as const };
  if (notSetUp(error.code) || error.code === "PGRST204") return { error: TEAMS_SETUP };
  return { error: error.code === "42501" ? "You can only share into a workspace where you're an owner, admin or editor." : error.message };
}

export async function getWorkspace(idOrSlug: string) {
  const { supabase } = await getUser();
  const isUuid = /^[0-9a-f-]{36}$/.test(idOrSlug);
  const q = isUuid
    ? supabase.from("workspaces").select("id, name, slug, plan, sso_domain, created_at").eq("id", idOrSlug)
    : supabase.from("workspaces").select("id, name, slug, plan, sso_domain, created_at").eq("slug", idOrSlug);
  const { data } = await q.single();
  return data as Workspace | null;
}

export async function updateWorkspace(id: string, patch: Partial<Pick<Workspace, "name" | "sso_domain">>) {
  const { supabase } = await getUser();
  const { error } = await supabase
    .from("workspaces")
    .update({ ...(patch.name ? { name: patch.name.trim().slice(0, 80) } : {}), sso_domain: patch.sso_domain ?? null })
    .eq("id", id);
  return error ? { error: error.message } : { ok: true as const };
}

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const { supabase } = await getUser();
  // Teammates' profiles are private, so names and emails come from a members-only database function.
  const { data } = await supabase.rpc("workspace_member_list", { p_workspace: workspaceId });
  return ((data ?? []) as { user_id: string; role: WorkspaceRole; joined_at: string; full_name: string | null; email: string | null }[]).map((m) => ({
    workspace_id: workspaceId,
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    profile: { full_name: m.full_name, avatar_url: null, email: m.email },
  }));
}

export async function updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  const { supabase } = await getUser();
  if (role === "owner") return { error: "Ownership is transferred, not assigned." };
  const { error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  return error ? { error: error.message } : { ok: true as const };
}

export async function removeMember(workspaceId: string, userId: string) {
  const { supabase } = await getUser();
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  return error ? { error: error.message } : { ok: true as const };
}

export async function inviteMember(workspaceId: string, email: string, role: Exclude<WorkspaceRole, "owner">) {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated." };
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) return { error: "Enter a valid email address." };

  const { data, error } = await supabase
    .from("workspace_invites")
    .upsert({ workspace_id: workspaceId, email: trimmed, role, invited_by: user.id }, { onConflict: "workspace_id,email" })
    .select("id, token")
    .single();
  if (error || !data) return { error: notSetUp(error?.code) ? TEAMS_SETUP : "Couldn't create the invite." };
  return { invite: data as { id: string; token: string } };
}

export type AcceptResult =
  | { status: "ok"; workspace_id: string; workspace: string }
  | { status: "signed_out" | "not_found" | "expired" }
  | { status: "wrong_email"; email: string }
  | { status: "domain"; domain: string }
  | { status: "error"; message: string };

/** Joins the workspace behind an invite link (checked in the database: right email, SSO domain, not expired). */
export async function acceptInvite(token: string): Promise<AcceptResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "signed_out" };
  const { data, error } = await supabase.rpc("accept_workspace_invite", { p_token: token });
  if (error) return { status: "error", message: notSetUp(error.code) || error.code === "PGRST202" ? TEAMS_SETUP : error.message };
  return data as AcceptResult;
}

export async function listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("workspace_invites")
    .select("id, workspace_id, email, role, token, expires_at, created_at")
    .eq("workspace_id", workspaceId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at");
  return (data ?? []) as WorkspaceInvite[];
}

export async function revokeInvite(id: string) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("workspace_invites").delete().eq("id", id);
  return error ? { error: error.message } : { ok: true as const };
}

// ── Preview comments ──────────────────────────────────────────────────────────

export type PreviewComment = {
  id: string;
  project_id: string;
  checkpoint_v: number;
  author_id: string;
  x_pct: number;
  y_pct: number;
  body: string;
  resolved: boolean;
  created_at: string;
};

export async function listComments(projectId: string): Promise<PreviewComment[]> {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("preview_comments")
    // No join to profiles: comments reference auth.users, so PostgREST has no relationship to follow
    // and the whole query would fail, leaving saved pins invisible after a reload.
    .select("id, project_id, checkpoint_v, author_id, x_pct, y_pct, body, resolved, created_at")
    .eq("project_id", projectId)
    .eq("resolved", false)
    .order("created_at");
  return (data ?? []) as unknown as PreviewComment[];
}

export async function addComment(
  projectId: string,
  { x_pct, y_pct, body, checkpoint_v }: { x_pct: number; y_pct: number; body: string; checkpoint_v: number },
) {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated." };
  const trimmed = body.trim().slice(0, 2000);
  if (!trimmed) return { error: "Comment is empty." };
  const { data, error } = await supabase
    .from("preview_comments")
    .insert({ project_id: projectId, author_id: user.id, x_pct, y_pct, body: trimmed, checkpoint_v })
    .select("id, project_id, checkpoint_v, author_id, x_pct, y_pct, body, resolved, created_at")
    .single();
  if (error || !data) return { error: notSetUp(error?.code) ? COMMENTS_SETUP : "Couldn't save comment." };
  return { comment: data as PreviewComment };
}

export async function resolveComment(id: string) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("preview_comments").update({ resolved: true }).eq("id", id);
  return error ? { error: error.message } : { ok: true as const };
}
