-- OAuth connectors for agent tools (Slack, Gmail, HubSpot).
-- Tokens are AES-256-GCM encrypted before storage (same scheme as env_vars).

create table if not exists public.oauth_connectors (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete cascade,
  provider      text not null
    check (provider in ('slack', 'gmail', 'hubspot')),
  access_token  text not null,
  refresh_token text,
  scopes        text[],
  expires_at    timestamptz,
  meta          jsonb,       -- e.g. {team_name, bot_user_id, channel_default}
  created_at    timestamptz not null default now(),
  unique (owner_id, project_id, provider)
);

alter table public.oauth_connectors enable row level security;

drop policy if exists "owner all" on public.oauth_connectors;
create policy "owner all" on public.oauth_connectors for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

comment on column public.oauth_connectors.access_token  is 'AES-256-GCM ciphertext (v1:iv:tag:data)';
comment on column public.oauth_connectors.refresh_token is 'AES-256-GCM ciphertext (v1:iv:tag:data), nullable';
