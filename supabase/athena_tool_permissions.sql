-- Athena (ada_v2) - athena_tool_permissions
-- 1 linha por permissão (seed baseado em config/settings.json -> tool_permissions)

create extension if not exists pgcrypto;

create table if not exists public.athena_tool_permissions (
  permission_key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.athena_tool_permissions (permission_key, enabled)
values
  ('write_file', true),
  ('read_directory', true),
  ('read_file', true),
  ('create_project', true),
  ('switch_project', true),
  ('list_projects', true),
  ('generate_image', true),
  ('list_launch_apps', false),
  ('launch_app', false),
  ('trigger_webhook', false),
  ('create_directory', true)
on conflict (permission_key) do update
set
  enabled = excluded.enabled,
  updated_at = now();

