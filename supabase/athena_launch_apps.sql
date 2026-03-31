-- Athena (ada_v2) - athena_launch_apps
-- 1 linha por app na whitelist (seed baseado em config/launch_apps.json -> apps[])

create extension if not exists pgcrypto;

create table if not exists public.athena_launch_apps (
  app_id text primary key, -- ex.: notepad, hydra
  label text not null default '',
  description text not null default '',
  path text not null,
  args jsonb not null default '[]'::jsonb, -- corresponds to args[]
  working_dir text null,
  updated_at timestamptz not null default now()
);

create index if not exists athena_launch_apps_path_idx
  on public.athena_launch_apps (path);

-- Seed (ajuste conforme crescer)
insert into public.athena_launch_apps (
  app_id,
  label,
  description,
  path,
  args,
  working_dir
)
values
  (
    'notepad',
    'Bloco de notas',
    'Editor de texto do Windows',
    $$C:\Windows\System32\notepad.exe$$,
    '[]'::jsonb,
    null
  ),
  (
    'hydra',
    'Hydra',
    '',
    $$C:\Users\leona\AppData\Local\Programs\Hydra\Hydra.exe$$,
    '[]'::jsonb,
    null
  ),
  (
    'spotify',
    'Spotify',
    '',
    $$C:\Users\leona\AppData\Roaming\Spotify\Spotify.exe$$,
    '[]'::jsonb,
    null
  )
on conflict (app_id) do update
set
  label = excluded.label,
  description = excluded.description,
  path = excluded.path,
  args = excluded.args,
  working_dir = excluded.working_dir,
  updated_at = now();

