"""Eventos Socket.IO em tempo real (conexão, áudio, chat, configurações)."""

from .audio_handlers import register_audio_handlers
from .chat_handlers import register_chat_handlers
from .connect import register_connect_handlers
from .emit import make_emit_helpers
from .finance_handlers import register_finance_handlers
from .settings_handlers import register_settings_handlers


def register_socket_handlers(sio):
    emit_runtime_log, emit_full_settings = make_emit_helpers(sio)
    register_connect_handlers(sio, emit_runtime_log)
    register_audio_handlers(sio, emit_runtime_log)
    register_chat_handlers(sio)
    register_finance_handlers(sio)
    register_settings_handlers(sio, emit_runtime_log, emit_full_settings)


__all__ = ["register_socket_handlers"]
