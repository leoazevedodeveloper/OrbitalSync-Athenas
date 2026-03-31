-- OrbitalSync — embeddings semânticos do histórico (pgvector) + RPC de busca
-- Rode no SQL Editor do Supabase depois de `athena_chat_messages.sql`.
-- Requer extensão "vector" ativa (Database → Extensions → vector).

create extension if not exists vector;

create table if not exists public.athena_chat_message_embeddings (
  message_id uuid primary key references public.athena_chat_messages (id) on delete cascade,
  embedding vector(768) not null,
  created_at timestamptz not null default now()
);

-- HNSW + distância de cosseno (alinhado ao uso típico de embeddings Gemini)
create index if not exists athena_chat_message_embeddings_hnsw_idx
  on public.athena_chat_message_embeddings
  using hnsw (embedding vector_cosine_ops);

comment on table public.athena_chat_message_embeddings is
  'Vetores 768d (gemini-embedding-001) por message_id; geridos pelo backend OrbitalSync.';

create or replace function public.match_chat_semantic(
  query_embedding vector(768),
  p_project_name text,
  match_count int default 10
)
returns table (
  sender text,
  message_text text,
  meta jsonb,
  created_at timestamptz,
  similarity double precision
)
language sql
stable
parallel safe
as $$
  select
    m.sender,
    m.message_text,
    m.meta,
    m.created_at,
    (1 - (e.embedding <=> query_embedding))::double precision as similarity
  from public.athena_chat_message_embeddings e
  inner join public.athena_chat_messages m on m.id = e.message_id
  where m.project_name = p_project_name
  order by e.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 10), 50));
$$;

grant execute on function public.match_chat_semantic(vector(768), text, int) to service_role;
grant execute on function public.match_chat_semantic(vector(768), text, int) to authenticated;
grant execute on function public.match_chat_semantic(vector(768), text, int) to anon;
