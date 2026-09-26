-- Evals: saved test cases per agent and a history of runs (pass rate over time).

create table if not exists public.eval_cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  input text not null check (char_length(input) between 1 and 4000),
  expectation text not null default '' check (char_length(expectation) <= 1000),
  kind text not null default 'contains' check (kind in ('contains', 'not_contains', 'judge')),
  created_at timestamptz not null default now()
);
create index if not exists eval_cases_agent_idx on public.eval_cases (agent_id, created_at);
alter table public.eval_cases enable row level security;
create policy "owner all" on public.eval_cases for all using (owner_id = auth.uid()) with check (
  owner_id = auth.uid() and exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
);

create table if not exists public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  results jsonb not null,            -- [{ case_id, input, kind, expectation, pass: boolean | null, output, reason }]
  passed int not null,
  graded int not null,               -- cases with a verdict (judge cases are skipped in demo mode)
  pass_rate real,                    -- passed / graded, null when nothing was graded
  created_at timestamptz not null default now()
);
create index if not exists eval_runs_agent_idx on public.eval_runs (agent_id, created_at desc);
alter table public.eval_runs enable row level security;
create policy "owner all" on public.eval_runs for all using (owner_id = auth.uid()) with check (
  owner_id = auth.uid() and exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
);
