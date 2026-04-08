"""Socket.IO: ligação, logs em tempo real e sincronização de boot."""
from __future__ import annotations

import asyncio

from orbital.settings import SETTINGS
from orbital.services.authenticator import FaceAuthenticator

from .. import state as st
from .common import RUNTIME_LOGS, RUNTIME_LOGS_ROOM


def register_connect_handlers(sio, emit_runtime_log):
    @sio.event
    async def connect(sid, environ):
        print(f"Client connected: {sid}")
        await sio.emit("status", {"msg": "Connected to A.D.A Backend"}, room=sid)
        await emit_runtime_log("info", f"Cliente conectado: {sid[:8]}...", source="socket")

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

        async def push_integration_health():
            """Testes de integração no connect — o dock de health já chega preenchido ao sair do boot."""
            from .settings_handlers import emit_integration_tests_for_client

            await emit_integration_tests_for_client(sio, sid)

        asyncio.create_task(push_integration_health())

    @sio.event
    async def disconnect(sid):
        print(f"Client disconnected: {sid}")
        try:
            await sio.leave_room(sid, RUNTIME_LOGS_ROOM)
        except Exception:
            pass
        await emit_runtime_log("info", f"Cliente desconectado: {sid[:8]}...", source="socket")

    @sio.event
    async def subscribe_runtime_logs(sid):
        """Cliente passa a receber eventos `runtime_log` (ex.: área de logs nas configurações)."""
        await sio.enter_room(sid, RUNTIME_LOGS_ROOM)

    @sio.event
    async def unsubscribe_runtime_logs(sid):
        try:
            await sio.leave_room(sid, RUNTIME_LOGS_ROOM)
        except Exception:
            pass

    @sio.event
    async def get_runtime_logs(sid):
        await sio.emit("runtime_logs_snapshot", {"logs": list(RUNTIME_LOGS)}, room=sid)

    @sio.event
    async def clear_runtime_logs(sid):
        RUNTIME_LOGS.clear()
        await sio.emit("runtime_logs_snapshot", {"logs": []})
        await emit_runtime_log("info", "Logs em memória limpos pela UI.", source="logs")

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
