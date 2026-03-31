"""
Entrada do backend para uvicorn / Electron (`server:app_socketio`).
A política asyncio no Windows tem de ser definida antes dos restantes imports.
"""
import asyncio
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

_backend = os.path.dirname(os.path.abspath(__file__))
if _backend not in sys.path:
    sys.path.insert(0, _backend)

from orbital.server.bootstrap import app_socketio  # noqa: F401 — carrega settings via bootstrap

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app_socketio",
        host="127.0.0.1",
        port=8000,
        reload=False,
        loop="asyncio",
        reload_excludes=["temp_cad_gen.py", "output.stl", "*.stl"],
    )
