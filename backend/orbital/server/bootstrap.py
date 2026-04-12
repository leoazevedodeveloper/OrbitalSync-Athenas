"""Monta FastAPI + Socket.IO, sinais HTTP (carregado por `server.py`)."""
import os
import signal
import sys

import socketio
from fastapi import FastAPI

from orbital.services.config.local_credentials import reload_env_from_dotenv_and_file

# `.env` + `data/local_credentials.json` antes de importar handlers (Gemini lê GEMINI_API_KEY aqui).
reload_env_from_dotenv_and_file()

from orbital.settings import SETTINGS, apply_semantic_memory_defaults
from orbital.services.supabase.remote_config import try_apply_supabase_config

from . import state as st
from .http_routes import register_http_routes
from .socket_handlers import register_socket_handlers

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

register_http_routes(app)
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


