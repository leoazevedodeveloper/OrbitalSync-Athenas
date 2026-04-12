-- OrbitalSync — RAG do cérebro Obsidian (chunks .md + pgvector)
-- Rode no SQL Editor do Supabase. Requer extensão "vector".
-- Independente de athena_chat_messages.

create extension if not exists vector;

create table if not exists public.athena_brain_chunk_embeddings (
  id uuid primary key default gen_random_uuid(),
  vault_path text not null,
  chunk_index int not null,
  chunk_text text not null,
  embedding vector(768) not null,
  updated_at timestamptz not null default now(),
  unique (vault_path, chunk_index)
);

create index if not exists athena_brain_chunk_embeddings_hnsw_idx
  on public.athena_brain_chunk_embeddings
  using hnsw (embedding vector_cosine_ops);

create index if not exists athena_brain_chunk_embeddings_vault_path_idx
  on public.athena_brain_chunk_embeddings (vault_path);

comment on table public.athena_brain_chunk_embeddings is
  'Chunks das notas do brain vault; vetores 768d (gemini-embedding-001).';

create or replace function public.match_brain_semantic(
  query_embedding vector(768),
  match_count int default 10
)
returns table (
  vault_path text,
  chunk_index int,
  chunk_text text,
  similarity double precision
)
language sql
stable
parallel safe
as $$
  select
    e.vault_path,
    e.chunk_index,
    e.chunk_text,
    (1 - (e.embedding <=> query_embedding))::double precision as similarity
  from public.athena_brain_chunk_embeddings e
  order by e.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 10), 50));
$$;

grant execute on function public.match_brain_semantic(vector(768), int) to service_role;
grant execute on function public.match_brain_semantic(vector(768), int) to authenticated;
grant execute on function public.match_brain_semantic(vector(768), int) to anon;
