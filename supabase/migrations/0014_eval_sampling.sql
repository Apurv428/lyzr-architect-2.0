-- Evals from real traffic: 1 in 10 substantive API runs is sampled into a suggestions queue.
-- Owners review suggestions and promote them to eval_cases with one click.
-- The public API has no user session, so sampling happens inside api_finish_run (security definer)
-- rather than in the route, where row-level security would reject the insert.

alter table public.agent_runs
  add column if not exists sampled_as_eval boolean not null default false;

create table if not exists public.suggested_eval_tests (
  id         uuid primary key default gen_random_uuid(),
  agent_id   uuid not null references public.agents (id) on delete cascade,
  run_id     uuid not null references public.agent_runs (id) on delete cascade,
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

-- Owned through the agent, so library agents without a project are covered too.
drop policy if exists "owner via agent" on public.suggested_eval_tests;
create policy "owner via agent" on public.suggested_eval_tests for all
  using (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid()));

-- Same contract as 0007, plus the sampling.
create or replace function public.api_finish_run(
  p_key_hash text, p_call_id uuid, p_input text, p_output text, p_trace jsonb,
  p_tokens int, p_latency_ms int, p_charge boolean, p_provider text
)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  k public.api_keys%rowtype;
  balance int;
  new_run_id uuid;
begin
  select * into k from public.api_keys where key_hash = p_key_hash;
  if not found then return null; end if;
  update public.api_calls set finished_at = now()
   where id = p_call_id and key_id = k.id and finished_at is null;
  if not found then return null; end if;

  insert into public.agent_runs (agent_id, owner_id, input, output, trace, tokens, latency_ms, source)
  values (k.agent_id, k.owner_id, left(p_input, 4000), left(p_output, 20000), p_trace, p_tokens, p_latency_ms, 'api')
  returning id into new_run_id;

  -- Sample 1 in 10 runs with a real question and answer for the owner to review as eval cases.
  if random() < 0.1 and length(coalesce(p_input, '')) >= 20 and length(coalesce(p_output, '')) >= 20 then
    insert into public.suggested_eval_tests (agent_id, run_id, input, output)
    values (k.agent_id, new_run_id, left(p_input, 4000), left(p_output, 4000));
    update public.agent_runs set sampled_as_eval = true where id = new_run_id;
  end if;

  insert into public.events (user_id, name, props)
  values (k.owner_id, 'agent_api_called', jsonb_build_object('provider', p_provider, 'ms', p_latency_ms));
  if p_charge then
    update public.profiles set credits = greatest(credits - 1, 0) where id = k.owner_id returning credits into balance;
  end if;
  return balance;
end;
$$;
