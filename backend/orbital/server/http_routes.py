"""Rotas HTTP FastAPI (estado, ficheiros estáticos de integração)."""
from __future__ import annotations

import mimetypes
import os
import time

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse

from orbital.services.brain import BrainVault
from orbital.services.integrations.image_client import safe_generated_image_file
from orbital.server import state as st

_BRAIN_API_KEY = (os.getenv("ORBITAL_BRAIN_API_KEY") or "").strip()

# Debounce: guarda o último momento em que cada número foi notificado na sessão
_wpp_last_notified: dict[str, float] = {}
_WPP_DEBOUNCE_SEC = 8.0  # silencia notificações do mesmo remetente dentro deste janela


def _check_brain_api_key(request: Request) -> None:
    """Valida API key para endpoints do brain vault. Desativado se env var não estiver definida."""
    if not _BRAIN_API_KEY:
        return
    auth = (request.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
    if auth != _BRAIN_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def register_http_routes(app: FastAPI) -> None:
    @app.get("/status")
    async def status():
        return {"status": "running", "service": "A.D.A Backend"}

    @app.get("/api/generated-image")
    async def generated_image(relpath: str = Query(..., min_length=1, max_length=512)):
        """Serve imagens geradas pelo Nano Banana 2 em data/generated-images/."""
        resolved = safe_generated_image_file(relpath)
        if resolved is None:
            raise HTTPException(status_code=404, detail="Not found")
        media_type, _ = mimetypes.guess_type(str(resolved))
        return FileResponse(resolved, media_type=media_type or "application/octet-stream")

    # ------------------------------------------------------------------
    # Brain Vault API — usado pelo n8n para ler/escrever notas
    # ------------------------------------------------------------------

    # ------------------------------------------------------------------
    # WhatsApp notify — chamado pelo n8n ao receber mensagem nova
    # ------------------------------------------------------------------

    @app.post("/api/whatsapp/notify")
    async def whatsapp_notify(request: Request):
        """Injeta notificação de mensagem WhatsApp na sessão ativa da Athena.
        Body: {phone, pushName, text, instanceName}
        """
        _check_brain_api_key(request)
        data = await request.json()
        phone = data.get("phone", "").strip()
        push_name = data.get("pushName", phone).strip()
        text = data.get("text", "").strip()
        if not phone or not text:
            raise HTTPException(status_code=400, detail="'phone' e 'text' são obrigatórios")

        now = time.monotonic()
        last = _wpp_last_notified.get(phone, 0.0)
        in_debounce = (now - last) < _WPP_DEBOUNCE_SEC

        if in_debounce:
            # Mensagem salva nas pendentes pelo n8n, mas não injeta na sessão agora
            print(f"[WHATSAPP NOTIFY] Debounce ativo para {push_name} ({phone}), pulando injeção.")
            return JSONResponse({"ok": True, "debounced": True})

        _wpp_last_notified[phone] = now

        notification = (
            f"[SISTEMA: WhatsApp] Leo, chegou mensagem de {push_name} "
            f"(+{phone}): \"{text}\". "
            f"Use read_brain na nota '06 - State/WhatsApp_pendente' para ver se há mais mensagens pendentes desse contato e informe Leo."
        )

        # Aguarda sessão ficar ativa (até 12s — cobre gaps de reconexão do Gemini Live)
        import asyncio
        deadline = time.monotonic() + 12.0
        while True:
            if st.audio_loop and st.audio_loop.session:
                break
            if time.monotonic() >= deadline:
                print(f"[WHATSAPP NOTIFY] Sessão inativa após espera, descartando notificação de {push_name}.")
                return JSONResponse({"ok": False, "reason": "sessão inativa"})
            await asyncio.sleep(0.5)

        try:
            await st.audio_loop.send_user_text_chat(notification)
        except Exception as exc:
            print(f"[WHATSAPP NOTIFY] Falha ao injetar notificação na sessão: {exc}")
            return JSONResponse({"ok": False, "reason": str(exc)})

        return JSONResponse({"ok": True, "debounced": False})

    @app.post("/api/brain/read")
    async def brain_read(request: Request):
        """Lê uma nota do brain vault. Body: {note: "section/Nome"}."""
        _check_brain_api_key(request)
        data = await request.json()
        note = data.get("note", "").strip()
        if not note:
            raise HTTPException(status_code=400, detail="'note' is required")
        vault = BrainVault()
        result = vault.read_note(note)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return JSONResponse(result)

    @app.post("/api/brain/write")
    async def brain_write(request: Request):
        """Escreve/appenda numa nota do brain vault.
        Body: {note: "section/Nome", content: "...", mode: "append"|"overwrite"}.
        """
        _check_brain_api_key(request)
        data = await request.json()
        note = data.get("note", "").strip()
        content = data.get("content", "")
        mode = data.get("mode", "append")
        if not note:
            raise HTTPException(status_code=400, detail="'note' is required")
        if not content:
            raise HTTPException(status_code=400, detail="'content' is required")
        if mode not in ("append", "overwrite"):
            raise HTTPException(status_code=400, detail="'mode' must be 'append' or 'overwrite'")
        vault = BrainVault()
        result = vault.write_note(note, content, mode)
        if "error" in result:
            raise HTTPException(status_code=403, detail=result["error"])
        return JSONResponse(result)
