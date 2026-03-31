"""Registro de todos os eventos Socket.IO."""
import asyncio
import base64
import binascii
import os
import sys
import time

if sys.version_info < (3, 11):
    from exceptiongroup import BaseExceptionGroup
from collections import deque
from datetime import datetime

import athenas

from orbital.settings import PROJECT_ROOT, SETTINGS, apply_semantic_memory_defaults, save_settings
from orbital.services.authenticator import FaceAuthenticator
from orbital.services.launch_apps import (
    add_launch_app_entry,
    launch_apps_config_path,
    list_launch_apps_catalog,
)
from orbital.services.integration_hub import build_integrations_snapshot
from orbital.services.local_credentials import (
    CREDENTIALS_PATH,
    build_credentials_public_meta,
    merge_save_and_apply,
)
from orbital.services.comfyui_client import repo_relative_posix, save_chat_upload_image_to_data_dir
from orbital.services.project_manager import ProjectManager
from orbital.services.webhook_config import (
    fire_webhook_by_id,
    list_hook_summaries,
    load_webhooks_config,
    normalize_trigger_webhook_payload,
)

from . import state as st
from .audio import pcm16_to_energy_bars, shutdown_audio_loop

_MAX_CHAT_IMAGE_B64_LEN = 14_000_000
_RUNTIME_LOGS = deque(maxlen=400)
# Só clientes nesta sala recebem `runtime_log` em tempo real (evita tráfego/parse com config fechadas).
_RUNTIME_LOGS_ROOM = "runtime_logs_watchers"


def _log_entry(level: str, message: str, source: str = "server") -> dict:
    ts = datetime.now().strftime("%H:%M:%S")
    entry = {
        "ts": ts,
        "level": str(level or "info").strip().lower(),
        "source": str(source or "server").strip() or "server",
        "message": str(message or "").strip(),
    }
    _RUNTIME_LOGS.append(entry)
    return entry


def _normalize_chat_image_payload(data: dict):
    """Retorna ((b64, mime), None) se OK; (None, None) sem imagem; (None, 'too_large') se exceder tamanho."""
    raw = data.get("image_b64") or data.get("image")
    if raw is None:
        return None, None
    if not isinstance(raw, str):
        return None, None
    s = raw.strip()
    mime = str(data.get("mime_type") or "image/jpeg").split(";")[0].strip().lower()
    if s.startswith("data:"):
        head, _, rest = s.partition(",")
        s = rest.strip()
        h = head.lower()
        if "image/png" in h:
            mime = "image/png"
        elif "image/webp" in h:
            mime = "image/webp"
        elif "image/gif" in h:
            mime = "image/gif"
        else:
            mime = "image/jpeg"
    if len(s) > _MAX_CHAT_IMAGE_B64_LEN:
        return None, "too_large"
    return (s, mime), None


def _append_settings_runtime_fields(payload: dict) -> None:
    try:
        payload["automation_hooks"] = list_hook_summaries(load_webhooks_config())
    except Exception as e:
        print(f"[SERVER] automation_hooks: {e}")
        payload["automation_hooks"] = []
    try:
        payload["launch_app_catalog"] = list_launch_apps_catalog()
    except Exception as e:
        print(f"[SERVER] launch_app_catalog: {e}")
        payload["launch_app_catalog"] = []
    payload["launch_apps_config_path"] = str(launch_apps_config_path())
    try:
        payload["integrations"] = build_integrations_snapshot()
    except Exception as e:
        print(f"[SERVER] integrations snapshot: {e}")
        payload["integrations"] = None
    try:
        payload["credentials_meta"] = build_credentials_public_meta()
    except Exception as e:
        print(f"[SERVER] credentials_meta: {e}")
        payload["credentials_meta"] = {
            "credentials_file": str(CREDENTIALS_PATH),
            "credentials_file_exists": False,
            "supabase_url": "",
            "supabase_configured": False,
            "supabase_host": "",
            "gemini_configured": False,
            "comfyui_base_url": "http://127.0.0.1:2000",
            "comfyui_workflow_file": "",
            "secrets_visible_in_ui": False,
            "supabase_secret_length": 0,
            "gemini_api_key_length": 0,
        }


def register_socket_handlers(sio):
    async def _emit_runtime_log(level: str, message: str, source: str = "server", room=None):
        entry = _log_entry(level, message, source=source)
        if room is not None:
            await sio.emit("runtime_log", entry, room=room)
        else:
            # Broadcast apenas a quem abriu Configurações → logs (opt-in).
            await sio.emit("runtime_log", entry, room=_RUNTIME_LOGS_ROOM)

    async def _emit_full_settings():
        payload = dict(SETTINGS)
        _append_settings_runtime_fields(payload)
        await sio.emit("settings", payload)

    @sio.event
    async def connect(sid, environ):
        print(f"Client connected: {sid}")
        await sio.emit("status", {"msg": "Connected to A.D.A Backend"}, room=sid)
        # Não enviar snapshot aqui: até 400× JSON por connect agravava lag/travamentos no renderer.
        await _emit_runtime_log("info", f"Cliente conectado: {sid[:8]}...", source="socket")

        async def on_auth_status(is_auth):
            print(f"[SERVER] Auth status change: {is_auth}")
            await sio.emit("auth_status", {"authenticated": is_auth})

        async def on_auth_frame(frame_b64):
            await sio.emit("auth_frame", {"image": frame_b64})

        if st.authenticator is None:
            st.authenticator = FaceAuthenticator(
                reference_image_path="reference.jpg",
                on_status_change=on_auth_status,
                on_frame=on_auth_frame,
            )

        if st.authenticator.authenticated:
            await sio.emit("auth_status", {"authenticated": True})
        else:
            if SETTINGS.get("face_auth_enabled", False):
                await sio.emit("auth_status", {"authenticated": False})
                asyncio.create_task(st.authenticator.start_authentication_loop())
            else:
                print("Face Auth Disabled. Auto-authenticating.")
                await sio.emit("auth_status", {"authenticated": True})

    @sio.event
    async def disconnect(sid):
        print(f"Client disconnected: {sid}")
        try:
            await sio.leave_room(sid, _RUNTIME_LOGS_ROOM)
        except Exception:
            pass
        await _emit_runtime_log("info", f"Cliente desconectado: {sid[:8]}...", source="socket")

    @sio.event
    async def subscribe_runtime_logs(sid):
        """Cliente passa a receber eventos `runtime_log` (ex.: área de logs nas configurações)."""
        await sio.enter_room(sid, _RUNTIME_LOGS_ROOM)

    @sio.event
    async def unsubscribe_runtime_logs(sid):
        try:
            await sio.leave_room(sid, _RUNTIME_LOGS_ROOM)
        except Exception:
            pass

    @sio.event
    async def get_runtime_logs(sid):
        await sio.emit("runtime_logs_snapshot", {"logs": list(_RUNTIME_LOGS)}, room=sid)

    @sio.event
    async def clear_runtime_logs(sid):
        _RUNTIME_LOGS.clear()
        await sio.emit("runtime_logs_snapshot", {"logs": []})
        await _emit_runtime_log("info", "Logs em memória limpos pela UI.", source="logs")

    @sio.event
    async def orbital_sync_boot(sid, data=None):
        """Reemite auth_status para o renderer (evita race se o UI montar após o connect)."""
        if st.authenticator is None:
            await sio.emit("auth_status", {"authenticated": True}, room=sid)
            return
        if st.authenticator.authenticated:
            await sio.emit("auth_status", {"authenticated": True}, room=sid)
        elif SETTINGS.get("face_auth_enabled", False):
            await sio.emit("auth_status", {"authenticated": False}, room=sid)
        else:
            await sio.emit("auth_status", {"authenticated": True}, room=sid)

    @sio.event
    async def start_audio(sid, data=None):
        if SETTINGS.get("face_auth_enabled", False):
            if st.authenticator and not st.authenticator.authenticated:
                print("Blocked start_audio: Not authenticated.")
                await sio.emit("error", {"msg": "Authentication Required"})
                return

        print("Starting Audio Loop...")
        await _emit_runtime_log("info", "Iniciando loop de audio...", source="audio", room=sid)

        device_index = None
        device_name = None
        input_gain = 1.0
        output_device_index = None
        output_device_name = None
        vad_rms_threshold = None
        vad_silence_duration_sec = None
        if data:
            if "device_index" in data:
                device_index = data["device_index"]
            if "device_name" in data:
                device_name = data["device_name"]
            if data.get("input_gain") is not None:
                try:
                    input_gain = float(data["input_gain"])
                except (TypeError, ValueError):
                    input_gain = 1.0
            if "output_device_index" in data:
                output_device_index = data["output_device_index"]
            if "output_device_name" in data and data["output_device_name"]:
                output_device_name = str(data["output_device_name"])
            if data.get("audio_vad_threshold") is not None:
                try:
                    vad_rms_threshold = int(data["audio_vad_threshold"])
                except (TypeError, ValueError):
                    vad_rms_threshold = None
            if data.get("audio_vad_silence_sec") is not None:
                try:
                    vad_silence_duration_sec = float(data["audio_vad_silence_sec"])
                except (TypeError, ValueError):
                    vad_silence_duration_sec = None

        print(f"Using input device: Name='{device_name}', Index={device_index}, input_gain={input_gain}")
        await _emit_runtime_log(
            "debug",
            f"Dispositivo de entrada: name={device_name!r} index={device_index!r} gain={input_gain:.2f}",
            source="audio",
            room=sid,
        )

        _ai_bars_last_emit = [0.0]

        def on_audio_data(data_bytes):
            now = time.monotonic()
            # Limita ~45 Hz: cada chunk PCM gerava uma task asyncio + evento Socket.IO (pesado em sessões longas).
            if now - _ai_bars_last_emit[0] < (1.0 / 45.0):
                return
            _ai_bars_last_emit[0] = now
            bars = pcm16_to_energy_bars(data_bytes, bars=64)
            asyncio.create_task(sio.emit("audio_data", {"data": bars}))

        def on_transcription(data):
            if st.audio_loop and st.audio_loop.paused and data.get("sender") == "User":
                return
            asyncio.create_task(sio.emit("transcription", data))

        def on_tool_confirmation(data):
            print(f"Requesting confirmation for tool: {data.get('tool')}")
            _log_entry("warn", f"Aguardando confirmacao da tool: {data.get('tool')}", source="tools")
            asyncio.create_task(sio.emit("tool_confirmation_request", data))

        def on_project_update(project_name):
            print(f"Sending Project Update: {project_name}")
            asyncio.create_task(sio.emit("project_update", {"project": project_name}))

        def on_error(msg):
            print(f"Sending Error to frontend: {msg}")
            _log_entry("error", str(msg), source="audio")
            asyncio.create_task(sio.emit("error", {"msg": msg}))

        def on_runtime_log(level, message, source="audio"):
            asyncio.create_task(_emit_runtime_log(level, message, source=source))

        def on_image_generated(image_b64, mime_type, caption=None, image_relpath=None):
            cap = (caption or "Imagem gerada").strip() or "Imagem gerada"
            pm = getattr(st.audio_loop, "project_manager", None) if st.audio_loop else None
            if pm and image_relpath:
                pm.log_chat(
                    "ATHENAS",
                    cap,
                    mime_type=mime_type or "image/png",
                    image_relpath=image_relpath,
                )
            asyncio.create_task(
                sio.emit(
                    "image_generated",
                    {
                        "data": image_b64,
                        "mime_type": mime_type or "image/png",
                        "caption": cap,
                        "image_relpath": image_relpath,
                    },
                )
            )

        async with st.audio_control_lock:
            if st.loop_task and not st.loop_task.done():
                print("Audio loop task already running. Ignoring duplicate start request.")
                await sio.emit("status", {"msg": "A.D.A Already Running"})
                return

            if st.loop_task and st.loop_task.done():
                st.loop_task = None
            if st.audio_loop and not st.loop_task:
                st.audio_loop = None

            try:
                print(f"Initializing AudioLoop with device_index={device_index}")
                st.audio_loop = athenas.AudioLoop(
                    video_mode="none",
                    on_audio_data=on_audio_data,
                    on_transcription=on_transcription,
                    on_tool_confirmation=on_tool_confirmation,
                    on_project_update=on_project_update,
                    on_error=on_error,
                    on_image_generated=on_image_generated,
                    on_runtime_log=on_runtime_log,
                    input_device_index=device_index,
                    input_device_name=device_name,
                    output_device_index=output_device_index,
                    output_device_name=output_device_name,
                    input_gain=input_gain,
                    vad_rms_threshold=vad_rms_threshold,
                    vad_silence_duration_sec=vad_silence_duration_sec,
                )
                print("AudioLoop initialized successfully.")

                st.audio_loop.update_permissions(SETTINGS["tool_permissions"])

                if data and data.get("muted", False):
                    print("Starting with Audio Paused")
                    st.audio_loop.set_paused(True)

                print("Creating asyncio task for AudioLoop.run()")
                st.loop_task = asyncio.create_task(st.audio_loop.run())

                def handle_loop_exit(task):
                    try:
                        task.result()
                    except asyncio.CancelledError:
                        print("Audio Loop Cancelled")
                    except BaseExceptionGroup as eg:
                        # TaskGroup / Live pode terminar com ExceptionGroup (não subclasse de Exception).
                        print(f"Audio Loop ExceptionGroup: {eg}")
                    except Exception as e:
                        print(f"Audio Loop Crashed: {e}")
                    finally:
                        if st.loop_task is task:
                            st.loop_task = None
                            st.audio_loop = None

                st.loop_task.add_done_callback(handle_loop_exit)

                print("Emitting 'A.D.A Started'")
                await sio.emit("status", {"msg": "A.D.A Started"})
                await _emit_runtime_log("info", "ATHENAS iniciada (A.D.A Started).", source="audio")

            except Exception as e:
                print(f"CRITICAL ERROR STARTING ATHENAS (audio loop): {e}")
                import traceback

                traceback.print_exc()
                await sio.emit("error", {"msg": f"Failed to start: {str(e)}"})
                await _emit_runtime_log("error", f"Falha ao iniciar audio loop: {e}", source="audio")
                st.audio_loop = None
                st.loop_task = None

    @sio.event
    async def stop_audio(sid):
        async with st.audio_control_lock:
            if st.audio_loop or st.loop_task:
                print("Stopping Audio Loop")
                await shutdown_audio_loop(reason="stop_audio_event")
                await sio.emit("status", {"msg": "A.D.A Stopped"})
                await _emit_runtime_log("info", "ATHENAS parada (A.D.A Stopped).", source="audio")

    @sio.event
    async def pause_audio(sid):
        if st.audio_loop:
            st.audio_loop.set_paused(True)
            print("Pausing Audio")
            await sio.emit("status", {"msg": "Audio Paused"})
            await _emit_runtime_log("debug", "Audio pausado.", source="audio")

    @sio.event
    async def resume_audio(sid):
        if st.audio_loop:
            st.audio_loop.set_paused(False)
            print("Resuming Audio")
            await sio.emit("status", {"msg": "Audio Resumed"})
            await _emit_runtime_log("debug", "Audio retomado.", source="audio")

    @sio.event
    async def set_mic_input_gain(sid, data):
        if not st.audio_loop or not data:
            return
        try:
            g = float(data.get("gain", 1.0))
        except (TypeError, ValueError):
            return
        st.audio_loop.set_input_gain(g)
        print(f"[SERVER] Mic input gain updated to {st.audio_loop.input_gain}")
        # Não logar em runtime_log: o slider dispara dezenas de eventos e enche Redis/Socket com debug.

    @sio.event
    async def set_voice_detection(sid, data):
        """Ajuste de VAD (microfone) sem reiniciar o loop; aplica no próximo bloco."""
        if not st.audio_loop or not isinstance(data, dict):
            return
        rms = data.get("rms_threshold")
        silence_sec = data.get("silence_sec")
        if rms is None and silence_sec is None:
            return
        st.audio_loop.set_vad_params(
            rms_threshold=rms,
            silence_duration_sec=silence_sec,
        )

    @sio.event
    async def confirm_tool(sid, data):
        request_id = data.get("id")
        confirmed = data.get("confirmed", False)
        print(f"[SERVER DEBUG] Received confirmation response for {request_id}: {confirmed}")
        if st.audio_loop:
            st.audio_loop.resolve_tool_confirmation(request_id, confirmed)
        else:
            print("Audio loop not active, cannot resolve confirmation.")

    @sio.event
    async def shutdown(sid, data=None):
        print("[SERVER] ========================================")
        print("[SERVER] SHUTDOWN SIGNAL RECEIVED FROM FRONTEND")
        print("[SERVER] ========================================")

        async with st.audio_control_lock:
            await shutdown_audio_loop(reason="shutdown_event")

        if st.authenticator:
            print("[SERVER] Stopping Authenticator...")
            st.authenticator.stop()

        print("[SERVER] Graceful shutdown complete. Terminating process...")
        os._exit(0)

    @sio.event
    async def user_input(sid, data):
        if not isinstance(data, dict):
            data = {}
        text = (data.get("text") or "").strip()
        print(f"[SERVER DEBUG] User input received: text={text!r}")

        if not st.audio_loop:
            print("[SERVER DEBUG] [Error] Audio loop is None. Cannot send text.")
            await sio.emit(
                "error",
                {"msg": "Backend não está pronto. Reinicie o servidor ou aguarde a inicialização."},
                room=sid,
            )
            return

        if not st.audio_loop.session:
            print("[SERVER DEBUG] [Error] Session is None. Cannot send text.")
            await sio.emit(
                "error",
                {
                    "msg": "A sessão com a IA ainda não está ativa. Aguarde conectar o microfone (botão ligar) e tente de novo.",
                },
                room=sid,
            )
            return

        parsed, err = _normalize_chat_image_payload(data)
        if err == "too_large":
            await sio.emit("error", {"msg": "Imagem muito grande. Tente uma menor (ex.: captura de tela JPEG)."})
            return
        if parsed is not None:
            image_b64, mime_type = parsed
            log_line = text if text else "[imagem enviada no chat]"
            image_relpath_saved = None
            try:
                raw_bytes = base64.b64decode((image_b64 or "").strip(), validate=False)
                if raw_bytes:
                    saved = save_chat_upload_image_to_data_dir(raw_bytes, mime_type)
                    if saved is not None:
                        image_relpath_saved = repo_relative_posix(saved)
            except (binascii.Error, ValueError, OSError) as e:
                print(f"[SERVER DEBUG] Falha ao gravar anexo do chat no disco: {e}")
            if st.audio_loop.project_manager:
                st.audio_loop.project_manager.log_chat(
                    "User",
                    log_line,
                    mime_type=mime_type,
                    image_relpath=image_relpath_saved,
                )
            print(f"[SERVER DEBUG] Sending chat image + text={text!r}")
            try:
                await st.audio_loop.send_user_image_with_text(image_b64, mime_type, text)
            except Exception as e:
                print(f"[SERVER DEBUG] Chat image send failed: {e}")
                await sio.emit("error", {"msg": f"Não foi possível enviar a imagem para a IA: {e}"})
                return
            print("[SERVER DEBUG] Chat image sent to model successfully.")
            return

        if not text:
            print("[SERVER DEBUG] Empty text and no image; ignoring.")
            return

        print(f"[SERVER DEBUG] Sending message to model: '{text}'")

        if st.audio_loop.project_manager:
            st.audio_loop.project_manager.log_chat("User", text)

        await st.audio_loop.send_user_text_chat(text)
        print("[SERVER DEBUG] Message sent to model successfully.")

    @sio.event
    async def get_chat_history(sid, data=None):
        try:
            limit = 120
            if isinstance(data, dict):
                requested = data.get("limit")
                if isinstance(requested, int):
                    limit = max(1, min(500, requested))

            if st.audio_loop and st.audio_loop.project_manager:
                pm = st.audio_loop.project_manager
            else:
                pm = ProjectManager(str(PROJECT_ROOT))

            history = pm.get_recent_chat_history(limit=limit)
            await sio.emit(
                "chat_history",
                {"project": pm.current_project, "messages": history},
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] Failed to load chat history: {e}")
            await sio.emit("chat_history", {"project": "OrbitalSync", "messages": []}, room=sid)

    @sio.event
    async def video_frame(sid, data):
        image_data = data.get("image")
        if image_data and st.audio_loop:
            asyncio.create_task(st.audio_loop.send_frame(image_data))

    @sio.event
    async def get_settings(sid):
        payload = dict(SETTINGS)
        _append_settings_runtime_fields(payload)
        await sio.emit("settings", payload)

    @sio.event
    async def save_server_credentials(sid, data=None):
        """Grava `data/local_credentials.json`, reaplica env, recarrega Supabase e cliente Gemini."""
        try:
            from orbital.assistant.gemini_setup import refresh_gemini_client
            from orbital.services.supabase_remote_config import try_apply_supabase_config

            if not isinstance(data, dict):
                await sio.emit(
                    "server_credentials_save_result",
                    {"ok": False, "message": "Dados inválidos."},
                    room=sid,
                )
                return
            ok, msg = merge_save_and_apply(data)
            if ok:
                try:
                    try_apply_supabase_config(SETTINGS)
                except Exception as e:
                    print(f"[SERVER] Supabase reload após credenciais: {e!r}")
                apply_semantic_memory_defaults(SETTINGS)
                try:
                    refresh_gemini_client()
                except Exception as e:
                    print(f"[SERVER] Gemini refresh: {e!r}")
            await _emit_full_settings()
            await sio.emit(
                "server_credentials_save_result",
                {"ok": ok, "message": msg or ("OK" if ok else "Erro")},
                room=sid,
            )
            await _emit_runtime_log(
                "info" if ok else "error",
                f"Salvar credenciais: {'OK' if ok else 'falhou'} - {msg or ''}".strip(" -"),
                source="credentials",
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] save_server_credentials: {e!r}")
            await sio.emit(
                "server_credentials_save_result",
                {"ok": False, "message": str(e)[:500]},
                room=sid,
            )
            await _emit_runtime_log(
                "error",
                f"Excecao em save_server_credentials: {e}",
                source="credentials",
                room=sid,
            )

    @sio.event
    async def get_dotenv_file(sid):
        """Devolve o texto do `.env` na raiz do repo (apenas ligações locais)."""
        try:
            from orbital.services.dotenv_file import DOTENV_PATH, dotenv_path_display, read_dotenv_file

            ok, text, err = read_dotenv_file()
            await sio.emit(
                "dotenv_file_content",
                {
                    "ok": ok,
                    "path": dotenv_path_display(),
                    "exists": DOTENV_PATH.is_file(),
                    "content": text if ok else "",
                    "message": err if not ok else "",
                },
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] get_dotenv_file: {e!r}")
            await sio.emit(
                "dotenv_file_content",
                {"ok": False, "path": "", "exists": False, "content": "", "message": str(e)[:500]},
                room=sid,
            )

    @sio.event
    async def save_dotenv_file(sid, data=None):
        """Grava `.env`, reaplica env (com override do JSON local) e refresca Supabase/Gemini."""
        try:
            from orbital.assistant.gemini_setup import refresh_gemini_client
            from orbital.services.dotenv_file import dotenv_path_display, write_dotenv_file
            from orbital.services.local_credentials import reload_env_from_dotenv_and_file
            from orbital.services.supabase_remote_config import try_apply_supabase_config

            if not isinstance(data, dict):
                await sio.emit(
                    "dotenv_file_save_result",
                    {"ok": False, "message": "Dados inválidos."},
                    room=sid,
                )
                return
            content = data.get("content")
            if not isinstance(content, str):
                await sio.emit(
                    "dotenv_file_save_result",
                    {"ok": False, "message": "Campo content deve ser texto."},
                    room=sid,
                )
                return
            ok, err = write_dotenv_file(content)
            if ok:
                try:
                    reload_env_from_dotenv_and_file()
                except Exception as e:
                    print(f"[SERVER] reload após .env: {e!r}")
                try:
                    try_apply_supabase_config(SETTINGS)
                except Exception as e:
                    print(f"[SERVER] Supabase reload após .env: {e!r}")
                apply_semantic_memory_defaults(SETTINGS)
                try:
                    refresh_gemini_client()
                except Exception as e:
                    print(f"[SERVER] Gemini refresh após .env: {e!r}")
            await _emit_full_settings()
            await sio.emit(
                "dotenv_file_save_result",
                {
                    "ok": ok,
                    "message": (err or "Ficheiro .env gravado.") if ok else (err or "Erro ao gravar."),
                    "path": dotenv_path_display(),
                },
                room=sid,
            )
            await _emit_runtime_log(
                "info" if ok else "error",
                f"Salvar .env: {'OK' if ok else 'falhou'} - {(err or '').strip()}".strip(" -"),
                source="dotenv",
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] save_dotenv_file: {e!r}")
            await sio.emit(
                "dotenv_file_save_result",
                {"ok": False, "message": str(e)[:500]},
                room=sid,
            )
            await _emit_runtime_log("error", f"Excecao em save_dotenv_file: {e}", source="dotenv", room=sid)

    @sio.event
    async def reveal_setting_secret(sid, data=None):
        """Devolve uma chave do ambiente atual (.env + local_credentials) para preencher a UI local."""
        try:
            from orbital.services.local_credentials import reload_env_from_dotenv_and_file

            reload_env_from_dotenv_and_file()
            if not isinstance(data, dict):
                await sio.emit(
                    "setting_secret_revealed",
                    {"ok": False, "field": "", "value": "", "message": "Dados inválidos."},
                    room=sid,
                )
                return
            field = str(data.get("field") or "").strip()
            if field == "gemini_api_key":
                val = (os.getenv("GEMINI_API_KEY") or "").strip()
            elif field == "supabase_service_role_key":
                val = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
                if not val:
                    val = (os.getenv("SUPABASE_ANON_KEY") or "").strip()
            else:
                await sio.emit(
                    "setting_secret_revealed",
                    {"ok": False, "field": field, "value": "", "message": "Campo não suportado."},
                    room=sid,
                )
                return
            await sio.emit(
                "setting_secret_revealed",
                {"ok": True, "field": field, "value": val, "message": ""},
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] reveal_setting_secret: {e!r}")
            await sio.emit(
                "setting_secret_revealed",
                {
                    "ok": False,
                    "field": str((data or {}).get("field") or ""),
                    "value": "",
                    "message": str(e)[:500],
                },
                room=sid,
            )

    @sio.event
    async def test_integrations(sid, data=None):
        """Ping Supabase, ComfyUI e webhooks (HEAD/GET; em /webhook/ com GET 404, POST JSON de probe). Logs: ORBITAL_INTEGRATION_TEST_LOG=1."""
        try:
            from orbital.services.integration_connectivity import run_all_integration_tests

            comfy_base = (os.getenv("COMFYUI_BASE_URL") or "http://127.0.0.1:2000").strip().rstrip("/")
            results = await asyncio.to_thread(run_all_integration_tests, comfy_base)
            await sio.emit(
                "integration_test_result",
                {"ok": True, "results": results},
                room=sid,
            )
        except Exception as e:
            await sio.emit(
                "integration_test_result",
                {"ok": False, "error": str(e)[:500]},
                room=sid,
            )

    @sio.event
    async def update_settings(sid, data):
        print(f"Updating settings: {data}")
        keys = list(data.keys()) if isinstance(data, dict) else []
        await _emit_runtime_log(
            "debug",
            f"update_settings keys={keys}",
            source="settings",
            room=sid,
        )

        if "tool_permissions" in data:
            SETTINGS["tool_permissions"].update(data["tool_permissions"])
            if st.audio_loop:
                st.audio_loop.update_permissions(SETTINGS["tool_permissions"])

        if "face_auth_enabled" in data:
            SETTINGS["face_auth_enabled"] = data["face_auth_enabled"]
            if not data["face_auth_enabled"]:
                await sio.emit("auth_status", {"authenticated": True})
                if st.authenticator:
                    st.authenticator.stop()

        if "camera_flipped" in data:
            SETTINGS["camera_flipped"] = data["camera_flipped"]
            print(f"[SERVER] Camera flip set to: {data['camera_flipped']}")

        if "semantic_search_enabled" in data:
            SETTINGS["semantic_search_enabled"] = bool(data["semantic_search_enabled"])
        if "semantic_embed_index" in data:
            SETTINGS["semantic_embed_index"] = bool(data["semantic_embed_index"])
        if "semantic_embed_senders" in data:
            s = str(data["semantic_embed_senders"] or "").strip()
            SETTINGS["semantic_embed_senders"] = s or "User, ATHENAS"
        if "chat_startup_context_limit" in data:
            try:
                SETTINGS["chat_startup_context_limit"] = max(
                    10, min(500, int(data["chat_startup_context_limit"]))
                )
            except (TypeError, ValueError):
                pass
        if "semantic_embed_min_length" in data:
            try:
                SETTINGS["semantic_embed_min_length"] = max(
                    0, min(500, int(data["semantic_embed_min_length"]))
                )
            except (TypeError, ValueError):
                pass
        if "semantic_embed_max_chars" in data:
            try:
                SETTINGS["semantic_embed_max_chars"] = max(
                    200, min(8000, int(data["semantic_embed_max_chars"]))
                )
            except (TypeError, ValueError):
                pass

        save_settings()
        await _emit_full_settings()

    @sio.event
    async def add_launch_app(sid, data):
        try:
            if not isinstance(data, dict):
                await sio.emit(
                    "launch_app_add_result",
                    {"ok": False, "message": "Dados inválidos."},
                    room=sid,
                )
                return
            path = str(data.get("path", "") or "").strip()
            if not path:
                await sio.emit(
                    "launch_app_add_result",
                    {"ok": False, "message": "Selecione um executável."},
                    room=sid,
                )
                return
            app_id = data.get("id") or data.get("app_id")
            if isinstance(app_id, str) and not app_id.strip():
                app_id = None
            label = data.get("label")
            if isinstance(label, str) and not label.strip():
                label = None
            desc = str(data.get("description", "") or "")
            ok, msg = add_launch_app_entry(path, app_id=app_id, label=label, description=desc)
            await sio.emit("launch_app_add_result", {"ok": ok, "message": msg}, room=sid)
            if ok:
                await _emit_full_settings()
        except Exception as e:
            await sio.emit(
                "launch_app_add_result",
                {"ok": False, "message": repr(e)},
                room=sid,
            )

    @sio.event
    async def trigger_webhook(sid, data):
        try:
            if not isinstance(data, dict):
                await sio.emit(
                    "webhook_result",
                    {"ok": False, "error": "Invalid data"},
                    room=sid,
                )
                return
            hook_id = data.get("hook_id")
            payload = data.get("payload")
            if not hook_id:
                await sio.emit(
                    "webhook_result",
                    {"ok": False, "error": "hook_id required"},
                    room=sid,
                )
                return
            pl = normalize_trigger_webhook_payload(payload, data)
            cfg = load_webhooks_config()
            status, text = await fire_webhook_by_id(cfg, hook_id, pl)
            ok = 200 <= status < 300
            await sio.emit(
                "webhook_result",
                {"ok": ok, "status": status, "body": text[:2000]},
                room=sid,
            )
        except Exception as e:
            await sio.emit(
                "webhook_result",
                {"ok": False, "error": str(e)},
                room=sid,
            )

    @sio.event
    async def get_tool_permissions(sid):
        await sio.emit("tool_permissions", SETTINGS["tool_permissions"])

    @sio.event
    async def update_tool_permissions(sid, data):
        print(f"Updating permissions (legacy event): {data}")
        SETTINGS["tool_permissions"].update(data)
        save_settings()
        if st.audio_loop:
            st.audio_loop.update_permissions(SETTINGS["tool_permissions"])
        await sio.emit("tool_permissions", SETTINGS["tool_permissions"])
