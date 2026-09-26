-- Team workspaces, member roles, and preview comments.

create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  plan       text not null default 'free',
  sso_domain text,
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

-- Members can read their workspace; only members can see it.
create policy "workspace: member read" on public.workspaces for select
  using (
    id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );
-- Owners can update workspace metadata.
create policy "workspace: owner update" on public.workspaces for update
  using (
    id in (select workspace_id from public.workspace_members where user_id = auth.uid() and role = 'owner')
  );

-- ──────────────────────────────────────────────────────
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'editor'
    check (role in ('owner', 'admin', 'editor', 'viewer')),
  invited_by   uuid references auth.users (id),
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_members enable row level security;

-- Members can read the member list of workspaces they belong to.
create policy "workspace_members: member read" on public.workspace_members for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
-- Admins and owners can manage members.
create policy "workspace_members: admin write" on public.workspace_members for all
  using (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
  with check (
    workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ──────────────────────────────────────────────────────
-- Projects can belong to a workspace (null = personal).
alter table public.projects
  add column if not exists workspace_id uuid references public.workspaces (id) on delete set null;

create index if not exists projects_workspace_idx on public.projects (workspace_id);

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

-- Project owner and workspace members can read/write comments.
create policy "preview_comments: access" on public.preview_comments for all
  using (
    project_id in (
      select id from public.projects p
      where p.owner_id = auth.uid()
        or p.workspace_id in (
              select workspace_id from public.workspace_members
              where user_id = auth.uid()
            )
    )
  )
  with check (
    project_id in (
      select id from public.projects p
      where p.owner_id = auth.uid()
        or p.workspace_id in (
              select workspace_id from public.workspace_members
              where user_id = auth.uid()
            )
    )
  );

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
create policy "workspace_invites: member read" on public.workspace_invites for select
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid()));
create policy "workspace_invites: admin write" on public.workspace_invites for all
  using (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid() and role in ('owner', 'admin')))
  with check (workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid() and role in ('owner', 'admin')));
