"""Monta FastAPI + Socket.IO, sinais e rota /status (carregado por `server.py`)."""
import mimetypes
import os
import signal
import sys

import socketio
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse

from orbital.services.local_credentials import reload_env_from_dotenv_and_file

# `.env` + `data/local_credentials.json` antes de importar handlers (Gemini lê GEMINI_API_KEY aqui).
reload_env_from_dotenv_and_file()

from orbital.settings import SETTINGS, apply_semantic_memory_defaults
from orbital.services.comfyui_client import safe_comfyui_imagens_file
from orbital.services.supabase_remote_config import try_apply_supabase_config

from . import state as st
from .handlers import register_socket_handlers

try:
    try_apply_supabase_config(SETTINGS)
except Exception as e:
    print(f"[SERVER] Supabase config (opcional) ignorada: {e!r}")
apply_semantic_memory_defaults(SETTINGS)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    max_http_buffer_size=25 * 1024 * 1024,
)
app = FastAPI()
app_socketio = socketio.ASGIApp(sio, app)

register_socket_handlers(sio)


def signal_handler(sig, frame):
    print(f"\n[SERVER] Caught signal {sig}. Exiting gracefully...")
    if st.audio_loop:
        try:
            print("[SERVER] Stopping Audio Loop...")
            st.audio_loop.stop()
        except Exception:
            pass
    print("[SERVER] Force exiting...")
    os._exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


@app.on_event("startup")
async def startup_event():
    print("[SERVER DEBUG] Startup Event Triggered")
    print(f"[SERVER DEBUG] Python Version: {sys.version}")
    try:
        import asyncio

        loop = asyncio.get_running_loop()
        print(f"[SERVER DEBUG] Running Loop: {type(loop)}")
        policy = asyncio.get_event_loop_policy()
        print(f"[SERVER DEBUG] Current Policy: {type(policy)}")
    except Exception as e:
        print(f"[SERVER DEBUG] Error checking loop: {e}")

    try:
        from orbital.paths import BACKEND_ROOT

        _ = BACKEND_ROOT.parent
    except Exception:
        pass


@app.get("/status")
async def status():
    return {"status": "running", "service": "A.D.A Backend"}


@app.get("/api/comfyui-image")
async def comfyui_saved_image(relpath: str = Query(..., min_length=1, max_length=512)):
    """Serve ficheiros só dentro de data/comfyui/imagens (histórico do chat)."""
    resolved = safe_comfyui_imagens_file(relpath)
    if resolved is None:
        raise HTTPException(status_code=404, detail="Not found")
    media_type, _ = mimetypes.guess_type(str(resolved))
    return FileResponse(resolved, media_type=media_type or "application/octet-stream")
