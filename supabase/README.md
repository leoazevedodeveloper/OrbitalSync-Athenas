# Supabase SQL Scripts (Athena - ada_v2)

Este diretório contém scripts SQL para criar e semear as tabelas de configuração do seu projeto.

## Opção recomendada: 1 arquivo por tabela
Rode na ordem abaixo (settings -> tool_permissions -> webhook_defaults -> webhooks -> launch_apps -> chat):
- `athena_settings.sql`
- `athena_tool_permissions.sql`
- `athena_webhook_defaults.sql`
- `athena_webhooks.sql`
- `athena_launch_apps.sql`
- `athena_chat_messages.sql` (histórico de conversa por projeto)
- `athena_chat_messages_fts.sql` (opcional: `search_tsv` + GIN se a tabela já existia sem FTS)
- `athena_chat_message_embeddings.sql` (opcional: pgvector + RPC `match_chat_semantic`)

## Tabelas
- `public.athena_settings`
- `public.athena_tool_permissions`
- `public.athena_webhook_defaults`
- `public.athena_webhooks`
- `public.athena_launch_apps`
- `public.athena_chat_messages`
- `public.athena_chat_message_embeddings` (se rodou o script de embeddings)

## Notas
- Os scripts não habilitam RLS nem policies. O objetivo aqui é apenas criar estrutura e dados.
- `athena_settings` usa `module_key` + `values jsonb` para suportar modulos como `athena` e `comfyui`.
- `athena_tool_permissions` é 100% relacional (1 linha por permissão).
- Campos `args`, `body` e `default_headers` continuam em `jsonb`.
- `default_timeout_sec` é `float8` para aceitar inteiros ou valores com decimais.

## Backend (ada_v2)
Com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (ou `SUPABASE_ANON_KEY` com RLS ok) no `.env`:

- Na subida: **só lê do banco** — `SETTINGS`, webhooks e whitelist de apps vêm das tabelas `athena_*`.
- Ao mudar configurações na UI: **`save_settings` grava no Supabase** em tempo real (`athena_settings` + `athena_tool_permissions`); novo app na whitelist faz `INSERT` em `athena_launch_apps`.
- Sem URL/chave no `.env`: o backend volta ao modo **arquivos** em `config/*.json` (se existirem).

### Histórico de chat (`athena_chat_messages`)

Com Supabase ativo **e** a tabela criada no projeto: o backend grava e lê o histórico **no banco** (`project_name` alinhado ao nome da pasta do projeto). Se o insert/select remoto falhar ou o Supabase estiver desligado, continua a usar `data/projects/<projeto>/chat_history.jsonl`.

A coluna **`search_tsv`** (gerada a partir de `message_text`, config `simple`) alimenta busca **full-text** via PostgREST (`fts`). Instalações antigas: rode `athena_chat_messages_fts.sql` uma vez.

### Busca semântica (embeddings)

Ative a extensão **vector** no projeto Supabase e rode **`athena_chat_message_embeddings.sql`**. O backend grava embeddings (`gemini-embedding-001`, 768 dim) após cada insert no chat e usa a RPC **`match_chat_semantic`**.

Variáveis de ambiente (quota / custo):

- `ORBITAL_CHAT_SEMANTIC=false` — desliga busca semântica (fica FTS + ILIKE).
- `ORBITAL_EMBED_INDEX=false` — não gera embedding em mensagens novas (a busca semântica continua a funcionar no que já estiver indexado).
- `ORBITAL_EMBED_SENDERS` — quem indexar (ex.: `User,ATHENAS` ou `*` para todos). Por defeito só **`User`** (menos chamadas à API).
- `ORBITAL_EMBED_MIN_LENGTH` — tamanho mínimo do texto para indexar (por defeito **24** caracteres).
- `ORBITAL_EMBED_MAX_CHARS` — máximo de caracteres enviados ao modelo de embedding por mensagem (por defeito **8000**, podes baixar para **2000–3000** para poupar tokens).

Mensagens antigas só entram na busca semântica após **backfill** ou à medida que novas mensagens forem gravadas e indexadas.

