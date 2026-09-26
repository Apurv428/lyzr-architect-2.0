-- pgvector semantic search for knowledge files.
-- Passages are stored with 1536-dim embeddings (OpenAI text-embedding-3-small or compatible).
-- Hybrid search fuses BM25 (app-side) with vector cosine similarity (Postgres).

create extension if not exists vector;

-- Per-passage embeddings table: one row per ~900-char chunk.
create table if not exists public.knowledge_passages (
  id        uuid primary key default gen_random_uuid(),
  doc_id    uuid not null references public.knowledge_docs (id) on delete cascade,
  page      int  not null,
  chunk_idx int  not null,
  text      text not null,
  embedding vector(1536)
);

create index if not exists kp_doc_idx on public.knowledge_passages (doc_id);
create index if not exists kp_embedding_idx
  on public.knowledge_passages using ivfflat (embedding vector_cosine_ops) with (lists = 50);

alter table public.knowledge_passages enable row level security;
create policy "owner via doc" on public.knowledge_passages for all
  using (
    doc_id in (
      select id from public.knowledge_docs where owner_id = auth.uid()
    )
  )
  with check (
    doc_id in (
      select id from public.knowledge_docs where owner_id = auth.uid()
    )
  );

-- Vector-only search RPC (BM25 fusion happens in the app).
-- Returns the top-k passages ordered by cosine similarity.
create or replace function public.knowledge_search(
  p_agent_id  uuid,
  p_node_id   text,
  p_embedding vector(1536),
  p_limit     int default 12
)
returns table (
  doc_id   uuid,
  doc_name text,
  page     int,
  text     text,
  score    float
)
language sql
security definer
set search_path = ''
as $$
  select
    kp.doc_id,
    kd.name,
    kp.page,
    kp.text,
    1 - (kp.embedding <=> p_embedding) as score
  from   public.knowledge_passages kp
  join   public.knowledge_docs kd on kd.id = kp.doc_id
  where  kd.agent_id = p_agent_id
  and    kd.node_id  = p_node_id
  and    kp.embedding is not null
  order  by kp.embedding <=> p_embedding
  limit  p_limit;
$$;

revoke execute on function public.knowledge_search(uuid, text, vector(1536), int) from public, anon;
grant  execute on function public.knowledge_search(uuid, text, vector(1536), int) to authenticated;
