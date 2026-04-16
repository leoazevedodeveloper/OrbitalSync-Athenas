# A.D.A V2

A.D.A V2 is a desktop multimodal assistant built with Electron (React) + FastAPI + Gemini Native Audio.

## Current Scope

- Real-time voice conversation with Gemini live audio
- Gesture-based UI interaction
- Optional face authentication
- Project-based chat persistence
- File/project tools: read/write files, create/switch/list projects
- Image generation: **Nano Banana 2** via Gemini API (free tier, 500/dia) — mesma `GEMINI_API_KEY` da Athena

## Removed Modules

The following legacy modules were removed during cleanup:

- CAD generation
- 3D printing
- Web automation agent
- Kasa smart-home controls

- Memory: SQLite (`data/memory/memory.db`) + JSONL project history

```bash
npm install
```

3. Add environment variable in `.env`:

Veja também `.env.example`.

```env
GEMINI_API_KEY=your_key_here
```

4. Run app:

```bash
npm run dev
```

## Settings

Com **Supabase** no `.env` (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), as definições da app (`face_auth_enabled`, `camera_flipped`, `tool_permissions`) vêm **apenas do banco** (`athena_settings`, `athena_tool_permissions`) — o backend **não** lê mais `config/settings.json`. Ver `supabase/README.md`.

Hooks e apps locais: com Supabase ativo usam as tabelas `athena_webhook_*` e `athena_launch_apps`; sem Supabase, `webhook_config` / `launch_apps` ainda podem usar `config/webhooks.json` e `config/launch_apps.json`.

- `camera_flipped`, `face_auth_enabled`
- `tool_permissions` (write_file, read_file, etc.)

Use these commands in chat:
## Project Structure (simplified)

- `backend/server.py`: entrada uvicorn/Electron (`server:app_socketio`), política asyncio Windows
- `backend/orbital/server/bootstrap.py`: FastAPI + Socket.IO + sinais + `/status`
- `backend/orbital/server/handlers.py`: todos os eventos Socket.IO
- `backend/orbital/server/state.py` / `audio.py`: estado do loop e utilitários do orb
- `backend/orbital/settings.py`: estado em memória + gravação só no Supabase; `orbital/paths.py`: raízes do repo
- `backend/orbital/assistant/`: ATHENAS — Gemini Live, `AudioLoop`, devices
- `backend/orbital/services/`: auth facial, launch apps, webhooks, Nano Banana 2 (imagem), projetos, tools
- `backend/athenas.py`: CLI opcional do loop (`--mode camera|screen|none`)
- `config/`: ficheiros de configuração versionados (ex.: `webhooks.json`)
- `data/`: dados da app no disco (ver `data/README.md`)
- `dev/scripts/`: scripts de diagnóstico e testes manuais (não usados pelo runtime)
- `dev/ambiente/`: Cloudflare tunnel (`config.yml`), `cloudflared.exe` (opcional), notas Docker
- `integrations/n8n/`: índice + `spotify/` e `google-calendar/`
- `src/`: React UI
- `electron/`: shell Electron (inclui caminho para `dev/ambiente`)
- `supabase/`: SQL e documentação do backend remoto
