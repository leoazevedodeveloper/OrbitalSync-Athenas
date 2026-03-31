-- Athena (ada_v2) - athena_settings
-- 1 linha por modulo com values jsonb (ex.: athena, comfyui)

create extension if not exists pgcrypto;

create table if not exists public.athena_settings (
  id uuid primary key default gen_random_uuid(),
  module_key text not null unique, -- ex.: athena, comfyui
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.athena_settings (
  module_key,
  values
)
values (
  'athena',
  '{
    "face_auth_enabled": false,
    "camera_flipped": true,
    "semantic_search_enabled": true,
    "semantic_embed_index": true,
    "semantic_embed_senders": "User, ATHENAS",
    "semantic_embed_min_length": 24,
    "semantic_embed_max_chars": 8000,
    "chat_startup_context_limit": 100
  }'::jsonb
)
on conflict (module_key) do update
set
  values = excluded.values,
  updated_at = now();

