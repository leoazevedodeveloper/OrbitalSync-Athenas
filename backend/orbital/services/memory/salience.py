"""
Política de envio ao Supabase (memória remota + embeddings).

- Transcrição completa: `chat_history.jsonl` (ProjectManager).
- Modo seletivo: **só o Ollama** classifica se a linha vai ao remoto — sem listas de palavras ou regex
  de conteúdo no código (apenas «vazio real» não chama o modelo).

Emergency bypass: `memory_ollama_gate_enabled=false` ou `ORBITAL_MEMORY_OLLAMA_GATE=off` → envia ao remoto
qualquer linha com texto ou imagem (sem classificador).
"""
from __future__ import annotations

import os
from typing import Optional, Tuple


def is_selective_remote_enabled() -> bool:
    raw = (os.getenv("ORBITAL_MEMORY_FULL_REMOTE") or "").strip().lower()
    if raw in ("1", "true", "yes", "all", "on"):
        return False
    try:
        from orbital.settings import SETTINGS

        if bool(SETTINGS.get("memory_full_remote", False)):
            return False
        return bool(SETTINGS.get("memory_remote_selective", True))
    except Exception:
        return True


def _salience_debug_enabled() -> bool:
    raw = (os.getenv("ORBITAL_MEMORY_SALIENCE_DEBUG") or "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on"):
        return True
    try:
        from orbital.settings import SETTINGS

        return bool(SETTINGS.get("memory_salience_debug", False))
    except Exception:
        return False


def is_ollama_gate_enabled() -> bool:
    olla = (os.getenv("ORBITAL_MEMORY_OLLAMA_GATE") or "").strip().lower()
    gem_env = (os.getenv("ORBITAL_MEMORY_GEMINI_GATE") or "").strip().lower()
    if olla in ("0", "false", "no", "off"):
        return False
    if olla in ("1", "true", "yes", "on"):
        return True
    if gem_env in ("0", "false", "no", "off"):
        return False
    if gem_env in ("1", "true", "yes", "on"):
        return True
    try:
        from orbital.settings import SETTINGS

        return bool(SETTINGS.get("memory_ollama_gate_enabled", True)) and bool(
            SETTINGS.get("memory_gemini_gate_enabled", True)
        )
    except Exception:
        return True


def _has_any_payload(
    text: str,
    *,
    mime_type: Optional[str] = None,
    image_relpath: Optional[str] = None,
) -> bool:
    if (text or "").strip():
        return True
    if image_relpath and str(image_relpath).strip():
        return True
    mt = (mime_type or "").strip().lower()
    return mt.startswith("image/")


def should_sync_to_remote_memory(
    sender: str,
    text: str,
    *,
    selective: bool = True,
    mime_type: Optional[str] = None,
    image_relpath: Optional[str] = None,
) -> Tuple[bool, str]:
    if not selective:
        return True, "legacy_full_sync"

    if not _has_any_payload(text, mime_type=mime_type, image_relpath=image_relpath):
        return False, "empty"

    if not is_ollama_gate_enabled():
        return True, "ollama_gate_bypass"

    from orbital.services.memory.gemini_gate import gate_persist_long_term_memory

    persist, reason = gate_persist_long_term_memory(
        sender or "",
        text or "",
        mime_type=mime_type,
        image_relpath=image_relpath,
    )
    if _salience_debug_enabled():
        print(
            f"[MEMORY] LLM persist={persist} ({reason}) sender={sender!r} "
            f"text_len={len((text or '').strip())} img={bool(image_relpath)}"
        )
    return persist, reason
