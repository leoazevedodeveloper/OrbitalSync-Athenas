"""Servidor HTTP/WebSocket: estado, áudio do orb, pacote socket_handlers e bootstrap ASGI."""

from .bootstrap import app, app_socketio, sio

__all__ = ["app", "app_socketio", "sio"]
