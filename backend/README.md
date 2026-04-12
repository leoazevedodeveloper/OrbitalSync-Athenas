# Backend OrbitalSync

## Layout

```
backend/
├── server.py                 # uvicorn: server:app_socketio (política asyncio Windows)
├── athenas.py                # CLI opcional do AudioLoop
├── orbital/
│   ├── paths.py              # REPO_ROOT, BACKEND_ROOT
│   ├── settings.py           # SETTINGS (Supabase)
│   ├── assistant/
│   │   ├── audio_loop.py     # Sessão Gemini Live, filas áudio, tools
│   │   ├── live_utils.py     # Histórico startup, datas lembrete, ExceptionGroup
│   │   ├── webhook_tool_result.py  # Formato [SUCCESS]/[FAILED] para webhooks
│   │   ├── gemini_setup.py, constants.py, devices.py, pyaudio_ctx.py
│   ├── services/             # Supabase, project_manager, tools, integrações, memory
│   └── server/
│       ├── bootstrap.py      # FastAPI + Socket.IO ASGI
│       ├── http_routes.py    # GET /status, /api/comfyui-image
│       ├── state.py, audio.py
│       └── socket_handlers/  # connect, audio, chat, settings, finance, emit
```

O Electron lança `python server.py` com `cwd` = `backend/`.

## Cérebro (Obsidian) e RAG (Supabase)

1. Aplicar no SQL Editor do projeto: `../supabase/athena_brain_chunk_embeddings.sql`.
2. `.env` na raiz do repo: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (ou anon conforme políticas).
3. **Índice inicial** (todas as notas `.md` → chunks + embeddings), com `cwd` = `backend/`:

```text
python ..\scripts\rebuild_brain_rag.py
```

No Linux/macOS: `python ../scripts/rebuild_brain_rag.py`.

Variável opcional: `ORBITAL_BRAIN_PATH` se o vault não for `../data/memory/OrbitalSync` relativo ao repo.

Depois disso, cada `write_brain` reindexa só a nota afetada. A busca `search_brain` aceita `mode`: `keyword`, `semantic` ou `hybrid`.
