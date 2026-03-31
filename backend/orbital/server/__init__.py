"""Servidor HTTP/WebSocket: estado, áudio do orb, handlers Socket.IO e bootstrap ASGI."""

from .bootstrap import app, app_socketio, sio

__all__ = ["app", "app_socketio", "sio"]
