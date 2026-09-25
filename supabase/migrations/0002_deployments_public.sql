-- Deployments serve a frozen copy of a checkpoint at a public URL.

alter table public.deployments
  add column if not exists slug text,
  add column if not exists files jsonb,
  add column if not exists label text,
  add column if not exists is_current boolean not null default false;

create index if not exists deployments_slug_idx on public.deployments (slug, created_at desc);

-- Anyone with the link can load a finished deployment (the app is public by design).
create policy "public read ready deployments" on public.deployments
  for select using (status = 'ready');

alter table public.projects
  add column if not exists slug text unique,
  add column if not exists custom_domain text;
