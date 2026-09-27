-- Webhooks: a secret URL that runs an agent when any app POSTs to it, with an optional signed
-- forward of the result to the owner's URL. The token in the URL is looked up by its SHA-256 hash;
-- the app also keeps it encrypted (AES-256-GCM, ARCHITECT_SECRET) so the owner can copy the URL again.
-- Like the agent API, the public route needs no service-role key: two security-definer functions
-- validate the token, rate-limit it, and log the call.

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_ciphertext text not null,
  signing_secret_ciphertext text not null,
  forward_url text check (forward_url is null or forward_url like 'https://%'),
  enabled boolean not null default true,
  call_count int not null default 0,
  last_called_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webhooks_owner_idx on public.webhooks (owner_id, created_at desc);
alter table public.webhooks enable row level security;
drop policy if exists "owner read" on public.webhooks;
create policy "owner read" on public.webhooks for select using (owner_id = auth.uid());
drop policy if exists "owner create" on public.webhooks;
create policy "owner create" on public.webhooks for insert with check (
  owner_id = auth.uid() and exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
);
drop policy if exists "owner update" on public.webhooks;
create policy "owner update" on public.webhooks for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner delete" on public.webhooks;
create policy "owner delete" on public.webhooks for delete using (owner_id = auth.uid());
-- The hash stays server-side; call stats are written only by the functions below.
revoke all on public.webhooks from anon, authenticated;
grant select (id, agent_id, name, token_ciphertext, signing_secret_ciphertext, forward_url, enabled, call_count, last_called_at, created_at)
  on public.webhooks to authenticated;
grant insert (agent_id, name, token_hash, token_ciphertext, signing_secret_ciphertext, forward_url) on public.webhooks to authenticated;
grant update (name, token_hash, token_ciphertext, forward_url, enabled) on public.webhooks to authenticated;
grant delete on public.webhooks to authenticated;

create table if not exists public.webhook_rate (
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (webhook_id, window_start)
);
alter table public.webhook_rate enable row level security;  -- no policies: only the functions below touch it

-- One row per inbound call: what came in, what the agent answered, and whether the forward landed.
create table if not exists public.webhook_calls (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  input text,
  output text,
  error text,
  latency_ms int,
  forward_status int,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists webhook_calls_webhook_idx on public.webhook_calls (webhook_id, created_at desc);
alter table public.webhook_calls enable row level security;
drop policy if exists "owner read" on public.webhook_calls;
create policy "owner read" on public.webhook_calls for select using (owner_id = auth.uid());
revoke all on public.webhook_calls from anon, authenticated;
grant select on public.webhook_calls to authenticated;

-- Validate the token, count the call against the rate limit, open a call row and hand the server
-- what it needs to run the agent. Anyone holding the URL can call this; they only get what the URL
-- already grants, plus ciphertext they cannot decrypt.
create or replace function public.webhook_begin_run(p_token_hash text, p_input text)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  p_limit constant int := 30;       -- calls per webhook per minute
  w public.webhooks%rowtype;
  a public.agents%rowtype;
  n int;
  balance int;
  call_id uuid;
  anthropic_ct text;
  openai_ct text;
  slack_ct text;
begin
  select * into w from public.webhooks where token_hash = p_token_hash;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not w.enabled then return jsonb_build_object('status', 'disabled'); end if;

  insert into public.webhook_rate (webhook_id, window_start, count)
  values (w.id, date_trunc('minute', now()), 1)
  on conflict (webhook_id, window_start) do update set count = public.webhook_rate.count + 1
  returning count into n;
  delete from public.webhook_rate where webhook_id = w.id and window_start < now() - interval '10 minutes';
  if n > p_limit then
    return jsonb_build_object('status', 'rate_limited', 'limit', p_limit, 'retry_after', 60 - extract(second from now())::int);
  end if;

  select * into a from public.agents where id = w.agent_id;
  update public.profiles set credits = 100, credits_reset_on = current_date
   where id = w.owner_id and credits_reset_on < current_date;
  select credits into balance from public.profiles where id = w.owner_id;
  select anthropic_key, openai_key into anthropic_ct, openai_ct from public.user_secrets where owner_id = w.owner_id;
  if a.project_id is not null then
    select value into slack_ct from public.env_vars where project_id = a.project_id and key = 'SLACK_WEBHOOK_URL' limit 1;
  end if;

  update public.webhooks set call_count = call_count + 1, last_called_at = now() where id = w.id;
  insert into public.webhook_calls (webhook_id, owner_id, input) values (w.id, w.owner_id, left(p_input, 4000))
  returning id into call_id;

  return jsonb_build_object(
    'status', 'ok',
    'call_id', call_id,
    'limit', p_limit,
    'remaining', p_limit - n,
    'credits', coalesce(balance, 0),
    'webhook', jsonb_build_object('id', w.id, 'name', w.name, 'forward_url', w.forward_url, 'signing_secret', w.signing_secret_ciphertext),
    'agent', jsonb_build_object('id', a.id, 'name', a.name, 'graph', a.graph),
    'secrets', jsonb_build_object('anthropic_key', anthropic_ct, 'openai_key', openai_ct),
    'slack_webhook', slack_ct,
    'provider', (select model_provider from public.profiles where id = w.owner_id),
    'docs', coalesce((select jsonb_agg(jsonb_build_object('name', d.name, 'node_id', d.node_id, 'content', d.content))
                        from public.knowledge_docs d where d.agent_id = w.agent_id), '[]'::jsonb)
  );
end;
$$;

-- Close a call once: its outcome, the run log and one credit if the platform's model key paid.
create or replace function public.webhook_finish_run(
  p_token_hash text, p_call_id uuid, p_status text, p_output text, p_error text, p_trace jsonb,
  p_tokens int, p_latency_ms int, p_forward_status int, p_charge boolean, p_provider text
)
returns int
language plpgsql
security definer set search_path = ''
as $$
declare
  w public.webhooks%rowtype;
  balance int;
  new_run_id uuid;
  run_input text;
begin
  if p_status not in ('ok', 'error') then return null; end if;
  select * into w from public.webhooks where token_hash = p_token_hash;
  if not found then return null; end if;
  update public.webhook_calls
     set status = p_status, output = left(p_output, 20000), error = left(p_error, 500),
         latency_ms = p_latency_ms, forward_status = p_forward_status, finished_at = now()
   where id = p_call_id and webhook_id = w.id and status = 'running';
  if not found then return null; end if;

  if p_status = 'ok' then
    insert into public.agent_runs (agent_id, owner_id, input, output, trace, tokens, latency_ms, source)
    select w.agent_id, w.owner_id, c.input, left(p_output, 20000), p_trace, p_tokens, p_latency_ms, 'webhook'
      from public.webhook_calls c where c.id = p_call_id
    returning id, input into new_run_id, run_input;
    -- Webhook calls are real traffic too: sample them into eval suggestions like API runs (0014).
    if random() < 0.1 and length(coalesce(run_input, '')) >= 20 and length(coalesce(p_output, '')) >= 20 then
      insert into public.suggested_eval_tests (agent_id, run_id, input, output)
      values (w.agent_id, new_run_id, left(run_input, 4000), left(p_output, 4000));
      update public.agent_runs set sampled_as_eval = true where id = new_run_id;
    end if;
    insert into public.events (user_id, name, props)
    values (w.owner_id, 'webhook_called', jsonb_build_object('provider', p_provider, 'ms', p_latency_ms, 'forwarded', p_forward_status is not null));
    if p_charge then
      update public.profiles set credits = greatest(credits - 1, 0) where id = w.owner_id returning credits into balance;
    end if;
  end if;
  return balance;
end;
$$;

revoke execute on function public.webhook_begin_run(text, text) from public;
revoke execute on function public.webhook_finish_run(text, uuid, text, text, text, jsonb, int, int, int, boolean, text) from public;
grant execute on function public.webhook_begin_run(text, text) to anon, authenticated;
grant execute on function public.webhook_finish_run(text, uuid, text, text, text, jsonb, int, int, int, boolean, text) to anon, authenticated;
