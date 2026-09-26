-- Public agent API: per-agent keys (SHA-256 hash only), a per-minute rate limit counted
-- in Postgres, and two security-definer functions so the API route needs no service-role key.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  name text not null default 'Default key',
  prefix text not null,              -- first characters, shown masked in the UI
  key_hash text not null unique,     -- sha256 hex of the full key; the key itself is never stored
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_agent_idx on public.api_keys (agent_id);
alter table public.api_keys enable row level security;
create policy "owner read" on public.api_keys for select using (owner_id = auth.uid());
create policy "owner create" on public.api_keys for insert with check (
  owner_id = auth.uid() and exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
);
create policy "owner revoke" on public.api_keys for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- Owners may only set revoked_at; the hash is never readable from the browser.
revoke all on public.api_keys from anon, authenticated;
grant select (id, agent_id, name, prefix, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;
grant insert (agent_id, name, prefix, key_hash) on public.api_keys to authenticated;
grant update (revoked_at) on public.api_keys to authenticated;

create table if not exists public.api_rate (
  key_id uuid not null references public.api_keys (id) on delete cascade,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key_id, window_start)
);
alter table public.api_rate enable row level security;  -- no policies: only the functions below touch it

-- One row per API call, so a run can only be finished once and only after it was started.
create table if not exists public.api_calls (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.api_keys (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.api_calls enable row level security;  -- no policies

alter table public.agent_runs add column if not exists source text not null default 'console';

-- Validate a key, count it against the rate limit and hand the server what it needs to run the agent.
-- Anyone holding a valid key could call this directly; they would only see what the key already
-- grants (the agent's config and knowledge) plus key ciphertext they cannot decrypt.
create or replace function public.api_begin_run(p_key_hash text, p_agent_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  p_limit constant int := 60;       -- requests per key per minute (a constant, so callers can't raise it)
  k public.api_keys%rowtype;
  a public.agents%rowtype;
  n int;
  balance int;
  call_id uuid;
  anthropic_ct text;
  openai_ct text;
begin
  select * into k from public.api_keys where key_hash = p_key_hash and revoked_at is null;
  if not found or k.agent_id <> p_agent_id then
    return jsonb_build_object('status', 'invalid_key');
  end if;

  insert into public.api_rate (key_id, window_start, count)
  values (k.id, date_trunc('minute', now()), 1)
  on conflict (key_id, window_start) do update set count = public.api_rate.count + 1
  returning count into n;
  delete from public.api_rate where key_id = k.id and window_start < now() - interval '10 minutes';
  if n > p_limit then
    return jsonb_build_object('status', 'rate_limited', 'limit', p_limit,
      'retry_after', 60 - extract(second from now())::int);
  end if;

  select * into a from public.agents where id = k.agent_id;
  update public.profiles set credits = 100, credits_reset_on = current_date
   where id = k.owner_id and credits_reset_on < current_date;
  select credits into balance from public.profiles where id = k.owner_id;
  select anthropic_key, openai_key into anthropic_ct, openai_ct from public.user_secrets where owner_id = k.owner_id;
  update public.api_keys set last_used_at = now() where id = k.id;
  insert into public.api_calls (key_id) values (k.id) returning id into call_id;

  return jsonb_build_object(
    'status', 'ok',
    'call_id', call_id,
    'remaining', p_limit - n,
    'limit', p_limit,
    'credits', coalesce(balance, 0),
    'agent', jsonb_build_object('name', a.name, 'graph', a.graph),
    -- Ciphertext only (AES-256-GCM); the app server holds the key that decrypts it.
    'secrets', jsonb_build_object('anthropic_key', anthropic_ct, 'openai_key', openai_ct),
    'provider', (select model_provider from public.profiles where id = k.owner_id),
    'docs', coalesce((select jsonb_agg(jsonb_build_object('name', d.name, 'node_id', d.node_id, 'content', d.content))
                        from public.knowledge_docs d where d.agent_id = k.agent_id), '[]'::jsonb)
  );
end;
$$;

-- Record a finished call against the owner: the run log, one credit if the platform paid, and an event.
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
begin
  select * into k from public.api_keys where key_hash = p_key_hash;
  if not found then return null; end if;
  update public.api_calls set finished_at = now()
   where id = p_call_id and key_id = k.id and finished_at is null;
  if not found then return null; end if;

  insert into public.agent_runs (agent_id, owner_id, input, output, trace, tokens, latency_ms, source)
  values (k.agent_id, k.owner_id, left(p_input, 4000), left(p_output, 20000), p_trace, p_tokens, p_latency_ms, 'api');
  insert into public.events (user_id, name, props)
  values (k.owner_id, 'agent_api_called', jsonb_build_object('provider', p_provider, 'ms', p_latency_ms));
  if p_charge then
    update public.profiles set credits = greatest(credits - 1, 0) where id = k.owner_id returning credits into balance;
  end if;
  return balance;
end;
$$;

revoke execute on function public.api_begin_run(text, uuid) from public;
revoke execute on function public.api_finish_run(text, uuid, text, text, jsonb, int, int, boolean, text) from public;
grant execute on function public.api_begin_run(text, uuid) to anon, authenticated;
grant execute on function public.api_finish_run(text, uuid, text, text, jsonb, int, int, boolean, text) to anon, authenticated;
