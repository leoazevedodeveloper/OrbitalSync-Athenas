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
    if st.evolution_proc and st.evolution_proc.returncode is None:
        try:
            pid = st.evolution_proc.pid
            print(f"[SERVER] Stopping Evolution API (PID {pid})...")
            if sys.platform == "win32":
                import subprocess as _sp
                result = _sp.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True, timeout=5)
                print(f"[SERVER] taskkill Evolution API: returncode={result.returncode} stdout={result.stdout.decode(errors='replace').strip()} stderr={result.stderr.decode(errors='replace').strip()}")
            else:
                st.evolution_proc.terminate()
        except Exception as e:
            print(f"[SERVER] Erro ao encerrar Evolution API: {e}")
    print("[SERVER] Force exiting...")
    os._exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def _atexit_cleanup():
    if st.evolution_proc and st.evolution_proc.returncode is None:
        try:
            pid = st.evolution_proc.pid
            print(f"[ATEXIT] Encerrando Evolution API (PID {pid})...")
            if sys.platform == "win32":
                import subprocess as _sp
                result = _sp.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True, timeout=5)
                print(f"[ATEXIT] taskkill resultado: returncode={result.returncode}")
            else:
                st.evolution_proc.terminate()
        except Exception as e:
            print(f"[ATEXIT] Erro: {e}")


import atexit
atexit.register(_atexit_cleanup)


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

    asyncio.create_task(_autostart_evolution_api())
    asyncio.create_task(_autostart_audio_loop())


async def _autostart_evolution_api():
    """Sobe a Evolution API (WhatsApp) automaticamente se ainda não estiver rodando."""
    import asyncio
    from orbital.paths import REPO_ROOT

    evo_dir = REPO_ROOT / "integrations" / "evolution-api" / "app"
    dist_main = evo_dir / "dist" / "main.js"

    # Verifica se a porta 8085 já está respondendo (instância externa)
    async def _port_open() -> bool:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection("127.0.0.1", 8085), timeout=2.0
            )
            writer.close()
            await writer.wait_closed()
            return True
        except Exception:
            return False

    if await _port_open():
        print("[EVOLUTION] Porta 8085 já ocupada — Evolution API já está rodando, pulando autostart.")
        return

    if not evo_dir.exists():
        print(f"[EVOLUTION] Diretório não encontrado: {evo_dir} — pulando autostart.")
        return

    # Se node_modules não existe, roda npm install primeiro
    if not (evo_dir / "node_modules").exists():
        print("[EVOLUTION] node_modules não encontrado — executando npm install (pode demorar)...")
        try:
            install_proc = await asyncio.create_subprocess_exec(
                "npm", "install", "--omit=dev",
                cwd=str(evo_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout, _ = await install_proc.communicate()
            if install_proc.returncode != 0:
                print(f"[EVOLUTION] npm install falhou (código {install_proc.returncode}):\n{stdout.decode(errors='replace')[-2000:]}")
                return
            print("[EVOLUTION] npm install concluído.")
        except Exception as e:
            print(f"[EVOLUTION] Erro ao executar npm install: {e}")
            return

    # Se o build não existe ainda, compila
    if not dist_main.exists():
        print("[EVOLUTION] dist/main.js não encontrado — executando npm run build...")
        try:
            build_proc = await asyncio.create_subprocess_exec(
                "npm", "run", "build",
                cwd=str(evo_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout, _ = await build_proc.communicate()
            if build_proc.returncode != 0:
                print(f"[EVOLUTION] Build falhou (código {build_proc.returncode}):\n{stdout.decode(errors='replace')[-2000:]}")
                return
            print("[EVOLUTION] Build concluído.")
        except Exception as e:
            print(f"[EVOLUTION] Erro ao executar npm build: {e}")
            return

    print(f"[EVOLUTION] Iniciando Evolution API em {evo_dir}...")
    try:
        proc = await asyncio.create_subprocess_exec(
            "node", "dist/main.js",
            cwd=str(evo_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        st.evolution_proc = proc
        print(f"[EVOLUTION] Processo iniciado (PID {proc.pid}). node dist/main.js @ {evo_dir}")

        # Lê stdout/stderr em background para não bloquear (e evitar buffer overflow)
        import re as _re
        _ANSI_RE = _re.compile(r'\x1b\[[0-9;]*[mGKHFJABCDsu]|\x1b\(B|\x1b=')

        async def _drain_output():
            assert proc.stdout
            try:
                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        break
                    decoded = line.decode(errors='replace').rstrip()
                    # remove códigos ANSI de cor/cursor
                    clean = _ANSI_RE.sub('', decoded)
                    # descarta linhas vazias ou muito verbosas
                    if not clean.strip():
                        continue
                    if any(k in clean for k in ('heartbeat', 'ping', 'pong', 'cacheservice disabled')):
                        continue
                    # força encoding seguro para stdout cp1252 do Windows
                    safe = clean.encode('utf-8', errors='replace').decode('utf-8')
                    try:
                        print(f"[EVOLUTION] {safe}", flush=True)
                    except UnicodeEncodeError:
                        print(f"[EVOLUTION] {safe.encode('ascii', errors='replace').decode('ascii')}", flush=True)
            except Exception as exc:
                print(f"[EVOLUTION] _drain_output erro: {exc}", flush=True)
            finally:
                ret = await proc.wait()
                print(f"[EVOLUTION] Processo encerrado (código {ret}, PID {proc.pid}).", flush=True)
                if st.evolution_proc is proc:
                    st.evolution_proc = None

        asyncio.create_task(_drain_output())

    except Exception as e:
        print(f"[EVOLUTION] Falha ao iniciar Evolution API: {e}")
        st.evolution_proc = None


async def _autostart_audio_loop():
    """Inicia o AudioLoop automaticamente no startup do servidor, sem precisar de ação na UI."""
    import asyncio
    import time

    await asyncio.sleep(3)  # aguarda o servidor estabilizar

    async with st.audio_control_lock:
        if st.audio_loop or (st.loop_task and not st.loop_task.done()):
            print("[AUTOSTART] Audio loop já está rodando, ignorando autostart.")
            return

        try:
            import athenas
            from orbital.server.audio import pcm16_to_energy_bars

            _bars_last = [0.0]

            def on_audio_data(data_bytes):
                now = time.monotonic()
                if now - _bars_last[0] < (1.0 / 45.0):
                    return
                _bars_last[0] = now
                bars = pcm16_to_energy_bars(data_bytes, bars=64)
                asyncio.create_task(sio.emit("audio_data", {"data": bars}))

            def on_transcription(data):
                if st.audio_loop and st.audio_loop.paused and data.get("sender") == "User":
                    return
                asyncio.create_task(sio.emit("transcription", data))

            def on_tool_confirmation(data):
                asyncio.create_task(sio.emit("tool_confirmation_request", data))

            def on_project_update(project_name):
                asyncio.create_task(sio.emit("project_update", {"project": project_name}))

            def on_error(msg):
                asyncio.create_task(sio.emit("error", {"msg": msg}))

            def on_runtime_log(level, message, source="audio"):
                asyncio.create_task(sio.emit("runtime_log", {"level": level, "message": message, "source": source}))

            def on_image_generated(image_b64, mime_type, caption=None, image_relpath=None):
                asyncio.create_task(sio.emit("image_generated", {
                    "data": image_b64,
                    "mime_type": mime_type or "image/png",
                    "caption": (caption or "Imagem gerada").strip() or "Imagem gerada",
                }))

            def on_timer_event(payload):
                asyncio.create_task(sio.emit("assistant_timer", payload))

            def on_calendar_event(payload):
                asyncio.create_task(sio.emit("assistant_calendar", payload))

            st.audio_loop = athenas.AudioLoop(
                video_mode="none",
                on_audio_data=on_audio_data,
                on_transcription=on_transcription,
                on_tool_confirmation=on_tool_confirmation,
                on_project_update=on_project_update,
                on_error=on_error,
                on_image_generated=on_image_generated,
                on_timer_event=on_timer_event,
                on_calendar_event=on_calendar_event,
                on_runtime_log=on_runtime_log,
                input_device_index=None,
            )

            st.audio_loop.update_permissions(SETTINGS.get("tool_permissions", {}))

            st.loop_task = asyncio.create_task(st.audio_loop.run())

            def handle_loop_exit(task):
                try:
                    task.result()
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"[AUTOSTART] Audio loop crashed: {e}")
                finally:
                    if st.loop_task is task:
                        st.loop_task = None
                        st.audio_loop = None

            st.loop_task.add_done_callback(handle_loop_exit)
            print("[SERVER] Audio loop iniciado automaticamente no startup.")

        except Exception as e:
            print(f"[SERVER] Falha no autostart do audio loop: {e}")
            import traceback
            traceback.print_exc()
            st.audio_loop = None
            st.loop_task = None


