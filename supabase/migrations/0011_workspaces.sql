-- Team workspaces, member roles, and preview comments.
-- Membership checks go through security-definer helpers: a policy on workspace_members that
-- queried workspace_members directly would recurse forever, and so would any policy that reads it.

create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  plan       text not null default 'free',
  sso_domain text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'editor'
    check (role in ('owner', 'admin', 'editor', 'viewer')),
  invited_by   uuid references auth.users (id),
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Projects can belong to a workspace (null = personal).
alter table public.projects
  add column if not exists workspace_id uuid references public.workspaces (id) on delete set null;

create index if not exists projects_workspace_idx on public.projects (workspace_id);

-- The caller's role in a workspace, or null if they aren't a member.
create or replace function public.workspace_role(p_workspace uuid)
returns text
language sql
stable
security definer set search_path = ''
as $$
  select role from public.workspace_members where workspace_id = p_workspace and user_id = auth.uid();
$$;

-- The project's owner, or any member of the workspace it belongs to.
create or replace function public.can_access_project(p_project uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project
      and (p.owner_id = auth.uid() or (p.workspace_id is not null and public.workspace_role(p.workspace_id) is not null))
  );
$$;

-- Whoever creates a workspace becomes its owner.
create or replace function public.add_workspace_owner()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists workspaces_add_owner on public.workspaces;
create trigger workspaces_add_owner after insert on public.workspaces
  for each row execute function public.add_workspace_owner();

alter table public.workspaces enable row level security;
drop policy if exists "workspace: member read" on public.workspaces;
create policy "workspace: member read" on public.workspaces for select
  using (created_by = auth.uid() or public.workspace_role(id) is not null);
drop policy if exists "workspace: create" on public.workspaces;
create policy "workspace: create" on public.workspaces for insert
  with check (created_by = auth.uid());
drop policy if exists "workspace: owner update" on public.workspaces;
create policy "workspace: owner update" on public.workspaces for update
  using (public.workspace_role(id) = 'owner');

alter table public.workspace_members enable row level security;
drop policy if exists "workspace_members: member read" on public.workspace_members;
create policy "workspace_members: member read" on public.workspace_members for select
  using (public.workspace_role(workspace_id) is not null);
drop policy if exists "workspace_members: admin write" on public.workspace_members;
create policy "workspace_members: admin write" on public.workspace_members for all
  using (public.workspace_role(workspace_id) in ('owner', 'admin'))
  with check (public.workspace_role(workspace_id) in ('owner', 'admin'));

-- ──────────────────────────────────────────────────────
-- Preview comments: pins on the live preview at (x%, y%).
create table if not exists public.preview_comments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  checkpoint_v  int  not null default 1,
  author_id     uuid not null references auth.users (id),
  x_pct         float not null check (x_pct between 0 and 1),
  y_pct         float not null check (y_pct between 0 and 1),
  body          text not null,
  resolved      bool not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists preview_comments_project_idx
  on public.preview_comments (project_id, resolved, created_at desc);

alter table public.preview_comments enable row level security;

-- Project owner and workspace members can read and resolve comments; you can only post as yourself.
drop policy if exists "preview_comments: access" on public.preview_comments;
create policy "preview_comments: access" on public.preview_comments for all
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id) and author_id = auth.uid());

-- ──────────────────────────────────────────────────────
-- Pending invites sent by email before the invitee signs up.
create table if not exists public.workspace_invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  email         text not null,
  role          text not null default 'editor'
    check (role in ('admin', 'editor', 'viewer')),
  invited_by    uuid not null references auth.users (id),
  token         text unique not null default encode(gen_random_bytes(24), 'hex'),
  expires_at    timestamptz not null default now() + interval '7 days',
  created_at    timestamptz not null default now(),
  unique (workspace_id, email)
);

alter table public.workspace_invites enable row level security;
-- Invites carry the secret link token, so only the people who manage the workspace can read them.
drop policy if exists "workspace_invites: member read" on public.workspace_invites;
create policy "workspace_invites: member read" on public.workspace_invites for select
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));
drop policy if exists "workspace_invites: admin write" on public.workspace_invites;
create policy "workspace_invites: admin write" on public.workspace_invites for all
  using (public.workspace_role(workspace_id) in ('owner', 'admin'))
  with check (public.workspace_role(workspace_id) in ('owner', 'admin'));

-- ──────────────────────────────────────────────────────
-- Sharing: a project can be shared with a workspace the owner belongs to. Members can open it
-- read-only (the project row and its checkpoints) and comment on the preview; only the owner edits.
drop policy if exists "workspace members read" on public.projects;
create policy "workspace members read" on public.projects for select
  using (workspace_id is not null and public.workspace_role(workspace_id) is not null);

drop policy if exists "workspace members read" on public.checkpoints;
create policy "workspace members read" on public.checkpoints for select
  using (public.can_access_project(project_id));

-- Only share into a workspace you're in (otherwise an owner could push a project into a stranger's workspace).
create or replace function public.check_project_workspace()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.workspace_id is not null
     and (tg_op = 'INSERT' or new.workspace_id is distinct from old.workspace_id)
     and coalesce(public.workspace_role(new.workspace_id), 'viewer') = 'viewer' then
    raise exception 'You can only share projects into a workspace where you are an owner, admin or editor.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_check_workspace on public.projects;
create trigger projects_check_workspace before insert or update of workspace_id on public.projects
  for each row execute function public.check_project_workspace();

-- Members with their names and emails. Profiles are private to their owner, so this runs as definer
-- and only answers for a workspace the caller belongs to.
create or replace function public.workspace_member_list(p_workspace uuid)
returns table (user_id uuid, role text, joined_at timestamptz, full_name text, email text)
language sql
stable
security definer set search_path = ''
as $$
  select m.user_id, m.role, m.joined_at, p.full_name, u.email::text
  from public.workspace_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.workspace_id = p_workspace
    and public.workspace_role(p_workspace) is not null
  order by m.joined_at;
$$;

-- Accepting an invite link. The link only works for the invited email, and for the workspace's
-- SSO domain when one is set.
create or replace function public.accept_workspace_invite(p_token text)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  inv public.workspace_invites;
  ws public.workspaces;
  me text;
begin
  if auth.uid() is null then
    return jsonb_build_object('status', 'signed_out');
  end if;
  select * into inv from public.workspace_invites where token = p_token;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if inv.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;
  select * into ws from public.workspaces where id = inv.workspace_id;
  select lower(email) into me from auth.users where id = auth.uid();
  if me is distinct from lower(inv.email) then
    return jsonb_build_object('status', 'wrong_email', 'email', inv.email);
  end if;
  if ws.sso_domain is not null and split_part(me, '@', 2) <> lower(ws.sso_domain) then
    return jsonb_build_object('status', 'domain', 'domain', ws.sso_domain);
  end if;
  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (inv.workspace_id, auth.uid(), inv.role, inv.invited_by)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  delete from public.workspace_invites where id = inv.id;
  return jsonb_build_object('status', 'ok', 'workspace_id', ws.id, 'workspace', ws.name);
end;
$$;

revoke execute on function public.workspace_member_list(uuid) from public, anon;
revoke execute on function public.accept_workspace_invite(text) from public, anon;
grant execute on function public.workspace_member_list(uuid) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
