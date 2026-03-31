-- Athena (OrbitalSync) — histórico de chat por projeto (alternativa ao chat_history.jsonl)
-- Rode no SQL Editor do Supabase após as outras tabelas athena_*.

create extension if not exists pgcrypto;

create table if not exists public.athena_chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  sender text not null,
  message_text text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  search_tsv tsvector generated always as (to_tsvector('simple', coalesce(message_text, ''))) stored
);

create index if not exists athena_chat_messages_project_created_idx
  on public.athena_chat_messages (project_name, created_at desc);

create index if not exists athena_chat_messages_search_tsv_idx
  on public.athena_chat_messages using gin (search_tsv);

comment on table public.athena_chat_messages is 'Mensagens de chat ATHENAS por projeto; meta pode incluir mime_type, image_relpath.';
