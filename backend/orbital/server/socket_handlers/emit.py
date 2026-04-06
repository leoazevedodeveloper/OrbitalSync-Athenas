"""Emissores async compartilhados pelos handlers Socket.IO."""
from __future__ import annotations

from orbital.settings import SETTINGS

from .common import RUNTIME_LOGS_ROOM, append_settings_runtime_fields, log_entry


def make_emit_helpers(sio):
    async def emit_runtime_log(level: str, message: str, source: str = "server", room=None):
        entry = log_entry(level, message, source=source)
        if room is not None:
            await sio.emit("runtime_log", entry, room=room)
        else:
            await sio.emit("runtime_log", entry, room=RUNTIME_LOGS_ROOM)

    async def emit_full_settings():
        payload = dict(SETTINGS)
        append_settings_runtime_fields(payload)
        await sio.emit("settings", payload)

    return emit_runtime_log, emit_full_settings
