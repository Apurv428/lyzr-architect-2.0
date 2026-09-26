"use server";

import { getUser } from "@/lib/supabase/server";

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
  if (error || !ws) return { error: "Couldn't create workspace." };

  // Add the creator as owner.
  await supabase
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: user.id, role: "owner" });

  return { workspace: ws as Workspace };
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const { supabase, user } = await getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("workspaces")
    .select("id, name, slug, plan, sso_domain, created_at")
    .order("created_at");
  return (data ?? []) as Workspace[];
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
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, user_id, role, joined_at, profile:profiles(full_name, avatar_url)")
    .eq("workspace_id", workspaceId)
    .order("joined_at");
  return (data ?? []) as unknown as WorkspaceMember[];
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
  if (error || !data) return { error: "Couldn't send invite." };
  return { invite: data as { id: string; token: string } };
}

export async function acceptInvite(token: string) {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sign in first." };

  const { data: invite } = await supabase
    .from("workspace_invites")
    .select("workspace_id, role, expires_at")
    .eq("token", token)
    .single();
  if (!invite) return { error: "Invite not found or already used." };
  if (new Date(invite.expires_at) < new Date()) return { error: "This invite has expired." };

  await supabase
    .from("workspace_members")
    .upsert({ workspace_id: invite.workspace_id, user_id: user.id, role: invite.role }, { onConflict: "workspace_id,user_id" });
  await supabase.from("workspace_invites").delete().eq("token", token);
  return { workspaceId: invite.workspace_id };
}

export async function listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("workspace_invites")
    .select("id, workspace_id, email, role, expires_at, created_at")
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
  author: { full_name: string | null; avatar_url: string | null } | null;
};

export async function listComments(projectId: string): Promise<PreviewComment[]> {
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("preview_comments")
    .select("id, project_id, checkpoint_v, author_id, x_pct, y_pct, body, resolved, created_at, author:profiles(full_name, avatar_url)")
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
  if (error || !data) return { error: "Couldn't save comment." };
  return { comment: data as PreviewComment };
}

export async function resolveComment(id: string) {
  const { supabase } = await getUser();
  const { error } = await supabase.from("preview_comments").update({ resolved: true }).eq("id", id);
  return error ? { error: error.message } : { ok: true as const };
}
