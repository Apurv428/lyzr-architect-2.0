-- Scheduled agents: an agent whose trigger is "Schedule" runs at set times (e.g. a Slack greeting at
-- 08:45 and 21:00, Monday to Friday, Asia/Kolkata). A cron pings /api/cron/schedules every minute;
-- like the agent API and webhooks, that route needs no service-role key: it calls two
-- security-definer functions guarded by a secret this migration generates.
--
-- After running this migration:
--   1. select secret from private.scheduler_secret;   -- copy it into CRON_SECRET on the server
--   2. Have something call GET /api/cron/schedules every minute with "Authorization: Bearer <CRON_SECRET>"
--      (Supabase pg_cron + pg_net, cron-job.org, or Vercel Cron). See docs/ARCHITECTURE.md.

create schema if not exists private;

create table if not exists private.scheduler_secret (
  id boolean primary key default true check (id),
  secret text not null default encode(gen_random_bytes(24), 'hex')
);
insert into private.scheduler_secret (id) values (true) on conflict (id) do nothing;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.agent_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id uuid not null unique references public.agents (id) on delete cascade,
  times text[] not null check (cardinality(times) between 1 and 12),
  days int[] not null default '{0,1,2,3,4,5,6}',
  timezone text not null default 'UTC',
  input text not null check (length(input) between 1 and 2000),
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);
create index if not exists agent_schedules_due_idx on public.agent_schedules (next_run_at) where enabled;

alter table public.agent_schedules enable row level security;
drop policy if exists "owner all" on public.agent_schedules;
create policy "owner all" on public.agent_schedules for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid()));

create table if not exists public.schedule_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.agent_schedules (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  output text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists schedule_runs_schedule_idx on public.schedule_runs (schedule_id, created_at desc);
alter table public.schedule_runs enable row level security;
drop policy if exists "owner read" on public.schedule_runs;
create policy "owner read" on public.schedule_runs for select using (owner_id = auth.uid());

-- The first moment after `after` that matches one of the times on an allowed weekday, in the timezone.
create or replace function public.schedule_next_run(p_times text[], p_days int[], p_tz text, p_after timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  -- date + time is a local timestamp; "at time zone" then reads it in the schedule's zone. (A
  -- generate_series over dates would go through timestamptz and the session's zone instead.)
  select min(candidate)
  from (
    select ((d.local_day + t.at::time) at time zone p_tz) as candidate
    from generate_series(0, 8) as g(n)
    cross join lateral (select (p_after at time zone p_tz)::date + g.n as local_day) d
    cross join unnest(p_times) as t(at)
    where extract(dow from d.local_day)::int = any (p_days)
  ) c
  where candidate > p_after;
$$;

create or replace function public.set_schedule_next_run()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone %', new.timezone using errcode = '22023';
  end if;
  if exists (select 1 from unnest(new.times) t where t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
    raise exception 'Times must look like 08:45' using errcode = '22023';
  end if;
  new.next_run_at := case when new.enabled then public.schedule_next_run(new.times, new.days, new.timezone, now()) end;
  return new;
end;
$$;

drop trigger if exists agent_schedules_next_run on public.agent_schedules;
create trigger agent_schedules_next_run before insert or update of times, days, timezone, enabled on public.agent_schedules
  for each row execute function public.set_schedule_next_run();

-- Claims every due schedule (advancing it to its next time, so a run never repeats) and returns what
-- the server needs to run each agent. Only callers holding the scheduler secret get anything.
create or replace function public.scheduler_claim(p_secret text)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  s record;
  run_id uuid;
  out jsonb := '[]'::jsonb;
begin
  if p_secret is null or p_secret <> (select secret from private.scheduler_secret) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  for s in
    select sc.*, a.name as agent_name, a.graph as agent_graph, a.project_id
    from public.agent_schedules sc
    join public.agents a on a.id = sc.agent_id
    where sc.enabled and sc.next_run_at <= now()
    order by sc.next_run_at
    limit 20
    for update of sc skip locked
  loop
    update public.agent_schedules
       set next_run_at = public.schedule_next_run(s.times, s.days, s.timezone, now()), last_run_at = now()
     where id = s.id;
    insert into public.schedule_runs (schedule_id, owner_id) values (s.id, s.owner_id) returning id into run_id;
    -- Same daily refill as current_credits(), so a morning run sees today's balance.
    update public.profiles set credits = 100, credits_reset_on = current_date
     where id = s.owner_id and credits_reset_on < current_date;
    out := out || jsonb_build_object(
      'run_id', run_id,
      'schedule_id', s.id,
      'owner_id', s.owner_id,
      'input', s.input,
      'agent', jsonb_build_object('id', s.agent_id, 'name', s.agent_name, 'graph', s.agent_graph, 'project_id', s.project_id),
      'credits', (select credits from public.profiles where id = s.owner_id),
      'provider', (select model_provider from public.profiles where id = s.owner_id),
      'secrets', (select jsonb_build_object('anthropic_key', us.anthropic_key, 'openai_key', us.openai_key) from public.user_secrets us where us.owner_id = s.owner_id),
      'slack_webhook', (select e.value from public.env_vars e where e.project_id = s.project_id and e.key = 'SLACK_WEBHOOK_URL' order by e.env = 'production' desc limit 1),
      'docs', coalesce((select jsonb_agg(jsonb_build_object('name', k.name, 'node_id', k.node_id, 'content', k.content)) from public.knowledge_docs k where k.agent_id = s.agent_id), '[]'::jsonb)
    );
  end loop;
  return jsonb_build_object('status', 'ok', 'runs', out);
end;
$$;

-- Closes a claimed run once: its outcome, the run log, and one credit when the platform's key paid.
create or replace function public.scheduler_finish(
  p_secret text,
  p_run_id uuid,
  p_status text,
  p_output text,
  p_error text,
  p_trace jsonb,
  p_tokens int,
  p_latency_ms int,
  p_charge boolean,
  p_provider text
)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  r public.schedule_runs;
  s public.agent_schedules;
  balance int;
begin
  if p_secret is null or p_secret <> (select secret from private.scheduler_secret) then
    return null;
  end if;
  update public.schedule_runs
     set status = case when p_status = 'ok' then 'ok' else 'error' end,
         output = left(p_output, 4000), error = left(p_error, 500), finished_at = now()
   where id = p_run_id and status = 'running'
  returning * into r;
  if not found then
    return null;
  end if;
  select * into s from public.agent_schedules where id = r.schedule_id;
  update public.agent_schedules set last_status = r.status where id = s.id;
  if r.status = 'ok' then
    insert into public.agent_runs (agent_id, owner_id, input, output, trace, tokens, latency_ms, source)
    values (s.agent_id, s.owner_id, s.input, left(p_output, 20000), coalesce(p_trace, '[]'::jsonb), p_tokens, p_latency_ms, 'schedule');
  end if;
  if p_charge and r.status = 'ok' then
    update public.profiles set credits = greatest(credits - 1, 0) where id = s.owner_id returning credits into balance;
  end if;
  return balance;
end;
$$;

revoke execute on function public.scheduler_claim(text) from public;
revoke execute on function public.scheduler_finish(text, uuid, text, text, text, jsonb, int, int, boolean, text) from public;
grant execute on function public.scheduler_claim(text) to anon, authenticated;
grant execute on function public.scheduler_finish(text, uuid, text, text, text, jsonb, int, int, boolean, text) to anon, authenticated;
