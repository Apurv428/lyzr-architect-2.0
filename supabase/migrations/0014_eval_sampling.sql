-- Evals from real traffic: 1-in-10 API runs are sampled into a suggestions queue.
-- Owners review suggestions and promote them to eval_cases with one click.

alter table public.agent_api_runs
  add column if not exists sampled_as_eval bool not null default false;

create table if not exists public.suggested_eval_tests (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references public.agents (id) on delete cascade,
  run_id     uuid not null references public.agent_api_runs (id) on delete cascade,
  input      text not null,
  output     text not null,
  -- pending → accepted (moved to eval_cases) or rejected (dismissed)
  status     text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (run_id)
);

create index if not exists suggested_evals_agent_idx
  on public.suggested_eval_tests (agent_id, status, created_at desc);

alter table public.suggested_eval_tests enable row level security;

create policy "owner via agent" on public.suggested_eval_tests for all
  using (
    agent_id in (
      select a.id
      from   public.agents a
      join   public.projects p on p.id = a.project_id
      where  p.owner_id = auth.uid()
    )
  )
  with check (
    agent_id in (
      select a.id
      from   public.agents a
      join   public.projects p on p.id = a.project_id
      where  p.owner_id = auth.uid()
    )
  );
