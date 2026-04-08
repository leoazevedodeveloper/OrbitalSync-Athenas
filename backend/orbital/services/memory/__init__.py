"""Memória remota: classificação via Ollama (ver gemini_gate); política em salience.py."""

from orbital.services.memory.salience import (
    is_ollama_gate_enabled,
    is_selective_remote_enabled,
    should_sync_to_remote_memory,
)

__all__ = [
    "is_ollama_gate_enabled",
    "is_selective_remote_enabled",
    "should_sync_to_remote_memory",
]
