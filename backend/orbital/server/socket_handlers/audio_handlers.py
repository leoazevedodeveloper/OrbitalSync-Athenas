"""Socket.IO: loop de áudio ATHENAS, VAD e encerramento do processo."""
from __future__ import annotations

import asyncio
import os
import sys
import time

if sys.version_info < (3, 11):
    from exceptiongroup import BaseExceptionGroup

import athenas

from orbital.settings import SETTINGS

from .. import state as st
from ..audio import pcm16_to_energy_bars, shutdown_audio_loop
from .common import log_entry


def register_audio_handlers(sio, emit_runtime_log):
    @sio.event
    async def start_audio(sid, data=None):
        if SETTINGS.get("face_auth_enabled", False):
            if st.authenticator and not st.authenticator.authenticated:
                print("Blocked start_audio: Not authenticated.")
                await sio.emit("error", {"msg": "Authentication Required"})
                return

        print("Starting Audio Loop...")
        await emit_runtime_log("info", "Iniciando loop de audio...", source="audio", room=sid)

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
        await emit_runtime_log(
            "debug",
            f"Dispositivo de entrada: name={device_name!r} index={device_index!r} gain={input_gain:.2f}",
            source="audio",
            room=sid,
        )

        _ai_bars_last_emit = [0.0]

        def _targeted_emit(event, data, *, ui_only=False):
            target = st.response_target_sid
            if ui_only and target is None:
                return
            kwargs = {"room": target} if target else {}
            return asyncio.create_task(sio.emit(event, data, **kwargs))

        def on_audio_data(data_bytes):
            now = time.monotonic()
            if now - _ai_bars_last_emit[0] < (1.0 / 45.0):
                return
            _ai_bars_last_emit[0] = now
            bars = pcm16_to_energy_bars(data_bytes, bars=64)
            _targeted_emit("audio_data", {"data": bars}, ui_only=True)

        def on_audio_stream(pcm_bytes):
            import base64 as _b64
            _targeted_emit("audio_pcm", {"data": _b64.b64encode(pcm_bytes).decode()}, ui_only=True)

        def on_transcription(data):
            if st.audio_loop and st.audio_loop.paused and data.get("sender") == "User":
                return
            _targeted_emit("transcription", data, ui_only=True)

        def on_tool_confirmation(data):
            print(f"Requesting confirmation for tool: {data.get('tool')}")
            log_entry("warn", f"Aguardando confirmacao da tool: {data.get('tool')}", source="tools")
            _targeted_emit("tool_confirmation_request", data, ui_only=True)

        def on_project_update(project_name):
            print(f"Sending Project Update: {project_name}")
            asyncio.create_task(sio.emit("project_update", {"project": project_name}))

        def on_error(msg):
            print(f"Sending Error to frontend: {msg}")
            log_entry("error", str(msg), source="audio")
            asyncio.create_task(sio.emit("error", {"msg": msg}))

        def on_runtime_log(level, message, source="audio"):
            asyncio.create_task(emit_runtime_log(level, message, source=source))

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
            _targeted_emit(
                "image_generated",
                {
                    "data": image_b64,
                    "mime_type": mime_type or "image/png",
                    "caption": cap,
                    "image_relpath": image_relpath,
                },
                ui_only=True,
            )

        def on_timer_event(payload):
            _targeted_emit("assistant_timer", payload, ui_only=True)

        def on_calendar_event(payload):
            _targeted_emit("assistant_calendar", payload, ui_only=True)

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
                    on_audio_stream=on_audio_stream,
                    on_transcription=on_transcription,
                    on_tool_confirmation=on_tool_confirmation,
                    on_project_update=on_project_update,
                    on_error=on_error,
                    on_image_generated=on_image_generated,
                    on_timer_event=on_timer_event,
                    on_calendar_event=on_calendar_event,
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

                st.set_response_target(sid)
                print("Creating asyncio task for AudioLoop.run()")
                st.loop_task = asyncio.create_task(st.audio_loop.run())

                def handle_loop_exit(task):
                    try:
                        task.result()
                    except asyncio.CancelledError:
                        print("Audio Loop Cancelled")
                    except BaseExceptionGroup as eg:
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
                await emit_runtime_log("info", "ATHENAS iniciada (A.D.A Started).", source="audio")

            except Exception as e:
                print(f"CRITICAL ERROR STARTING ATHENAS (audio loop): {e}")
                import traceback

                traceback.print_exc()
                await sio.emit("error", {"msg": f"Failed to start: {str(e)}"})
                await emit_runtime_log("error", f"Falha ao iniciar audio loop: {e}", source="audio")
                st.audio_loop = None
                st.loop_task = None

    @sio.event
    async def stop_audio(sid):
        async with st.audio_control_lock:
            if st.audio_loop or st.loop_task:
                print("Stopping Audio Loop")
                await shutdown_audio_loop(reason="stop_audio_event")
                if st.response_target_sid == sid:
                    st.set_response_target(None)
                await sio.emit("status", {"msg": "A.D.A Stopped"})
                await emit_runtime_log("info", "ATHENAS parada (A.D.A Stopped).", source="audio")

    @sio.event
    async def pause_audio(sid):
        if st.audio_loop:
            st.audio_loop.set_paused(True)
            print("Pausing Audio")
            await sio.emit("status", {"msg": "Audio Paused"})
            await emit_runtime_log("debug", "Audio pausado.", source="audio")

    @sio.event
    async def resume_audio(sid):
        if st.audio_loop:
            st.audio_loop.set_paused(False)
            print("Resuming Audio")
            await sio.emit("status", {"msg": "Audio Resumed"})
            await emit_runtime_log("debug", "Audio retomado.", source="audio")

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
