-- Knowledge files for agents: originals in a private bucket, extracted text per page in a table.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 10485760, array['application/pdf', 'text/plain', 'text/markdown'])
on conflict (id) do nothing;

create policy "knowledge: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "knowledge: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "knowledge: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'knowledge' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  node_id text not null,
  name text not null,
  mime text not null,
  storage_path text not null,
  pages int not null,
  chars int not null,
  content jsonb not null,            -- string[]: extracted text, one entry per page
  created_at timestamptz not null default now()
);
create index if not exists knowledge_docs_agent_idx on public.knowledge_docs (agent_id, node_id);
alter table public.knowledge_docs enable row level security;
create policy "owner all" on public.knowledge_docs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
