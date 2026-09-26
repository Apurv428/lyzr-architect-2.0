-- Enhancement foundations: product events, admin metrics, user preferences & BYO keys,
-- and the "questions" message kind used by Guided mode.

-- ───────────── message kinds ─────────────
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'plan', 'progress', 'changes', 'error', 'checkpoint', 'questions'));

-- ───────────── profile preferences ─────────────
alter table public.profiles
  add column if not exists tour_completed boolean not null default false,
  add column if not exists model_provider text check (model_provider in ('anthropic', 'openai'));
grant update (tour_completed, model_provider) on public.profiles to authenticated;

-- ───────────── bring-your-own model keys (AES-256-GCM ciphertext from the app) ─────────────
create table if not exists public.user_secrets (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  anthropic_key text,
  openai_key text,
  updated_at timestamptz not null default now()
);
alter table public.user_secrets enable row level security;
create policy "owner all" on public.user_secrets for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ───────────── product events ─────────────
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_name_time_idx on public.events (name, created_at);
create index if not exists events_user_idx on public.events (user_id, created_at);
alter table public.events enable row level security;
create policy "insert own events" on public.events for insert with check (user_id = auth.uid());
create policy "read own events" on public.events for select using (user_id = auth.uid());

-- Record sign-ups from the existing new-user trigger (covers email and OAuth).
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
  insert into public.events (user_id, name, props)
  values (new.id, 'signed_up', jsonb_build_object('provider', new.raw_app_meta_data ->> 'provider'));
  return new;
end;
$$;

-- ───────────── admin metrics ─────────────
-- Add yourself with: insert into public.admins select id from auth.users where email = 'you@example.com';
create table if not exists public.admins (user_id uuid primary key references auth.users (id) on delete cascade);
alter table public.admins enable row level security;
create policy "admins read self" on public.admins for select using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

create or replace function public.metrics_summary()
returns jsonb
language plpgsql stable
security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  with first_build as (
    select user_id, min(created_at) as at from public.events where name = 'build_succeeded' group by user_id
  ),
  first_deploy as (
    select user_id, min(created_at) as at from public.events where name = 'deployed' group by user_id
  ),
  weeks as (
    select generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as week
  )
  select jsonb_build_object(
    'funnel', jsonb_build_object(
      'signed_up', (select count(*) from public.profiles),
      'onboarded', (select count(*) from public.profiles where onboarded),
      'first_build', (select count(*) from first_build),
      'build_under_5m', (select count(*) from first_build fb join public.profiles p on p.id = fb.user_id
                         where fb.at - p.created_at <= interval '5 minutes'),
      'deployed', (select count(*) from first_deploy)
    ),
    'plans', jsonb_build_object(
      'proposed', (select count(*) from public.events where name = 'plan_proposed'),
      'approved', (select count(*) from public.events where name = 'plan_approved'),
      'edited', (select count(*) from public.events where name = 'plan_edited')
    ),
    'quality', jsonb_build_object(
      'builds', (select count(*) from public.events where name = 'build_succeeded'),
      'restores', (select count(*) from public.events where name = 'restore'),
      'autofix', (select count(*) from public.events where name = 'autofix_clicked'),
      'projects_built', (select count(distinct project_id) from public.events where name = 'build_succeeded')
    ),
    'modes', jsonb_build_object(
      'to_pro', (select count(*) from public.events where name = 'mode_switched' and props ->> 'to' = 'pro'),
      'to_guided', (select count(*) from public.events where name = 'mode_switched' and props ->> 'to' = 'guided'),
      'guided_projects', (select count(*) from public.projects where mode = 'guided'),
      'pro_projects', (select count(*) from public.projects where mode = 'pro')
    ),
    'sources', (select coalesce(jsonb_object_agg(src, n), '{}'::jsonb) from (
      select props ->> 'source' as src, count(*) as n from public.events where name = 'project_created' group by 1
    ) s),
    'north_star', (select jsonb_agg(jsonb_build_object('week', to_char(w.week, 'YYYY-MM-DD'), 'apps',
      (select count(distinct d.project_id) from public.deployments d
        where d.status = 'ready' and d.created_at >= w.week and d.created_at < w.week + interval '1 week')) order by w.week)
      from weeks w)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.metrics_summary() from public, anon;
grant execute on function public.metrics_summary() to authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
