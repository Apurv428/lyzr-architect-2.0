-- Architect 2.0 — initial schema
-- Every table is owner-scoped with RLS.

create extension if not exists "pgcrypto";

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  role text,                                   -- founder | ops | designer | developer | data
  experience_level int not null default 50,    -- 0 = no code … 100 = full control
  default_mode text not null default 'guided' check (default_mode in ('guided', 'pro')),
  onboarded boolean not null default false,
  credits int not null default 100,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── projects ─────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  description text,
  prompt text,
  mode text not null default 'guided' check (mode in ('guided', 'pro')),
  template_id text,
  framework text,
  github_repo text,
  github_branch text,
  status text not null default 'draft'
    check (status in ('draft', 'planning', 'building', 'ready', 'deployed', 'error')),
  thumbnail_url text,
  deploy_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects (owner_id, updated_at desc);

-- ───────────────────────── messages ─────────────────────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  kind text not null default 'text'
    check (kind in ('text', 'plan', 'progress', 'changes', 'error', 'checkpoint')),
  content text,
  data jsonb,
  created_at timestamptz not null default now()
);
create index messages_project_idx on public.messages (project_id, created_at);

-- ──────────────────────── checkpoints ───────────────────────
create table public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  label text not null,
  files jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index checkpoints_project_idx on public.checkpoints (project_id, created_at desc);

-- ────────────────────────── agents ──────────────────────────
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  name text not null,
  framework text not null default 'lyzr-adk',
  model text not null default 'claude-sonnet-5',
  system_prompt text,
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  tools jsonb not null default '[]'::jsonb,
  memory jsonb not null default '{}'::jsonb,
  guardrails jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  input text,
  output text,
  trace jsonb,
  tokens int,
  latency_ms int,
  created_at timestamptz not null default now()
);

-- ──────────────────────── deployments ───────────────────────
create table public.deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  env text not null default 'production' check (env in ('preview', 'production')),
  status text not null default 'queued'
    check (status in ('queued', 'building', 'ready', 'failed', 'rolled_back')),
  url text,
  logs jsonb not null default '[]'::jsonb,
  commit_sha text,
  created_at timestamptz not null default now()
);

create table public.env_vars (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value text not null,
  env text not null default 'production',
  unique (project_id, key, env)
);

-- ─────────────────────────── RLS ────────────────────────────
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['projects','messages','checkpoints','agents','agent_runs','deployments','env_vars']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner all" on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger agents_touch before update on public.agents
  for each row execute function public.touch_updated_at();
