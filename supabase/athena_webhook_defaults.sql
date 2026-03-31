-- Athena (ada_v2) - athena_webhook_defaults
-- Seed baseado em config/webhooks.json

create extension if not exists pgcrypto;

create table if not exists public.athena_webhook_defaults (
  id uuid primary key default gen_random_uuid(),
  singleton_key text not null unique default 'default',
  version int not null default 1,
  default_method text not null default 'POST',
  default_timeout_sec float8 not null default 30,
  default_headers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.athena_webhook_defaults (
  singleton_key,
  version,
  default_method,
  default_timeout_sec,
  default_headers
)
values (
  'default',
  1,
  'POST',
  30,
  '{"Content-Type":"application/json"}'::jsonb
)
on conflict (singleton_key) do update
set
  version = excluded.version,
  default_method = excluded.default_method,
  default_timeout_sec = excluded.default_timeout_sec,
  default_headers = excluded.default_headers,
  updated_at = now();

