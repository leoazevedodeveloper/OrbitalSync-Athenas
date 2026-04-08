"""Socket.IO: entrada do chat, histórico e frames de vídeo para o modelo."""
from __future__ import annotations

import asyncio
import base64
import binascii

from orbital.settings import PROJECT_ROOT
from orbital.services.integrations.comfyui_client import repo_relative_posix, save_chat_upload_image_to_data_dir
from orbital.services.project_manager import ProjectManager

from .. import state as st
from .common import normalize_chat_image_payload


def register_chat_handlers(sio):
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

        parsed, err = normalize_chat_image_payload(data)
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

            history = pm.get_ui_chat_transcript(limit=limit)
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
