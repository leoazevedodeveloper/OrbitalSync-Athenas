"""Estado mutável compartilhado pelo servidor Socket.IO."""
import asyncio

audio_loop = None
loop_task = None
audio_control_lock = asyncio.Lock()
authenticator = None

# Evolution API subprocess (WhatsApp)
evolution_proc = None

# Per-client routing: resposta da assistente vai para o sid que originou a entrada.
# None = sem alvo de UI (ex.: input vindo do webhook do WhatsApp).
response_target_sid: "str | None" = None
client_types: "dict[str, str]" = {}


def set_response_target(sid: "str | None") -> None:
    """Define o destino da próxima resposta e ajusta o mute do speaker local.

    - sid de cliente `desktop` → alvo = sid, speaker toca normalmente.
    - sid de cliente `mobile` ou None (WhatsApp) → speaker mutado.
    """
    global response_target_sid
    response_target_sid = sid

    client_type = client_types.get(sid) if sid else None
    should_mute = (sid is None) or (client_type == "mobile")

    if audio_loop is not None:
        try:
            audio_loop.speaker_muted = should_mute
        except Exception:
            pass
