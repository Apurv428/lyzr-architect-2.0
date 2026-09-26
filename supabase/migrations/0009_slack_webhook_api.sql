-- Migration 0009: include the Slack webhook ciphertext in api_begin_run so the
-- public agent API can post live Slack messages (the same path the test console
-- already uses for session-authenticated callers).

create or replace function public.api_begin_run(p_key_hash text, p_agent_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  p_limit  constant int := 60;
  k        public.api_keys%rowtype;
  a        public.agents%rowtype;
  n        int;
  balance  int;
  call_id  uuid;
  anthropic_ct  text;
  openai_ct     text;
  slack_ct      text;
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
  select anthropic_key, openai_key into anthropic_ct, openai_ct
    from public.user_secrets where owner_id = k.owner_id;
  update public.api_keys set last_used_at = now() where id = k.id;
  insert into public.api_calls (key_id) values (k.id) returning id into call_id;

  -- Fetch the AES-256-GCM ciphertext for SLACK_WEBHOOK_URL if it is set for
  -- this agent's project. The app server decrypts it with ARCHITECT_SECRET.
  if a.project_id is not null then
    select value into slack_ct
      from public.env_vars
     where project_id = a.project_id and key = 'SLACK_WEBHOOK_URL'
     limit 1;
  end if;

  return jsonb_build_object(
    'status',        'ok',
    'call_id',       call_id,
    'remaining',     p_limit - n,
    'limit',         p_limit,
    'credits',       coalesce(balance, 0),
    'agent',         jsonb_build_object('name', a.name, 'graph', a.graph),
    -- Ciphertext only; the app server holds ARCHITECT_SECRET for decryption.
    'secrets',       jsonb_build_object('anthropic_key', anthropic_ct, 'openai_key', openai_ct),
    'slack_webhook', slack_ct,
    'provider',      (select model_provider from public.profiles where id = k.owner_id),
    'docs',          coalesce(
                       (select jsonb_agg(jsonb_build_object('name', d.name, 'node_id', d.node_id, 'content', d.content))
                          from public.knowledge_docs d where d.agent_id = k.agent_id),
                       '[]'::jsonb)
  );
end;
$$;
