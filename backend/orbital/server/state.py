"""Estado mutável compartilhado pelo servidor Socket.IO."""
import asyncio

audio_loop = None
loop_task = None
audio_control_lock = asyncio.Lock()
authenticator = None
