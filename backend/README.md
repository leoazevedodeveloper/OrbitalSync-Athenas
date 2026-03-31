# Backend OrbitalSync

## Layout

```
backend/
├── server.py              # uvicorn: server:app_socketio
├── athenas.py             # ATHENAS — run local do AudioLoop (opcional)
├── orbital/
│   ├── paths.py           # REPO_ROOT, BACKEND_ROOT
│   ├── settings.py        # SETTINGS (só Supabase; sem defaults em ficheiro)
│   ├── assistant/         # Gemini Live + AudioLoop
│   ├── services/        # integrações (Supabase, apps, webhooks, ComfyUI, …)
│   └── server/
│       ├── bootstrap.py   # FastAPI + Socket.IO + /status
│       ├── handlers.py    # eventos sio
│       ├── state.py
│       └── audio.py
```

O Electron continua a lançar `python server.py` com `cwd` = `backend/`.
