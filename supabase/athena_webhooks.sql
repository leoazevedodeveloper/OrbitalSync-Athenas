-- Athena (ada_v2) - athena_webhooks
-- 1 linha por webhook (seed baseado em config/webhooks.json -> hooks[])

create extension if not exists pgcrypto;

create table if not exists public.athena_webhooks (
  id text primary key, -- hook_id (ex.: athena-spotify)
  description text not null default '',
  url text not null,
  method text null, -- optional override
  headers jsonb null, -- optional override
  timeout_sec float8 null, -- optional override
  body jsonb null, -- optional default payload
  updated_at timestamptz not null default now()
);

create index if not exists athena_webhooks_url_idx
  on public.athena_webhooks (url);

-- Seed (ajuste conforme crescer)
insert into public.athena_webhooks (
  id,
  description,
  url,
  method,
  body
)
values (
  'athena-spotify',
  'n8n: controlar Spotify (corpo padrao com action)',
  'https://n8n.orbitalsync.site/webhook/athena-spotify',
  'POST',
  '{}'::jsonb
)
on conflict (id) do update
set
  description = excluded.description,
  url = excluded.url,
  method = excluded.method,
  body = excluded.body,
  updated_at = now();

