"""Assistente de voz ATHENAS (Gemini Live + ferramentas locais)."""
from .audio_loop import AudioLoop
from .constants import DEFAULT_MODE, MODEL
from .devices import get_input_devices, get_output_devices

__all__ = [
    "AudioLoop",
    "DEFAULT_MODE",
    "MODEL",
    "get_input_devices",
    "get_output_devices",
]
