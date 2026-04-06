"""Loop principal de áudio/vídeo e sessão Gemini Live (ATHENAS)."""
import asyncio
import base64
import binascii
import io
import json
import math
import os
import struct
import sys
import time
import traceback
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import cv2
import PIL.Image
from google.genai import errors as genai_errors
from google.genai import types

if sys.version_info < (3, 11, 0):
    from exceptiongroup import BaseExceptionGroup

if sys.version_info < (3, 11, 0):
    import taskgroup
    import exceptiongroup

    asyncio.TaskGroup = taskgroup.TaskGroup
    asyncio.ExceptionGroup = exceptiongroup.ExceptionGroup

from orbital.services.integrations.comfyui_client import generate_image_via_comfyui, resolved_comfyui_workflow_path


def _chat_startup_history_limit() -> int:
    """Últimas N mensagens injectadas na sessão Live ao ligar / reconnect (SETTINGS ou ORBITAL_CHAT_STARTUP_CONTEXT_LIMIT)."""
    if "ORBITAL_CHAT_STARTUP_CONTEXT_LIMIT" in os.environ:
        raw = (os.getenv("ORBITAL_CHAT_STARTUP_CONTEXT_LIMIT") or "").strip()
        if raw:
            try:
                return max(10, min(500, int(raw)))
            except ValueError:
                pass
    try:
        from orbital.settings import SETTINGS

        return max(10, min(500, int(SETTINGS.get("chat_startup_context_limit", 100))))
    except Exception:
        return 100
from orbital.services.integrations.launch_apps import launch_app_by_id, list_launch_apps_catalog
from orbital.services.integrations.agenda_google import (
    delete_google_calendar_event,
    find_google_event_id_for_title_at,
)
from orbital.services.integrations.webhook_config import (
    ATHENA_GOOGLE_CALENDAR_HOOK_ID,
    coerce_tool_args,
    fire_webhook_by_id,
    load_webhooks_config,
    normalize_trigger_webhook_payload,
)

from .constants import (
    CHANNELS,
    CHUNK_SIZE,
    DEFAULT_MODE,
    FORMAT,
    MODEL,
    RECEIVE_SAMPLE_RATE,
    SEND_SAMPLE_RATE,
)
from .gemini_setup import config, get_gemini_client
from .pyaudio_ctx import pya


def _leaf_exceptions(exc: BaseException):
    """Expõe exceções reais dentro de ExceptionGroup (ex.: falha do TaskGroup)."""
    if isinstance(exc, BaseExceptionGroup):
        for e in exc.exceptions:
            yield from _leaf_exceptions(e)
    else:
        yield exc


def _parse_reminder_starts_at(raw: str):
    """Retorna (unix_timestamp ou None, mensagem de erro ou None)."""
    s = str(raw or "").strip()
    if not s:
        return None, "data/hora vazia"
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None, "ISO 8601 inválido"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
    return dt.timestamp(), None


def _normalize_reminder_iso(raw: str) -> str:
    """ISO 8601 normalizado para envio ao n8n (mesma lógica de fuso que starts)."""
    s = str(raw or "").strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
    return dt.isoformat()


class AudioLoop:
    def __init__(
        self,
        video_mode=DEFAULT_MODE,
        on_audio_data=None,
        on_video_frame=None,
        on_transcription=None,
        on_tool_confirmation=None,
        on_project_update=None,
        on_error=None,
        on_image_generated=None,
        on_timer_event=None,
        on_calendar_event=None,
        on_runtime_log=None,
        input_device_index=None,
        input_device_name=None,
        output_device_index=None,
        output_device_name=None,
        input_gain=1.0,
        vad_rms_threshold=None,
        vad_silence_duration_sec=None,
    ):
        self.video_mode = video_mode
        self.on_audio_data = on_audio_data
        self.on_video_frame = on_video_frame
        self.on_transcription = on_transcription
        self.on_tool_confirmation = on_tool_confirmation 
        self.on_project_update = on_project_update
        self.on_error = on_error
        self.on_image_generated = on_image_generated
        self.on_timer_event = on_timer_event
        self.on_calendar_event = on_calendar_event
        self.on_runtime_log = on_runtime_log
        self.input_device_index = input_device_index
        self.input_device_name = input_device_name
        self.output_device_index = output_device_index
        self.output_device_name = output_device_name or None
        self.set_input_gain(input_gain)
        try:
            v = int(vad_rms_threshold) if vad_rms_threshold is not None else 900
        except (TypeError, ValueError):
            v = 900
        self.vad_rms_threshold = max(200, min(3000, v))
        try:
            s = float(vad_silence_duration_sec) if vad_silence_duration_sec is not None else 0.22
        except (TypeError, ValueError):
            s = 0.22
        self.vad_silence_duration_sec = max(0.08, min(0.85, s))

        self.audio_in_queue = None
        self.out_queue = None
        self.paused = False

        self.chat_buffer = {"sender": None, "text": ""} # For aggregating chunks
        
        # Track last transcription text to calculate deltas (Gemini sends cumulative text)
        self._last_input_transcription = ""
        self._last_output_transcription = ""

        self.audio_in_queue = None
        self.out_queue = None
        self.paused = False

        self.session = None

        # Evita envios concorrentes ao Live (ex.: frame da câmera no meio de imagem+texto do chat).
        self._session_send_lock = asyncio.Lock()
        # Quando o turno veio do chat (texto/imagem), não tratar input_transcription como "usuário falando"
        # — senão clear_audio_queue apaga o áudio da própria resposta do modelo.
        self._chat_utterance_pending = False

        self.send_text_task = None
        self.stop_event = asyncio.Event()
        
        self.stop_event = asyncio.Event()
        
        self.permissions = {} # Default Empty (Will treat unset as True)
        self._pending_confirmations = {}
        self._assistant_timer_tasks: set = set()

        # Video buffering state
        self._latest_image_payload = None
        # VAD State
        self._is_speaking = False
        self._silence_start_time = None
        # Ao detectar o "início" de uma fala (VAD), usamos um timestamp para evitar
        # limpar o áudio da IA repetidamente e cortar frases inteiras.
        self._speech_utterance_started_at = None
        # Para evitar corte repetido: só interrompe playback 1 vez por utterance.
        self._did_interrupt_for_current_utterance = False
        
        # True após primeira sessão Live que passou pelo inject de histórico (para não confundir retry com reconnect).
        self._had_successful_live_connect = False
        # Após inject com end_of_turn=True o modelo gera um turno; descartamos só esse (áudio + transcrição) para não ouvir resumo no arranque.
        self._startup_output_turns_to_skip = 0

        # Initialize ProjectManager
        from orbital.services.project_manager import ProjectManager

        _here = os.path.abspath(__file__)
        _backend_root = os.path.dirname(os.path.dirname(os.path.dirname(_here)))
        project_root = os.path.dirname(_backend_root)
        self.project_manager = ProjectManager(project_root)
        
        # Sync Initial Project State
        if self.on_project_update:
            # We need to defer this slightly or just call it. 
            # Since this is init, loop might not be running, but on_project_update in server.py uses asyncio.create_task which needs a loop.
            # We will handle this by calling it in run() or just print for now.
            pass

    def _runtime_log(self, level: str, message: str, source: str = "audio"):
        cb = getattr(self, "on_runtime_log", None)
        if not cb:
            return
        try:
            cb(level, message, source)
        except Exception:
            pass

    def flush_chat(self):
        """Forces the current chat buffer to be written to log."""
        if self.chat_buffer["sender"] and self.chat_buffer["text"].strip():
            self.project_manager.log_chat(self.chat_buffer["sender"], self.chat_buffer["text"])
            self.chat_buffer = {"sender": None, "text": ""}
        # Reset transcription tracking for new turn
        self._last_input_transcription = ""
        self._last_output_transcription = ""
        self._chat_utterance_pending = False

    def update_permissions(self, new_perms):
        print(f"[ADA DEBUG] [CONFIG] Updating tool permissions: {new_perms}")
        self.permissions.update(new_perms)

    def set_input_gain(self, gain):
        """Ganho linear no PCM de entrada (0.25–4.0). Ajuda microfones baixos; valores altos podem distorcer."""
        try:
            g = float(gain)
        except (TypeError, ValueError):
            g = 1.0
        self.input_gain = max(0.25, min(4.0, g))

    def set_vad_params(self, rms_threshold=None, silence_duration_sec=None):
        """Ajuste fino de VAD em tempo real (próximo chunk de microfone)."""
        if rms_threshold is not None:
            try:
                v = int(rms_threshold)
            except (TypeError, ValueError):
                v = self.vad_rms_threshold
            self.vad_rms_threshold = max(200, min(3000, v))
        if silence_duration_sec is not None:
            try:
                s = float(silence_duration_sec)
            except (TypeError, ValueError):
                s = self.vad_silence_duration_sec
            self.vad_silence_duration_sec = max(0.08, min(0.85, s))

    def _resolve_output_device_index(self):
        """Índice PyAudio do alto-falante: prioriza nome (rótulo do sistema), depois índice opcional."""
        name = (self.output_device_name or "").strip()
        if name:
            count = pya.get_device_count()
            for i in range(count):
                try:
                    info = pya.get_device_info_by_index(i)
                    if info.get("maxOutputChannels", 0) <= 0:
                        continue
                    dname = str(info.get("name", "") or "")
                    if name.lower() in dname.lower() or dname.lower() in name.lower():
                        print(f"[ADA] Resolved output device {name!r} -> PyAudio index {i} ({dname})")
                        self._runtime_log(
                            "info",
                            f"Saida de audio: indice {i} ({dname}).",
                            source="audio",
                        )
                        return i
                except Exception:
                    continue
            print(f"[ADA] [WARN] Output device name {name!r} not found in PyAudio; using default output.")
            self._runtime_log("warn", f"Alto-falante por nome nao encontrado no PyAudio: {name!r}.", source="audio")
        if self.output_device_index is not None:
            try:
                return int(self.output_device_index)
            except (TypeError, ValueError):
                pass
        return None

    def clear_outgoing_audio_queue(self):
        """Clear queued mic chunks that have not yet been sent to the model."""
        if not self.out_queue:
            return

        try:
            kept_items = []
            cleared = 0

            while not self.out_queue.empty():
                item = self.out_queue.get_nowait()
                if isinstance(item, dict) and item.get("mime_type") == "audio/pcm":
                    cleared += 1
                else:
                    kept_items.append(item)

            for item in kept_items:
                try:
                    self.out_queue.put_nowait(item)
                except asyncio.QueueFull:
                    break

            if cleared > 0:
                print(f"[ADA DEBUG] [AUDIO] Cleared {cleared} outgoing audio chunks due to mute.")
        except Exception as e:
            print(f"[ADA DEBUG] [ERR] Failed to clear outgoing audio queue: {e}")

    def set_paused(self, paused):
        self.paused = paused
        print(f"[ADA DEBUG] [AUDIO] set_paused({paused})")

        if paused:
            self.clear_outgoing_audio_queue()
            self.clear_audio_queue()
            self._is_speaking = False
            self._silence_start_time = None

    def stop(self):
        self.stop_event.set()
        for t in list(self._assistant_timer_tasks):
            if not t.done():
                t.cancel()

    async def _assistant_timer_wait(self, timer_id: str, duration_sec: float, label: str) -> None:
        """Espera `duration_sec` ou até `stop_event`; notifica o front e pede uma fala curta ao Live."""
        try:
            await asyncio.wait_for(self.stop_event.wait(), timeout=duration_sec)
            return
        except asyncio.TimeoutError:
            pass
        if self.stop_event.is_set():
            return
        cb = self.on_timer_event
        if cb:
            try:
                cb({"event": "finished", "id": timer_id, "label": label or ""})
            except Exception:
                pass
        await self._notify_timer_finished_speech(label)

    async def _notify_timer_finished_speech(self, label: str) -> None:
        """Injecta aviso na sessão Live para a ATHENAS falar que o cronómetro zerou."""
        if self.stop_event.is_set():
            return
        session = getattr(self, "session", None)
        if session is None:
            return
        label_bit = f" Rótulo: {label}." if (label or "").strip() else ""
        msg = (
            "System notification: O cronómetro que Leo pediu acabou de terminar."
            f"{label_bit} "
            "Diga em voz UMA frase bem curta em português do Brasil (ex.: 'Leo, tempo esgotado.'). "
            "Não repitas a mesma ideia duas vezes. Não voltes a dizer que o temporizador tinha sido iniciado."
        )
        try:
            async with self._session_send_lock:
                await session.send(input=msg, end_of_turn=True)
        except Exception as e:
            print(f"[ADA DEBUG] [TIMER] notify speech failed: {e!r}")

    def resolve_tool_confirmation(self, request_id, confirmed):
        print(f"[ADA DEBUG] [RESOLVE] resolve_tool_confirmation called. ID: {request_id}, Confirmed: {confirmed}")
        if request_id in self._pending_confirmations:
            future = self._pending_confirmations[request_id]
            if not future.done():
                print(f"[ADA DEBUG] [RESOLVE] Future found and pending. Setting result to: {confirmed}")
                future.set_result(confirmed)
            else:
                 print(f"[ADA DEBUG] [WARN] Request {request_id} future already done. Result: {future.result()}")
        else:
            print(f"[ADA DEBUG] [WARN] Confirmation Request {request_id} not found in pending dict. Keys: {list(self._pending_confirmations.keys())}")

    def clear_audio_queue(self):
        """Clears the queue of pending audio chunks to stop playback immediately."""
        try:
            if self.audio_in_queue is None:
                return
            count = 0
            while not self.audio_in_queue.empty():
                self.audio_in_queue.get_nowait()
                count += 1
            if count > 0:
                print(f"[ADA DEBUG] [AUDIO] Cleared {count} chunks from playback queue due to interruption.")
        except Exception as e:
            print(f"[ADA DEBUG] [ERR] Failed to clear audio queue: {e}")

    async def _enqueue_audio_chunk_low_latency(self, data: bytes):
        """
        Enfileira áudio priorizando continuidade da fala (menos cortes).
        Se lotar, aplica backpressure breve; só então faz drop mínimo.
        """
        if self.audio_in_queue is None:
            return
        try:
            await asyncio.wait_for(self.audio_in_queue.put(data), timeout=0.12)
        except asyncio.QueueFull:
            # Fallback: evita explosão de latência sem destruir toda a frase.
            try:
                if self.audio_in_queue.full():
                    self.audio_in_queue.get_nowait()
                self.audio_in_queue.put_nowait(data)
            except Exception:
                # Se falhar, não derruba o loop.
                pass
        except asyncio.TimeoutError:
            # Se o consumidor atrasar demais, drop mínimo para manter fluidez.
            try:
                if self.audio_in_queue.full():
                    self.audio_in_queue.get_nowait()
                self.audio_in_queue.put_nowait(data)
            except Exception:
                pass

    async def _enqueue_outgoing_audio_chunk_realtime(self, data: bytes):
        """
        Enfileira áudio de microfone para envio ao Live sem acumular delay.
        Se a fila estiver cheia, descarta o chunk de áudio mais antigo.
        """
        if self.out_queue is None:
            return

        payload = {"data": data, "mime_type": "audio/pcm"}
        try:
            self.out_queue.put_nowait(payload)
            return
        except asyncio.QueueFull:
            pass

        try:
            kept_items = []
            removed_audio = False
            while not self.out_queue.empty():
                item = self.out_queue.get_nowait()
                if (
                    not removed_audio
                    and isinstance(item, dict)
                    and str(item.get("mime_type") or "").startswith("audio/")
                ):
                    removed_audio = True
                    continue
                kept_items.append(item)

            for item in kept_items:
                try:
                    self.out_queue.put_nowait(item)
                except asyncio.QueueFull:
                    break

            if removed_audio:
                try:
                    self.out_queue.put_nowait(payload)
                except asyncio.QueueFull:
                    pass
        except Exception as e:
            print(f"[ADA DEBUG] [ERR] Failed to enqueue outgoing audio chunk: {e}")

    async def send_frame(self, frame_data):
        # Update the latest frame payload
        if isinstance(frame_data, bytes):
            b64_data = base64.b64encode(frame_data).decode('utf-8')
        else:
            b64_data = frame_data 

        # Store as the designated "next frame to send"
        self._latest_image_payload = {"mime_type": "image/jpeg", "data": b64_data}
        # No event signal needed - listen_audio pulls it

    def _mark_next_turn_from_chat(self):
        """Chamar antes de enviar texto/imagem pelo chat — protege playback da resposta."""
        self._chat_utterance_pending = True

    @staticmethod
    def _bytes_from_b64_or_raw(data):
        if data is None:
            return b""
        if isinstance(data, bytes):
            return data
        if isinstance(data, str):
            return base64.b64decode(data.strip())
        return b""

    def _maybe_downscale_image_bytes(self, image_bytes: bytes, mt: str) -> tuple[bytes, str]:
        """Reduz imagens muito grandes para o Live processar sem falhar."""
        if len(image_bytes) < 3_500_000:
            return image_bytes, mt
        try:
            img = PIL.Image.open(io.BytesIO(image_bytes))
            img.thumbnail((1536, 1536))
            buf = io.BytesIO()
            conv = img.convert("RGB") if img.mode in ("RGBA", "P", "LA") else img
            conv.save(buf, format="JPEG", quality=85, optimize=True)
            out = buf.getvalue()
            print(f"[ADA DEBUG] Chat image downscaled for Live: {len(image_bytes)} -> {len(out)} bytes")
            return out, "image/jpeg"
        except Exception as e:
            print(f"[ADA DEBUG] Chat image downscale skipped: {e}")
            return image_bytes, mt

    async def send_user_text_chat(self, text: str) -> None:
        """Texto digitado no chat + opcionalmente último frame da webcam, sem intercalar com fila da câmera."""
        if not self.session:
            print("[ADA DEBUG] send_user_text_chat: no session")
            return
        self._mark_next_turn_from_chat()
        async with self._session_send_lock:
            if self._latest_image_payload:
                print("[ADA DEBUG] Piggybacking video frame with chat text (send_client_content).")
                try:
                    vraw = self._bytes_from_b64_or_raw(self._latest_image_payload.get("data"))
                    vmime = (
                        (self._latest_image_payload.get("mime_type") or "image/jpeg")
                        .split(";")[0]
                        .strip()
                        .lower()
                    )
                    if vraw:
                        vraw, vmime = self._maybe_downscale_image_bytes(vraw, vmime)
                        turn = types.Content(
                            role="user",
                            parts=[
                                types.Part(inline_data=types.Blob(data=vraw, mime_type=vmime)),
                                types.Part(text=text),
                            ],
                        )
                        await self.session.send_client_content(turns=turn, turn_complete=True)
                        return
                except Exception as e:
                    print(f"[ADA DEBUG] Failed send_client_content (frame+text): {e}")
                    traceback.print_exc()
            await self.session.send_realtime_input(text=text)

    async def send_user_image_with_text(self, image_b64: str, mime_type: str, user_text: str = "") -> None:
        """
        Envia imagem (base64, sem prefixo data:) ao Live + texto na mesma interação.
        Usado pelo chat (anexar screenshot/foto) para descrição, OCR ou extração de dados.

        Usa `send_client_content` (um único turno user com imagem + texto). O método
        depreciado `send` separava imagem (realtime) e texto (client_content), o que
        na prática não gerava resposta do modelo.
        """
        if not self.session:
            print("[ADA DEBUG] send_user_image_with_text: no session")
            return
        mt = (mime_type or "image/jpeg").split(";")[0].strip().lower()
        allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
        if mt not in allowed:
            mt = "image/jpeg"
        try:
            image_bytes = base64.b64decode((image_b64 or "").strip(), validate=False)
        except (binascii.Error, ValueError) as e:
            raise ValueError(f"Base64 da imagem inválido: {e}") from e
        if not image_bytes:
            raise ValueError("Imagem vazia após decodificar base64.")
        image_bytes, mt = self._maybe_downscale_image_bytes(image_bytes, mt)
        print(f"[ADA DEBUG] Sending chat image via send_client_content mime={mt} bytes={len(image_bytes)}")
        self._mark_next_turn_from_chat()
        prompt = (user_text or "").strip()
        if not prompt:
            prompt = (
                "O usuário enviou uma imagem. Descreva o conteúdo, leia todo texto legível (como OCR) "
                "e responda em português do Brasil de forma clara e útil."
            )
        turn = types.Content(
            role="user",
            parts=[
                types.Part(inline_data=types.Blob(data=image_bytes, mime_type=mt)),
                types.Part(text=prompt),
            ],
        )
        try:
            async with self._session_send_lock:
                await self.session.send_client_content(turns=turn, turn_complete=True)
        except Exception as e:
            print(f"[ADA DEBUG] send_user_image_with_text failed: {e}")
            traceback.print_exc()
            self._chat_utterance_pending = False
            raise

    async def send_realtime(self):
        while True:
            msg = await self.out_queue.get()
            async with self._session_send_lock:
                if isinstance(msg, dict):
                    mtm = str(msg.get("mime_type") or "").split(";")[0].strip().lower()
                    raw = msg.get("data")
                    if mtm.startswith("audio/"):
                        # API espera taxa explícita (vide exemplos oficiais do Live API).
                        pcm_mime = "audio/pcm;rate=16000"
                        chunk = raw if isinstance(raw, bytes) else self._bytes_from_b64_or_raw(raw)
                        if chunk:
                            await self.session.send_realtime_input(
                                audio=types.Blob(data=chunk, mime_type=pcm_mime)
                            )
                    elif mtm.startswith("image/"):
                        vchunk = self._bytes_from_b64_or_raw(raw)
                        if vchunk:
                            await self.session.send_realtime_input(
                                video=types.Blob(data=vchunk, mime_type=mtm)
                            )
                    else:
                        await self.session.send(input=msg, end_of_turn=False)
                else:
                    await self.session.send(input=msg, end_of_turn=False)

    async def listen_audio(self):
        mic_info = pya.get_default_input_device_info()

        # Resolve Input Device by Name if provided
        resolved_input_device_index = None
        
        if self.input_device_name:
            print(f"[ADA] Attempting to find input device matching: '{self.input_device_name}'")
            self._runtime_log("debug", f"Tentando encontrar microfone por nome: {self.input_device_name!r}")
            count = pya.get_device_count()
            best_match = None
            
            for i in range(count):
                try:
                    info = pya.get_device_info_by_index(i)
                    if info['maxInputChannels'] > 0:
                        name = info.get('name', '')
                        # Simple case-insensitive check
                        if self.input_device_name.lower() in name.lower() or name.lower() in self.input_device_name.lower():
                             print(f"   Candidate {i}: {name}")
                             # Prioritize exact match or very close match if possible, but first match is okay for now
                             resolved_input_device_index = i
                             best_match = name
                             break
                except Exception:
                    continue
            
            if resolved_input_device_index is not None:
                print(f"[ADA] Resolved input device '{self.input_device_name}' to index {resolved_input_device_index} ({best_match})")
                self._runtime_log(
                    "info",
                    f"Microfone resolvido por nome para indice {resolved_input_device_index} ({best_match}).",
                )
            else:
                print(f"[ADA] Could not find device matching '{self.input_device_name}'. Checking index...")
                self._runtime_log("warn", f"Nao encontrou microfone por nome: {self.input_device_name!r}.")

        # Fallback to index if Name lookup failed or wasn't provided
        if resolved_input_device_index is None and self.input_device_index is not None:
             try:
                 resolved_input_device_index = int(self.input_device_index)
                 print(f"[ADA] Requesting Input Device Index: {resolved_input_device_index}")
                 self._runtime_log("debug", f"Tentando microfone por indice: {resolved_input_device_index}.")
             except ValueError:
                 print(f"[ADA] Invalid device index '{self.input_device_index}', reverting to default.")
                 self._runtime_log("warn", f"Indice de microfone invalido recebido: {self.input_device_index!r}.")
                 resolved_input_device_index = None

        if resolved_input_device_index is None:
             print("[ADA] Using Default Input Device")
             self._runtime_log("info", "Usando microfone padrao do sistema.")

        preferred_index = (
            resolved_input_device_index if resolved_input_device_index is not None else mic_info["index"]
        )
        try:
            self.audio_stream = await asyncio.to_thread(
                pya.open,
                format=FORMAT,
                channels=CHANNELS,
                rate=SEND_SAMPLE_RATE,
                input=True,
                input_device_index=preferred_index,
                frames_per_buffer=CHUNK_SIZE,
            )
        except OSError as e:
            print(f"[ADA] [ERR] Failed to open audio input stream (index={preferred_index}): {e}")
            self._runtime_log("error", f"Falha ao abrir stream de microfone no indice {preferred_index}: {e}")
            # Em Windows, o índice vindo do frontend pode ficar desalinhado com o PyAudio.
            # Faz fallback para o dispositivo padrão antes de desistir.
            try:
                fallback_index = mic_info["index"]
                if preferred_index != fallback_index:
                    print(f"[ADA] [WARN] Retrying with default input device index={fallback_index}...")
                    self._runtime_log("warn", f"Tentando fallback para microfone padrao (indice {fallback_index}).")
                    self.audio_stream = await asyncio.to_thread(
                        pya.open,
                        format=FORMAT,
                        channels=CHANNELS,
                        rate=SEND_SAMPLE_RATE,
                        input=True,
                        input_device_index=fallback_index,
                        frames_per_buffer=CHUNK_SIZE,
                    )
                else:
                    raise
            except Exception as e2:
                print(f"[ADA] [ERR] Failed to open default audio input stream: {e2}")
                print("[ADA] [WARN] Audio features will be disabled. Please check microphone permissions.")
                self._runtime_log("error", f"Falha no fallback do microfone padrao: {e2}")
                if self.on_error:
                    self.on_error(
                        "Falha ao abrir microfone. Verifique permissão no Windows e o dispositivo selecionado."
                    )
                return

        if __debug__:
            kwargs = {"exception_on_overflow": False}
        else:
            kwargs = {}
        
        while True:
            if self.paused:
                await asyncio.sleep(0.1)
                continue

            vad_threshold = int(getattr(self, "vad_rms_threshold", 900))
            silence_duration = float(getattr(self, "vad_silence_duration_sec", 0.22))

            try:
                data = await asyncio.to_thread(self.audio_stream.read, CHUNK_SIZE, **kwargs)

                count = len(data) // 2
                if count > 0:
                    shorts = struct.unpack(f"<{count}h", data)
                    g = float(getattr(self, "input_gain", 1.0))
                    g = max(0.25, min(4.0, g))
                    if abs(g - 1.0) > 1e-6:
                        shorts = tuple(
                            max(-32768, min(32767, int(round(s * g)))) for s in shorts
                        )
                        data = struct.pack(f"<{count}h", *shorts)
                    sum_squares = sum(s * s for s in shorts)
                    rms = int(math.sqrt(sum_squares / count))
                else:
                    rms = 0

                # 1. Send Audio (já com ganho aplicado)
                if self.out_queue:
                    await self._enqueue_outgoing_audio_chunk_realtime(data)
                
                if rms > vad_threshold:
                    # Speech Detected
                    self._silence_start_time = None
                    
                    if not self._is_speaking:
                        # NEW Speech Utterance Started
                        self._is_speaking = True
                        self._speech_utterance_started_at = time.time()
                        self._did_interrupt_for_current_utterance = False
                        print(f"[ADA DEBUG] [VAD] Speech Detected (RMS: {rms}). Sending Video Frame.")
                        
                        # Send ONE frame
                        if self._latest_image_payload and self.out_queue:
                            await self.out_queue.put(self._latest_image_payload)
                        else:
                            print(f"[ADA DEBUG] [VAD] No video frame available to send.")
                            
                else:
                    # Silence
                    if self._is_speaking:
                        if self._silence_start_time is None:
                            self._silence_start_time = time.time()
                        
                        elif time.time() - self._silence_start_time > silence_duration:
                            # Silence confirmed, reset state
                            print(f"[ADA DEBUG] [VAD] Silence detected. Resetting speech state.")
                            self._is_speaking = False
                            self._silence_start_time = None
                            self._speech_utterance_started_at = None
                            self._did_interrupt_for_current_utterance = False

            except Exception as e:
                print(f"Error reading audio: {e}")
                await asyncio.sleep(0.1)

    async def handle_write_file(self, path, content):
        print(f"[ADA DEBUG] [FS] Writing file: '{path}'")
        
        # Auto-create project if still using the bootstrap project
        if self.project_manager.current_project == "OrbitalSync":
            import datetime
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            new_project_name = f"Project_{timestamp}"
            print(f"[ADA DEBUG] [FS] Auto-creating project: {new_project_name}")
            
            success, msg = self.project_manager.create_project(new_project_name)
            if success:
                self.project_manager.switch_project(new_project_name)
                # Notify User
                try:
                    async with self._session_send_lock:
                        await self.session.send(input=f"System Notification: Automatic Project Creation. Switched to new project '{new_project_name}'.", end_of_turn=False)
                    if self.on_project_update:
                         self.on_project_update(new_project_name)
                except Exception as e:
                    print(f"[ADA DEBUG] [ERR] Failed to notify auto-project: {e}")
        
        # Force path to be relative to current project
        # If absolute path is provided, we try to strip it or just ignore it and use basename
        filename = os.path.basename(path)
        
        # If path contained subdirectories (e.g. "backend/server.py"), preserving that structure might be desired IF it's within the project.
        # But for safety, and per user request to "always create the file in the project", 
        # we will root it in the current project path.
        
        current_project_path = self.project_manager.get_current_project_path()
        final_path = current_project_path / filename # Simple flat structure for now, or allow relative?
        
        # If the user specifically wanted a subfolder, they might have provided "sub/file.txt".
        # Let's support relative paths if they don't start with /
        if not os.path.isabs(path):
             final_path = current_project_path / path
        
        print(f"[ADA DEBUG] [FS] Resolved path: '{final_path}'")

        try:
            # Ensure parent exists
            os.makedirs(os.path.dirname(final_path), exist_ok=True)
            with open(final_path, 'w', encoding='utf-8') as f:
                f.write(content)
            result = f"File '{final_path.name}' written successfully to project '{self.project_manager.current_project}'."
        except Exception as e:
            result = f"Failed to write file '{path}': {str(e)}"

        print(f"[ADA DEBUG] [FS] Result: {result}")
        try:
             async with self._session_send_lock:
                 await self.session.send(input=f"System Notification: {result}", end_of_turn=True)
        except Exception as e:
             print(f"[ADA DEBUG] [ERR] Failed to send fs result: {e}")

    async def handle_read_directory(self, path):
        print(f"[ADA DEBUG] [FS] Reading directory: '{path}'")
        try:
            if not os.path.exists(path):
                result = f"Directory '{path}' does not exist."
            else:
                items = os.listdir(path)
                result = f"Contents of '{path}': {', '.join(items)}"
        except Exception as e:
            result = f"Failed to read directory '{path}': {str(e)}"

        print(f"[ADA DEBUG] [FS] Result: {result}")
        try:
             async with self._session_send_lock:
                 await self.session.send(input=f"System Notification: {result}", end_of_turn=True)
        except Exception as e:
             print(f"[ADA DEBUG] [ERR] Failed to send fs result: {e}")

    async def handle_read_file(self, path):
        print(f"[ADA DEBUG] [FS] Reading file: '{path}'")
        try:
            if not os.path.exists(path):
                result = f"File '{path}' does not exist."
            else:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                result = f"Content of '{path}':\n{content}"
        except Exception as e:
            result = f"Failed to read file '{path}': {str(e)}"

        print(f"[ADA DEBUG] [FS] Result: {result}")
        try:
             async with self._session_send_lock:
                 await self.session.send(input=f"System Notification: {result}", end_of_turn=True)
        except Exception as e:
             print(f"[ADA DEBUG] [ERR] Failed to send fs result: {e}")

    async def handle_generate_image(
        self,
        prompt: str,
        aspect_ratio: str = "16:9",
        image_size: str = "2K",
        negative_prompt: str = "",
    ):
        """
        Gera a imagem via ComfyUI local usando `data/comfyui/workflow_api.json`
        (ou `COMFYUI_WORKFLOW_FILE`). Apenas ComfyUI.
        Retorno: (base64, mime_type, image_relpath|None).
        """
        workflow_path = str(resolved_comfyui_workflow_path())
        base_url = (os.getenv("COMFYUI_BASE_URL") or "http://127.0.0.1:2000").strip().rstrip("/")

        if not os.path.isfile(workflow_path):
            raise FileNotFoundError(
                f"Workflow do ComfyUI nao encontrado: '{workflow_path}'. "
                f"Coloque `data/comfyui/workflow_api.json` ou defina `COMFYUI_WORKFLOW_FILE`."
            )

        try:
            return await asyncio.to_thread(
                generate_image_via_comfyui,
                base_url,
                workflow_path,
                prompt,
                aspect_ratio,
                negative_prompt,
            )
        except Exception as e:
            raise RuntimeError(f"Falha ao gerar imagem via ComfyUI: {e!r}") from e

    def _format_webhook_tool_result(
        self,
        hook_id: str,
        status: int,
        text: str,
        *,
        integration_hint: str | None = None,
    ) -> str:
        """
        Retorno explícito para o modelo: [SUCCESS] / [FAILED], evitando 'alucinar' que a integração obedeceu sem evidência no retorno.
        """
        snippet = (text or "").strip()[:1200]
        # status 0 = erro antes do HTTP (ex.: hook_id desconhecido)
        if status <= 0:
            http_ok = False
        else:
            http_ok = 200 <= status < 300

        n8n_ok: bool | None = None
        if snippet:
            try:
                parsed = json.loads(snippet)
                if isinstance(parsed, dict) and "ok" in parsed:
                    raw_ok = parsed.get("ok")
                    if isinstance(raw_ok, str):
                        n8n_ok = raw_ok.strip().lower() in ("1", "true", "yes")
                    else:
                        n8n_ok = bool(raw_ok)
            except json.JSONDecodeError:
                pass

        if not http_ok:
            tag = "[FAILED]"
        elif n8n_ok is False:
            tag = "[FAILED]"
        else:
            tag = "[SUCCESS]"

        if integration_hint == "spotify":
            hint = (
                "Spotify often needs Premium + app open + an active device with recent playback; "
                "resume/play can silently fail if there is no active player."
            )
        elif integration_hint == "google_calendar":
            hint = (
                "Google Calendar via n8n needs the workflow active and OAuth credentials; "
                "if it failed, check n8n execution logs."
            )
        else:
            hint = ""

        hint_part = f"{hint} " if hint else ""
        return (
            f"{tag} webhook={hook_id!r} http_status={status}. "
            f"{hint_part}"
            f"n8n_body_snippet={snippet!r}"
        )

    async def handle_trigger_webhook(self, hook_id: str, payload=None):
        """POST agendado em config/webhooks.json (ex.: n8n)."""
        cfg = load_webhooks_config()
        extra = normalize_trigger_webhook_payload(payload, None)
        status, text = await fire_webhook_by_id(cfg, hook_id, extra)
        ih = "spotify" if hook_id == "athena-spotify" else None
        return self._format_webhook_tool_result(hook_id, status, text, integration_hint=ih)

    async def receive_audio(self):
        "Background task to reads from the websocket and write pcm chunks to the output queue"
        try:
            while True:
                turn = self.session.receive()
                drop_assistant_output = self._startup_output_turns_to_skip > 0
                async for response in turn:
                    # 1. Handle Audio Data
                    if data := response.data:
                        if not drop_assistant_output:
                            await self._enqueue_audio_chunk_low_latency(data)
                        # NOTE: 'continue' removed here to allow processing transcription/tools in same packet

                    # 2. Handle Transcription (User & Model)
                    if response.server_content:
                        if response.server_content.input_transcription:
                            transcript = response.server_content.input_transcription.text
                            if transcript:
                                # Skip if this is an exact duplicate event
                                if transcript != self._last_input_transcription:
                                    # Calculate delta (Gemini may send cumulative or chunk-based text)
                                    delta = transcript
                                    if transcript.startswith(self._last_input_transcription):
                                        delta = transcript[len(self._last_input_transcription):]
                                    self._last_input_transcription = transcript
                                    
                                    # Only send if there's new text
                                    if delta:
                                        # Voz do microfone: interrompe playback. Chat (texto/imagem): não —
                                        # o Live também emite input_transcription para o prompt escrito, o que
                                        # apagava o áudio da resposta (parece que a IA "some").
                                        # Gatilho extra: só interrompe se o VAD do microfone indicar fala.
                                        # Desabilitado: interromper playback via input_transcription
                                        # está causando cortes severos na fala da IA.

                                        # Send to frontend (Streaming)
                                        if self.on_transcription:
                                            self.on_transcription({"sender": "User", "text": delta})
                                        
                                        # Buffer for Logging
                                        if self.chat_buffer["sender"] != "User":
                                            # Flush previous if exists
                                            if self.chat_buffer["sender"] and self.chat_buffer["text"].strip():
                                                self.project_manager.log_chat(self.chat_buffer["sender"], self.chat_buffer["text"])
                                            # Start new
                                            self.chat_buffer = {"sender": "User", "text": delta}
                                        else:
                                            # Append
                                            self.chat_buffer["text"] += delta
                        
                        if response.server_content.output_transcription:
                            transcript = response.server_content.output_transcription.text
                            if transcript and not drop_assistant_output:
                                # Skip if this is an exact duplicate event
                                if transcript != self._last_output_transcription:
                                    # Calculate delta (Gemini may send cumulative or chunk-based text)
                                    delta = transcript
                                    if transcript.startswith(self._last_output_transcription):
                                        delta = transcript[len(self._last_output_transcription):]
                                    self._last_output_transcription = transcript
                                    
                                    # Only send if there's new text
                                    if delta:
                                        # Send to frontend (Streaming)
                                        if self.on_transcription:
                                            self.on_transcription({"sender": "ATHENAS", "text": delta})
                                        
                                        # Buffer for Logging
                                        if self.chat_buffer["sender"] != "ATHENAS":
                                            # Flush previous
                                            if self.chat_buffer["sender"] and self.chat_buffer["text"].strip():
                                                self.project_manager.log_chat(self.chat_buffer["sender"], self.chat_buffer["text"])
                                            # Start new
                                            self.chat_buffer = {"sender": "ATHENAS", "text": delta}
                                        else:
                                            # Append
                                            self.chat_buffer["text"] += delta
                        
                        # Flush buffer on turn completion if needed, 
                        # but usually better to wait for sender switch or explicit end.
                        # We can also check turn_complete signal if available in response.server_content.model_turn etc

                    # 3. Handle Tool Calls
                    if response.tool_call:
                        print("The tool was called")
                        function_responses = []
                        if drop_assistant_output:
                            # Turno de warmup após injeção de histórico: não executar tools automaticamente.
                            # Sem isso, a sessão pode disparar `generate_image`/outras ações ao iniciar.
                            for fc in response.tool_call.function_calls:
                                function_responses.append(
                                    types.FunctionResponse(
                                        id=fc.id,
                                        name=fc.name,
                                        response={
                                            "result": "Tool call ignored during startup warmup turn.",
                                        },
                                    )
                                )
                            print(
                                f"[ADA DEBUG] [TOOL] Ignoring {len(function_responses)} tool call(s) during startup warmup."
                            )
                            if function_responses:
                                async with self._session_send_lock:
                                    await self.session.send_tool_response(
                                        function_responses=function_responses
                                    )
                            continue
                        for fc in response.tool_call.function_calls:
                            if fc.name in [
                                "write_file",
                                "read_directory",
                                "read_file",
                                "create_project",
                                "switch_project",
                                "list_projects",
                                "generate_image",
                                "list_launch_apps",
                                "launch_app",
                                "trigger_webhook",
                                "search_chat_history",
                                "start_timer",
                                "add_calendar_reminder",
                                "remove_calendar_reminder",
                            ]:
                                if fc.name == "start_timer":
                                    args_map = coerce_tool_args(fc.args)
                                    raw_dur = args_map.get("duration_seconds", 0)
                                    try:
                                        duration_sec = float(raw_dur)
                                    except (TypeError, ValueError):
                                        duration_sec = 0
                                    duration_sec = int(round(duration_sec))
                                    duration_sec = max(1, min(7200, duration_sec))
                                    label = str(args_map.get("label") or "").strip()
                                    timer_id = str(uuid.uuid4())
                                    ends_at = time.time() + duration_sec
                                    if self.on_timer_event:
                                        try:
                                            self.on_timer_event(
                                                {
                                                    "event": "started",
                                                    "id": timer_id,
                                                    "label": label,
                                                    "duration_seconds": duration_sec,
                                                    "ends_at": ends_at,
                                                }
                                            )
                                        except Exception:
                                            pass
                                    t = asyncio.create_task(
                                        self._assistant_timer_wait(timer_id, float(duration_sec), label)
                                    )
                                    self._assistant_timer_tasks.add(t)
                                    t.add_done_callback(
                                        lambda task, s=self: s._assistant_timer_tasks.discard(task)
                                    )
                                    function_responses.append(
                                        types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={
                                                "result": (
                                                    f"[start_timer OK] {duration_sec}s. UI shows countdown. "
                                                    "NEXT SPEECH: one tiny Portuguese ack only (e.g. 'Combinado, Leo')—"
                                                    "NO restating seconds, NO second sentence about starting, "
                                                    "NO 'iniciado' if you already said 'iniciando' (pick one idea or neither). "
                                                    "DO NOT say time is up until a separate system notification; "
                                                    "never bundle start+end in the same reply."
                                                ),
                                            },
                                        )
                                    )
                                    continue

                                if fc.name == "add_calendar_reminder":
                                    args_map = coerce_tool_args(fc.args)
                                    title = str(args_map.get("title") or "").strip()
                                    iso = str(args_map.get("starts_at_iso") or "").strip()
                                    ts, parse_err = _parse_reminder_starts_at(iso)
                                    if not title or ts is None:
                                        err = parse_err or "título ou data inválidos"
                                        function_responses.append(
                                            types.FunctionResponse(
                                                id=fc.id,
                                                name=fc.name,
                                                response={
                                                    "result": (
                                                        f"[add_calendar_reminder FAILED] {err}. "
                                                        "Corrija title e starts_at_iso (ex.: 2026-04-02T15:00:00-03:00)."
                                                    ),
                                                },
                                            )
                                        )
                                        continue
                                    ends_raw = str(args_map.get("ends_at_iso") or "").strip()
                                    ends_iso_norm: str | None = None
                                    if ends_raw:
                                        try:
                                            ends_iso_norm = _normalize_reminder_iso(ends_raw)
                                        except ValueError:
                                            function_responses.append(
                                                types.FunctionResponse(
                                                    id=fc.id,
                                                    name=fc.name,
                                                    response={
                                                        "result": (
                                                            "[add_calendar_reminder FAILED] ends_at_iso inválido. "
                                                            "Use o mesmo formato ISO 8601 com fuso que starts_at_iso."
                                                        ),
                                                    },
                                                )
                                            )
                                            continue
                                    notes = str(args_map.get("notes") or "").strip()
                                    try:
                                        starts_iso_norm = _normalize_reminder_iso(iso)
                                    except ValueError:
                                        starts_iso_norm = iso

                                    wh_payload: dict = {
                                        "title": title,
                                        "starts_at_iso": starts_iso_norm,
                                    }
                                    if ends_iso_norm:
                                        wh_payload["ends_at_iso"] = ends_iso_norm
                                    if notes:
                                        wh_payload["notes"] = notes

                                    cfg = load_webhooks_config()
                                    try:
                                        wh_status, wh_text = await fire_webhook_by_id(
                                            cfg,
                                            ATHENA_GOOGLE_CALENDAR_HOOK_ID,
                                            wh_payload,
                                        )
                                    except Exception as e:
                                        wh_status, wh_text = (
                                            0,
                                            json.dumps(
                                                {
                                                    "ok": False,
                                                    "message": f"webhook exception: {e!r}",
                                                }
                                            ),
                                        )
                                    wh_line = self._format_webhook_tool_result(
                                        ATHENA_GOOGLE_CALENDAR_HOOK_ID,
                                        wh_status,
                                        wh_text,
                                        integration_hint="google_calendar",
                                    )

                                    google_event_id: str | None = None
                                    if 200 <= wh_status < 300 and wh_text:
                                        try:
                                            wd = json.loads(wh_text)
                                            if wd.get("ok") and isinstance(wd.get("data"), dict):
                                                raw_gid = wd["data"].get("id")
                                                if raw_gid is not None:
                                                    google_event_id = str(raw_gid).strip() or None
                                        except (json.JSONDecodeError, TypeError):
                                            pass

                                    reminder_id = str(uuid.uuid4())
                                    if self.on_calendar_event:
                                        try:
                                            cal_payload: dict = {
                                                "event": "reminder_added",
                                                "id": reminder_id,
                                                "title": title,
                                                "starts_at_ms": int(ts * 1000),
                                                "starts_at_iso": iso,
                                            }
                                            if google_event_id:
                                                cal_payload["google_event_id"] = google_event_id
                                            self.on_calendar_event(cal_payload)
                                        except Exception:
                                            pass

                                    if wh_status <= 0 and "Unknown hook_id" in (wh_text or ""):
                                        wh_line = (
                                            f"{wh_line} "
                                            "Só a agenda local foi atualizada; defina o hook "
                                            f"{ATHENA_GOOGLE_CALENDAR_HOOK_ID!r} em webhooks.json ou Supabase athena_webhooks."
                                        )

                                    function_responses.append(
                                        types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={
                                                "result": (
                                                    "[add_calendar_reminder OK] Agenda local atualizada; "
                                                    "n8n/Google Calendar: ver linha seguinte. "
                                                    f"{wh_line} "
                                                    "NEXT SPEECH: one short Portuguese line only — confirme conforme o resultado "
                                                    "(ex.: sucesso no Calendar ou erro honesto se [FAILED])."
                                                ),
                                            },
                                        )
                                    )
                                    continue

                                if fc.name == "remove_calendar_reminder":
                                    args_map = coerce_tool_args(fc.args)
                                    gid = str(args_map.get("google_event_id") or "").strip()
                                    title_rm = str(args_map.get("title") or "").strip()
                                    iso_rm = str(args_map.get("starts_at_iso") or "").strip()
                                    if not gid:
                                        if title_rm and iso_rm:
                                            found, ferr = await find_google_event_id_for_title_at(title_rm, iso_rm)
                                            if not found:
                                                function_responses.append(
                                                    types.FunctionResponse(
                                                        id=fc.id,
                                                        name=fc.name,
                                                        response={
                                                            "result": (
                                                                f"[remove_calendar_reminder FAILED] {ferr}. "
                                                                "Tente trigger_webhook com calendar_op list nesse período ou peça o id do evento."
                                                            ),
                                                        },
                                                    )
                                                )
                                                continue
                                            gid = found
                                        else:
                                            function_responses.append(
                                                types.FunctionResponse(
                                                    id=fc.id,
                                                    name=fc.name,
                                                    response={
                                                        "result": (
                                                            "[remove_calendar_reminder FAILED] "
                                                            "Defina google_event_id OU (title e starts_at_iso) para localizar o evento."
                                                        ),
                                                    },
                                                )
                                            )
                                            continue
                                    ok_del, dmsg = await delete_google_calendar_event(gid)
                                    if ok_del and self.on_calendar_event:
                                        try:
                                            self.on_calendar_event(
                                                {
                                                    "event": "google_event_removed",
                                                    "google_event_id": gid,
                                                }
                                            )
                                        except Exception:
                                            pass
                                    if ok_del:
                                        function_responses.append(
                                            types.FunctionResponse(
                                                id=fc.id,
                                                name=fc.name,
                                                response={
                                                    "result": (
                                                        f"[remove_calendar_reminder OK] Evento Google apagado (id={gid!r}). "
                                                        f"{dmsg or 'NEXT SPEECH: confirmação curta em português.'}"
                                                    ),
                                                },
                                            )
                                        )
                                    else:
                                        function_responses.append(
                                            types.FunctionResponse(
                                                id=fc.id,
                                                name=fc.name,
                                                response={
                                                    "result": (
                                                        f"[remove_calendar_reminder FAILED] {dmsg or 'Erro ao apagar no Google.'}"
                                                    ),
                                                },
                                            )
                                        )
                                    continue

                                prompt = fc.args.get("prompt", "") # Prompt is not present for all tools
                                
                                # Check Permissions (Default to True if not set)
                                confirmation_required = self.permissions.get(fc.name, True)
                                
                                if not confirmation_required:
                                    print(f"[ADA DEBUG] [TOOL] Permission check: '{fc.name}' -> AUTO-ALLOW")
                                    # Skip confirmation block and jump to execution
                                    pass
                                else:
                                    # Confirmation Logic
                                    if self.on_tool_confirmation:
                                        request_id = str(uuid.uuid4())
                                    print(f"[ADA DEBUG] [STOP] Requesting confirmation for '{fc.name}' (ID: {request_id})")
                                    
                                    future = asyncio.Future()
                                    self._pending_confirmations[request_id] = future
                                    
                                    self.on_tool_confirmation({
                                        "id": request_id, 
                                        "tool": fc.name, 
                                        "args": fc.args
                                    })
                                    
                                    try:
                                        # Wait for user response
                                        confirmed = await future

                                    finally:
                                        self._pending_confirmations.pop(request_id, None)

                                    print(f"[ADA DEBUG] [CONFIRM] Request {request_id} resolved. Confirmed: {confirmed}")

                                    if not confirmed:
                                        print(f"[ADA DEBUG] [DENY] Tool call '{fc.name}' denied by user.")
                                        function_response = types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={
                                                "result": "User denied the request to use this tool.",
                                            }
                                        )
                                        function_responses.append(function_response)
                                        continue

                                # If confirmed (or no callback configured, or auto-allowed), proceed
                                if fc.name == "write_file":
                                    path = fc.args["path"]
                                    content = fc.args["content"]
                                    print(f"[ADA DEBUG] [TOOL] Tool Call: 'write_file' path='{path}'")
                                    asyncio.create_task(self.handle_write_file(path, content))
                                    function_response = types.FunctionResponse(
                                        id=fc.id, name=fc.name, response={"result": "Writing file..."}
                                    )
                                    function_responses.append(function_response)

                                elif fc.name == "read_directory":
                                    path = fc.args["path"]
                                    print(f"[ADA DEBUG] [TOOL] Tool Call: 'read_directory' path='{path}'")
                                    asyncio.create_task(self.handle_read_directory(path))
                                    function_response = types.FunctionResponse(
                                        id=fc.id, name=fc.name, response={"result": "Reading directory..."}
                                    )
                                    function_responses.append(function_response)

                                elif fc.name == "read_file":
                                    path = fc.args["path"]
                                    print(f"[ADA DEBUG] [TOOL] Tool Call: 'read_file' path='{path}'")
                                    asyncio.create_task(self.handle_read_file(path))
                                    function_response = types.FunctionResponse(
                                        id=fc.id, name=fc.name, response={"result": "Reading file..."}
                                    )
                                    function_responses.append(function_response)

                                elif fc.name == "create_project":
                                    name = fc.args["name"]
                                    print(f"[ADA DEBUG] [TOOL] Tool Call: 'create_project' name='{name}'")
                                    success, msg = self.project_manager.create_project(name)
                                    if success:
                                        # Auto-switch to the newly created project
                                        self.project_manager.switch_project(name)
                                        msg += f" Switched to '{name}'."
                                        if self.on_project_update:
                                            self.on_project_update(name)
                                    function_response = types.FunctionResponse(
                                        id=fc.id, name=fc.name, response={"result": msg}
                                    )
                                    function_responses.append(function_response)

                                elif fc.name == "switch_project":
                                    name = fc.args["name"]
                                    print(f"[ADA DEBUG] [TOOL] Tool Call: 'switch_project' name='{name}'")
                                    success, msg = self.project_manager.switch_project(name)
                                    if success:
                                        if self.on_project_update:
                                            self.on_project_update(name)
                                        # Gather project context and send to AI (silently, no response expected)
                                        context = self.project_manager.get_project_context()
                                        print(f"[ADA DEBUG] [PROJECT] Sending project context to AI ({len(context)} chars)")
                                        try:
                                            async with self._session_send_lock:
                                                await self.session.send(input=f"System Notification: {msg}\n\n{context}", end_of_turn=False)
                                        except Exception as e:
                                            print(f"[ADA DEBUG] [ERR] Failed to send project context: {e}")
                                    function_response = types.FunctionResponse(
                                        id=fc.id, name=fc.name, response={"result": msg}
                                    )
                                    function_responses.append(function_response)
                                
                                elif fc.name == "list_projects":
                                    print(f"[ADA DEBUG] [TOOL] Tool Call: 'list_projects'")
                                    projects = self.project_manager.list_projects()
                                    function_response = types.FunctionResponse(
                                        id=fc.id, name=fc.name, response={"result": f"Available projects: {', '.join(projects)}"}
                                    )
                                    function_responses.append(function_response)

                                elif fc.name == "list_launch_apps":
                                    catalog = list_launch_apps_catalog()
                                    body = (
                                        json.dumps(catalog, ensure_ascii=False)
                                        if catalog
                                        else "Nenhum app na whitelist (Supabase ou lista local)."
                                    )
                                    print(f"[ADA DEBUG] [TOOL] list_launch_apps ({len(catalog)} itens)")
                                    function_response = types.FunctionResponse(
                                        id=fc.id,
                                        name=fc.name,
                                        response={"result": body},
                                    )
                                    function_responses.append(function_response)

                                elif fc.name == "launch_app":
                                    args_map = coerce_tool_args(fc.args)
                                    aid = str(args_map.get("app_id", "")).strip()
                                    print(f"[ADA DEBUG] [TOOL] launch_app app_id={aid!r}")
                                    if not aid:
                                        function_response = types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={"result": "app_id é obrigatório."},
                                        )
                                    else:
                                        ok, msg = await asyncio.to_thread(launch_app_by_id, aid)
                                        function_response = types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={"result": msg if ok else f"[FAILED] {msg}"},
                                        )
                                    function_responses.append(function_response)

                                elif fc.name == "generate_image":
                                    img_prompt = fc.args.get("prompt", "") or prompt
                                    neg = str(fc.args.get("negative_prompt", "") or "").strip()
                                    aspect_ratio = fc.args.get("aspect_ratio", "16:9")
                                    image_size = fc.args.get("image_size", "2K")
                                    print(
                                        f"[ADA DEBUG] [TOOL] Tool Call: 'generate_image' "
                                        f"aspect_ratio={aspect_ratio} image_size={image_size} "
                                        f"negative_len={len(neg)}"
                                    )

                                    try:
                                        image_b64, mime_type, image_relpath = await self.handle_generate_image(
                                            prompt=img_prompt,
                                            aspect_ratio=aspect_ratio,
                                            image_size=image_size,
                                            negative_prompt=neg,
                                        )
                                        if image_b64 and self.on_image_generated:
                                            # Push to frontend immediately (separate event).
                                            self.on_image_generated(
                                                image_b64,
                                                mime_type,
                                                img_prompt,
                                                image_relpath=image_relpath,
                                            )

                                        function_response = types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={"result": "Image generated." if image_b64 else "Image generation failed."},
                                        )
                                    except Exception as e:
                                        function_response = types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={"result": f"Failed to generate image: {str(e)}"},
                                        )
                                    function_responses.append(function_response)

                                elif fc.name == "trigger_webhook":
                                    args_map = coerce_tool_args(fc.args)
                                    hid = str(args_map.get("hook_id", "")).strip()
                                    pl = normalize_trigger_webhook_payload(
                                        args_map.get("payload"), args_map
                                    )
                                    print(
                                        f"[ADA DEBUG] [TOOL] trigger_webhook hook_id={hid!r} "
                                        f"raw_args={args_map!r} normalized_payload={pl!r}"
                                    )
                                    if not hid:
                                        function_response = types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={"result": "hook_id is required."},
                                        )
                                    else:
                                        try:
                                            msg = await self.handle_trigger_webhook(hid, pl)
                                            function_response = types.FunctionResponse(
                                                id=fc.id,
                                                name=fc.name,
                                                response={"result": msg},
                                            )
                                        except Exception as e:
                                            function_response = types.FunctionResponse(
                                                id=fc.id,
                                                name=fc.name,
                                                response={"result": f"trigger_webhook failed: {e!r}"},
                                            )
                                    function_responses.append(function_response)

                                elif fc.name == "search_chat_history":
                                    args_map = coerce_tool_args(fc.args)
                                    query = str(args_map.get("query", "")).strip()
                                    raw_limit = args_map.get("limit", 8)
                                    try:
                                        limit = int(raw_limit)
                                    except (TypeError, ValueError):
                                        limit = 8
                                    limit = max(1, min(20, limit))
                                    print(
                                        f"[ADA DEBUG] [TOOL] search_chat_history query={query!r} limit={limit}"
                                    )
                                    if not query:
                                        function_response = types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={"result": "query é obrigatório."},
                                        )
                                    else:
                                        matches = self.project_manager.search_chat_history(query, limit=limit)
                                        if not matches:
                                            result = "Nenhuma mensagem encontrada para essa busca."
                                        else:
                                            lines = []
                                            for entry in matches:
                                                sender = entry.get("sender", "Unknown")
                                                text = str(entry.get("text", "")).strip().replace("\n", " ")
                                                if len(text) > 240:
                                                    text = text[:240].rstrip() + "..."
                                                lines.append(f"[{sender}] {text}")
                                            result = "\n".join(lines)
                                        function_response = types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={"result": result},
                                        )
                                    function_responses.append(function_response)

                        if function_responses:
                            async with self._session_send_lock:
                                await self.session.send_tool_response(function_responses=function_responses)
                
                # Turn/Response Loop Finished
                if drop_assistant_output:
                    self._startup_output_turns_to_skip = max(
                        0, self._startup_output_turns_to_skip - 1
                    )
                    self._last_output_transcription = ""
                    print(
                        "[ADA DEBUG] [MEMORY] Turno da assistente após inject de histórico "
                        "foi ignorado (sem áudio/transcrição na UI)."
                    )
                self.flush_chat()
        except Exception as e:
            # 1011 = fecho WebSocket “service unavailable” no lado Google — esperado ocasionalmente;
            # traceback completo só atrapalha o diagnóstico (reconexão já é tratada em run()).
            if isinstance(e, genai_errors.APIError) and getattr(e, "code", None) == 1011:
                print(
                    "[ADA DEBUG] [LIVE] Gemini Live 1011 (serviço indisponível / sessão encerrada). "
                    "Reconexão automática no loop principal."
                )
                self._runtime_log(
                    "warn",
                    "Live 1011: serviço Gemini indisponível ou sessão fechada (comportamento do servidor). Nova tentativa em seguida.",
                    source="live",
                )
            else:
                print(f"Error in receive_audio: {e}")
                traceback.print_exc()
            # Re-raise para o TaskGroup e o loop de reconexão em run().
            raise e

    async def play_audio(self):
        out_index = self._resolve_output_device_index()
        stream = await asyncio.to_thread(
            pya.open,
            format=FORMAT,
            channels=CHANNELS,
            rate=RECEIVE_SAMPLE_RATE,
            output=True,
            output_device_index=out_index,
            frames_per_buffer=CHUNK_SIZE,
        )
        while True:
            bytestream = await self.audio_in_queue.get()
            if self.on_audio_data:
                self.on_audio_data(bytestream)
            await asyncio.to_thread(stream.write, bytestream)

    async def get_frames(self):
        cap = await asyncio.to_thread(cv2.VideoCapture, 0, cv2.CAP_AVFOUNDATION)
        while True:
            if self.paused:
                await asyncio.sleep(0.1)
                continue
            frame = await asyncio.to_thread(self._get_frame, cap)
            if frame is None:
                break
            await asyncio.sleep(1.0)
            if self.out_queue:
                await self.out_queue.put(frame)
        cap.release()

    def _get_frame(self, cap):
        ret, frame = cap.read()
        if not ret:
            return None
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = PIL.Image.fromarray(frame_rgb)
        img.thumbnail([1024, 1024])
        image_io = io.BytesIO()
        img.save(image_io, format="jpeg")
        image_io.seek(0)
        image_bytes = image_io.read()
        return {"mime_type": "image/jpeg", "data": base64.b64encode(image_bytes).decode()}

    async def _get_screen(self):
        pass 
    async def get_screen(self):
         pass

    async def run(self, start_message=None):
        retry_delay = 1
        is_reconnect = False
        
        while not self.stop_event.is_set():
            try:
                print(f"[ADA DEBUG] [CONNECT] Connecting to Gemini Live API...")
                gemini_client = get_gemini_client()
                if gemini_client is None:
                    print("[ADA DEBUG] [ERR] GEMINI_API_KEY ausente — defina no .env ou em Configurações → Servidor.")
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 10)
                    # Não marcar como reconnect: ainda não houve sessão Live com histórico injetado.
                    continue
                async with (
                    gemini_client.aio.live.connect(model=MODEL, config=config) as session,
                    asyncio.TaskGroup() as tg,
                ):
                    self.session = session

                    # Fila menor para reduzir latência perceptível sem estourar em jitter.
                    self.audio_in_queue = asyncio.Queue(maxsize=80)
                    self.out_queue = asyncio.Queue(maxsize=6)

                    # Enviar contexto ANTES de receive_audio — senão o stream já consome eventos sem histórico.
                    if not is_reconnect:
                        if start_message:
                            print(f"[ADA DEBUG] [INFO] Sending start message: {start_message}")
                            async with self._session_send_lock:
                                await self.session.send(input=start_message, end_of_turn=True)

                        history = self.project_manager.get_recent_chat_history(
                            limit=_chat_startup_history_limit()
                        )
                        if history:
                            context_msg = (
                                "Persisted project chat transcript. Factual record of prior turns with Leo in this project. "
                                "Use it when he asks about the past or for consistency; do not invent lines outside this log.\n\n"
                            )
                            for entry in history:
                                sender = entry.get('sender', 'Unknown')
                                text = entry.get('text', '')
                                context_msg += f"[{sender}]: {text}\n"

                            print(f"[ADA DEBUG] [MEMORY] Injecting startup chat history ({len(history)} messages)")
                            async with self._session_send_lock:
                                await self.session.send(input=context_msg, end_of_turn=True)
                            self._startup_output_turns_to_skip = 1
                            self.clear_audio_queue()
                        else:
                            print(
                                "[ADA DEBUG] [MEMORY] Nenhum histórico persistido para injetar "
                                f"(projeto={self.project_manager.current_project!r}). "
                                "Confirme mensagens em Supabase ou chat_history.jsonl."
                            )

                        if self.on_project_update and self.project_manager:
                            self.on_project_update(self.project_manager.current_project)

                    else:
                        print(f"[ADA DEBUG] [RECONNECT] Connection restored.")
                        print(f"[ADA DEBUG] [RECONNECT] Fetching recent chat history to restore context...")
                        history = self.project_manager.get_recent_chat_history(
                            limit=_chat_startup_history_limit()
                        )
                        if history:
                            context_msg = (
                                "Connection was lost and re-established. Recent persisted transcript below.\n\n"
                            )
                            for entry in history:
                                sender = entry.get('sender', 'Unknown')
                                text = entry.get('text', '')
                                context_msg += f"[{sender}]: {text}\n"

                            context_msg += (
                                "\nWhen Leo asks about earlier topics, use the transcript above."
                            )

                            print(f"[ADA DEBUG] [RECONNECT] Sending restoration context to model...")
                            async with self._session_send_lock:
                                await self.session.send(input=context_msg, end_of_turn=True)
                            self._startup_output_turns_to_skip = 1
                            self.clear_audio_queue()
                        else:
                            print("[ADA DEBUG] [RECONNECT] Sem histórico para reinjetar.")

                    self._had_successful_live_connect = True

                    tg.create_task(self.send_realtime())
                    tg.create_task(self.listen_audio())

                    if self.video_mode == "camera":
                        tg.create_task(self.get_frames())
                    elif self.video_mode == "screen":
                        tg.create_task(self.get_screen())

                    tg.create_task(self.receive_audio())
                    tg.create_task(self.play_audio())

                    # Reset retry delay on successful connection
                    retry_delay = 1
                    
                    # Wait until stop event, or until the session task group exits (which happens on error)
                    # Actually, the TaskGroup context manager will exit if any tasks fail/cancel.
                    # We need to keep this block alive.
                    # The original code just waited on stop_event, but that doesn't account for session death.
                    # We should rely on the TaskGroup raising an exception when subtasks fail (like receive_audio).
                    
                    # However, since receive_audio is a task in the group, if it crashes (connection closed), 
                    # the group will cancel others and exit. We catch that exit below.
                    
                    # We can await stop_event, but if the connection dies, receive_audio crashes -> group closes -> we exit `async with` -> restart loop.
                    # To ensure we don't block indefinitely if connection dies silently (unlikely with receive_audio), we just wait.
                    await self.stop_event.wait()

            except asyncio.CancelledError:
                print(f"[ADA DEBUG] [STOP] Main loop cancelled.")
                break

            except BaseExceptionGroup as eg:
                # TaskGroup propaga ExceptionGroup, que NÃO herda de Exception — sem este bloco o loop
                # não reconecta e a task do servidor morre após erro no WebSocket Live (ex.: API 1011).
                leaves = list(_leaf_exceptions(eg))
                detail = "; ".join(str(x) for x in leaves[:4])
                if len(leaves) > 4:
                    detail += "…"
                print(f"[ADA DEBUG] [ERR] Connection Error (TaskGroup): {detail}")
                self._runtime_log("error", f"Live encerrou (TaskGroup): {detail}", source="live")
                for err in leaves:
                    if isinstance(err, genai_errors.APIError) and getattr(err, "code", None) == 1011:
                        self._runtime_log(
                            "warn",
                            "Gemini Live indisponível (1011 — sessão/fecho pelo serviço). Nova tentativa em seguida.",
                            source="live",
                        )
                        break

                if self.stop_event.is_set():
                    break

                print(f"[ADA DEBUG] [RETRY] Reconnecting in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 10)
                if self._had_successful_live_connect:
                    is_reconnect = True

            except Exception as e:
                print(f"[ADA DEBUG] [ERR] Connection Error: {e}")
                self._runtime_log("error", f"Live: {e}", source="live")
                if isinstance(e, genai_errors.APIError) and getattr(e, "code", None) == 1011:
                    self._runtime_log(
                        "warn",
                        "Gemini Live indisponível (1011). Nova tentativa em seguida.",
                        source="live",
                    )

                if self.stop_event.is_set():
                    break

                print(f"[ADA DEBUG] [RETRY] Reconnecting in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 10)
                if self._had_successful_live_connect:
                    is_reconnect = True

            finally:
                self.session = None
                # Cleanup before retry
                if hasattr(self, 'audio_stream') and self.audio_stream:
                    try:
                        self.audio_stream.close()
                    except: 
                        pass

