"""Rotas HTTP FastAPI (estado, ficheiros estáticos de integração)."""
from __future__ import annotations

import mimetypes

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse

from orbital.services.integrations.comfyui_client import safe_comfyui_imagens_file


def register_http_routes(app: FastAPI) -> None:
    @app.get("/status")
    async def status():
        return {"status": "running", "service": "A.D.A Backend"}

    @app.get("/api/comfyui-image")
    async def comfyui_saved_image(relpath: str = Query(..., min_length=1, max_length=512)):
        """Serve ficheiros dentro de integrations/comfyui/imagens (e legado data/comfyui/imagens)."""
        resolved = safe_comfyui_imagens_file(relpath)
        if resolved is None:
            raise HTTPException(status_code=404, detail="Not found")
        media_type, _ = mimetypes.guess_type(str(resolved))
        return FileResponse(resolved, media_type=media_type or "application/octet-stream")
