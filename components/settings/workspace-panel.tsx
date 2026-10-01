"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail, Plus, Shield, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  createWorkspace,
  inviteMember,
  listInvites,
  listMembers,
  loadWorkspaces,
  removeMember,
  revokeInvite,
  updateMemberRole,
  updateWorkspace,
  type Workspace,
  type WorkspaceInvite,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@/lib/actions/workspaces";
import { cn } from "@/lib/utils";

const ROLES: WorkspaceRole[] = ["admin", "editor", "viewer"];
const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function RoleBadge({ role }: { role: WorkspaceRole }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
      role === "owner" && "bg-primary/15 text-primary",
      role === "admin" && "bg-sky-500/15 text-sky-700 dark:text-sky-400",
      role === "editor" && "bg-muted text-muted-foreground",
      role === "viewer" && "bg-muted/50 text-muted-foreground",
    )}>
      {ROLE_LABEL[role]}
    </span>
  );
}

function MemberRow({
  member,
  currentUserId,
  isOwner,
  onRoleChange,
  onRemove,
}: {
  member: WorkspaceMember;
  currentUserId: string;
  isOwner: boolean;
  onRoleChange: (userId: string, role: WorkspaceRole) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}) {
  const isSelf = member.user_id === currentUserId;
  const name = member.profile?.full_name ?? "Unknown";
  const canEdit = isOwner && !isSelf && member.role !== "owner";

  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card/60 px-3 py-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
        {name.slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}{isSelf && <span className="ml-1.5 text-muted-foreground">(you)</span>}</p>
        <p className="truncate text-xs text-muted-foreground">{member.profile?.email ?? ""}</p>
      </div>
      {canEdit ? (
        <select
          value={member.role}
          onChange={(e) => onRoleChange(member.user_id, e.target.value as WorkspaceRole)}
          className="h-7 rounded-md border bg-background px-1.5 text-xs outline-none focus:border-primary"
        >
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      ) : (
        <RoleBadge role={member.role} />
      )}
      {canEdit && (
        <Button size="icon-xs" variant="ghost" aria-label="Remove member" onClick={() => onRemove(member.user_id)}>
          <UserMinus />
        </Button>
      )}
    </li>
  );
}

export function WorkspacePanel({ currentUserId }: { currentUserId: string }) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [selected, setSelected] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<WorkspaceRole, "owner">>("editor");
  const [busy, setBusy] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    loadWorkspaces().then((res) => {
      setWorkspaces(res.workspaces);
      setSetupNeeded(res.setupNeeded);
      setSelected((current) => current ?? res.workspaces[0] ?? null);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    Promise.all([listMembers(selected.id), listInvites(selected.id)]).then(([m, i]) => {
      setMembers(m);
      setInvites(i);
    });
  }, [selected]);

  const isOwner = members.some((m) => m.user_id === currentUserId && (m.role === "owner" || m.role === "admin"));

  async function create() {
    if (!newName.trim() || busy) return;
    setBusy(true);
    const res = await createWorkspace(newName);
    setBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    setWorkspaces((ws) => [...(ws ?? []), res.workspace]);
    setSelected(res.workspace);
    setCreating(false);
    setNewName("");
  }

  async function invite() {
    if (!selected || !inviteEmail.trim() || busy) return;
    setBusy(true);
    const res = await inviteMember(selected.id, inviteEmail, inviteRole);
    setBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    // There's no mail service, so the owner sends the link themselves.
    await copyInviteLink(res.invite.token, inviteEmail.trim());
    setInviteEmail("");
    listInvites(selected.id).then(setInvites);
  }

  async function changeRole(userId: string, role: WorkspaceRole) {
    if (!selected) return;
    const res = await updateMemberRole(selected.id, userId, role);
    if ("error" in res) { toast.error(res.error); return; }
    setMembers((m) => m.map((x) => x.user_id === userId ? { ...x, role } : x));
  }

  async function remove(userId: string) {
    if (!selected) return;
    const res = await removeMember(selected.id, userId);
    if ("error" in res) { toast.error(res.error); return; }
    setMembers((m) => m.filter((x) => x.user_id !== userId));
    toast("Member removed.");
  }

  async function revoke(id: string) {
    const res = await revokeInvite(id);
    if ("error" in res) { toast.error(res.error); return; }
    setInvites((i) => i.filter((x) => x.id !== id));
  }

  if (setupNeeded) {
    return (
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        Team workspaces need the database update in <code>supabase/migrations/0011_workspaces.sql</code>.
      </p>
    );
  }

  if (!workspaces) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading workspaces…</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Invite teammates with a link, then share a project with the workspace from its settings. Members can open shared projects and comment on the
        preview; editing stays with the project owner.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 overflow-x-auto">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => setSelected(w)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
                selected?.id === w.id ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-muted/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {w.name}
            </button>
          ))}
        </div>
        {creating ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="Workspace name"
              className="h-8 rounded-lg border bg-background px-2.5 text-sm outline-none focus:border-primary"
            />
            <Button size="sm" onClick={create} disabled={busy || !newName.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}><X /></Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus /> New workspace</Button>
        )}
      </div>

      {selected && (
        <div className="space-y-5">
          <div>
            <h3 className="mb-3 text-sm font-semibold">Members</h3>
            <ul className="space-y-2">
              {members.map((m) => (
                <MemberRow
                  key={m.user_id}
                  member={m}
                  currentUserId={currentUserId}
                  isOwner={isOwner}
                  onRoleChange={changeRole}
                  onRemove={remove}
                />
              ))}
            </ul>
          </div>

          {isOwner && (
            <div className="space-y-3 rounded-xl border p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><Mail className="size-4" /> Invite a teammate</h4>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && invite()}
                  placeholder="colleague@example.com"
                  className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-sm outline-none focus:border-primary"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Exclude<WorkspaceRole, "owner">)}
                  className="h-8 shrink-0 rounded-lg border bg-background px-1.5 text-sm outline-none focus:border-primary"
                >
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <Button size="sm" onClick={invite} disabled={busy || !inviteEmail.trim()}>
                  {busy ? <Loader2 className="animate-spin" /> : "Create link"}
                </Button>
              </div>

              {invites.length > 0 && (
                <ul className="space-y-1.5">
                  {invites.map((inv) => (
                    <li key={inv.id} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-xs">
                      <Mail className="size-3 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{inv.email}</span>
                      <RoleBadge role={inv.role} />
                      <button onClick={() => copyInviteLink(inv.token, inv.email)} aria-label={`Copy invite link for ${inv.email}`} className="text-muted-foreground hover:text-foreground">
                        <Copy className="size-3.5" />
                      </button>
                      <button onClick={() => revoke(inv.id)} aria-label="Revoke invite" className="text-muted-foreground hover:text-foreground">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {isOwner && (
            <div className="space-y-2 rounded-xl border p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold"><Shield className="size-4" /> SSO domain restriction</h4>
              <p className="text-xs text-muted-foreground">Only users with email on this domain can join. Leave blank to allow any email.</p>
              <SSODomainField workspace={selected} onSave={(ws) => setSelected(ws)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function copyInviteLink(token: string, email: string) {
  const link = `${window.location.origin}/invite/${token}`;
  await navigator.clipboard.writeText(link).catch(() => undefined);
  toast.success(`Invite link copied. Send it to ${email}: it works when they sign in with that email.`, { duration: 7000 });
}

function SSODomainField({ workspace, onSave }: { workspace: Workspace; onSave: (ws: Workspace) => void }) {
  const [value, setValue] = useState(workspace.sso_domain ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await updateWorkspace(workspace.id, { sso_domain: value.trim() || null });
    setSaving(false);
    if ("error" in res) { toast.error(res.error); return; }
    onSave({ ...workspace, sso_domain: value.trim() || null });
    toast.success("SSO domain saved.");
  }

  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="acme.com"
        className="h-8 flex-1 rounded-lg border bg-background px-2.5 text-sm outline-none focus:border-primary"
      />
      <Button size="sm" onClick={save} disabled={saving || value === (workspace.sso_domain ?? "")}>
        {saving ? <Loader2 className="animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}
