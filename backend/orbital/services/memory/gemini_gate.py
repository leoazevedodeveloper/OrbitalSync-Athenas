"""
Classificador 100% via Ollama: se a linha de chat deve ir à memória remota + embeddings.

Única lógica de «o que é memória» está no prompt abaixo — não há listas de palavras no resto do backend.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Optional, Tuple

import httpx

_MAX_MESSAGE_CHARS = 4000


def _gate_model() -> str:
    for key in ("ORBITAL_MEMORY_GATE_MODEL", "ORBITAL_MEMORY_OLLAMA_MODEL"):
        v = (os.getenv(key) or "").strip()
        if v:
            return v
    try:
        from orbital.settings import SETTINGS

        v = (
            str(SETTINGS.get("memory_gate_model") or "").strip()
            or str(SETTINGS.get("memory_ollama_model") or "").strip()
        )
        if v:
            return v
    except Exception:
        pass
    return "qwen2.5:7b"


def _ollama_base_url() -> str:
    v = (os.getenv("ORBITAL_MEMORY_OLLAMA_URL") or "").strip()
    if v:
        return v.rstrip("/")
    try:
        from orbital.settings import SETTINGS

        v = str(SETTINGS.get("memory_ollama_url") or "").strip()
        if v:
            return v.rstrip("/")
    except Exception:
        pass
    return "http://127.0.0.1:11434"


def _gate_retries() -> int:
    raw = (os.getenv("ORBITAL_MEMORY_GATE_RETRIES") or "").strip()
    if raw:
        try:
            return max(1, min(5, int(raw)))
        except ValueError:
            pass
    try:
        from orbital.settings import SETTINGS

        return max(1, min(5, int(SETTINGS.get("memory_gate_retries", 3))))
    except Exception:
        return 3


def _gate_timeout_sec() -> float:
    raw = (os.getenv("ORBITAL_MEMORY_GATE_TIMEOUT_SEC") or "").strip()
    if raw:
        try:
            return max(3.0, min(120.0, float(raw)))
        except ValueError:
            pass
    try:
        from orbital.settings import SETTINGS

        return max(3.0, min(120.0, float(SETTINGS.get("memory_gate_timeout_sec", 20))))
    except Exception:
        return 20.0

_SYSTEM = """You are the ONLY judge of long-term memory for assistant ATHENAS (user Leo). Input may be Brazilian Portuguese or English.

You will receive one chat line: sender (User or ATHENAS), optional image metadata, and message text (possibly empty if image-only).

Task: should THIS line be stored in a persistent database with semantic search so it can be recalled weeks later?

persist=true if ANY of these apply:
- User states personal life context: moving / relocation, cities or places they live or left, address, job change, studies, family, health, travel plans, important dates they mention about themselves.
- User or assistant states a preference, fact, commitment, decision, project detail, technical info, password/API key the user chose to share, URL, date/time commitment, name, quantity, instruction to remember something substantive.
- Substantive question or answer (not pure greeting).
- Image attachment: persist=true if the image likely documents something useful (screenshot, diagram, photo of notes); persist=false if it is clearly throwaway or there is no signal (you may still use text cues).

persist=false if the line is purely ephemeral social glue with no durable fact: greetings alone, thanks/ok/yep, generic «how can I help», short acknowledgments, joke with no information, timer/countdown/alarm/stopwatch requests only, empty chit-chat, or assistant boilerplate that adds zero new fact.

Tie-break: if the sender is User and the message states any concrete personal or situational fact (including relocation or place names), use persist=true. If unsure only for generic ATHENAS lines that merely react politely without adding facts, use persist=false.

Output ONLY valid JSON (no markdown):
{"persist": <true|false>, "reason": "<short English phrase>"}"""


def _parse_gate_response(raw: str) -> Tuple[bool, str]:
    s = (raw or "").strip()
    if not s:
        return False, "ollama_empty_body"
    try:
        if "```" in s:
            m = re.search(r"\{[\s\S]*\}", s)
            if m:
                s = m.group(0)
        obj: Dict[str, Any] = json.loads(s)
    except json.JSONDecodeError:
        return False, "ollama_bad_json"

    p = obj.get("persist")
    if p is True:
        reason = str(obj.get("reason") or "ollama_yes").strip() or "ollama_yes"
        return True, f"ollama:{reason[:120]}"
    if p is False:
        reason = str(obj.get("reason") or "ollama_no").strip() or "ollama_no"
        return False, f"ollama:{reason[:120]}"
    return False, "ollama_missing_persist"


def gate_persist_long_term_memory(
    sender: str,
    text: str,
    *,
    mime_type: Optional[str] = None,
    image_relpath: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Uma chamada curta ao modelo; falha → (False, motivo), transcript local já existe.
    """
    body = (text or "").strip()
    if len(body) > _MAX_MESSAGE_CHARS:
        body = body[:_MAX_MESSAGE_CHARS] + "…"

    lines = [f"sender: {sender or 'Unknown'}"]
    mt = (mime_type or "").strip()
    if mt:
        lines.append(f"mime_type: {mt}")
    ir = (image_relpath or "").strip()
    if ir:
        lines.append(f"image_saved_path_hint: {ir}")
    if body:
        lines.append(f"message:\n{body}")
    else:
        lines.append("message: (empty — classify from sender role and attachment metadata if any)")

    user_block = "\n".join(lines).strip()

    model = _gate_model()
    ollama_url = _ollama_base_url()
    max_attempts = _gate_retries()
    timeout_sec = _gate_timeout_sec()

    for attempt in range(max_attempts):
        try:
            with httpx.Client(timeout=timeout_sec) as client:
                res = client.post(
                    f"{ollama_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": f"{_SYSTEM}\n\n{user_block}",
                        "stream": False,
                        "format": "json",
                        "options": {
                            "temperature": 0,
                        },
                    },
                )
            if res.status_code == 404:
                return False, "ollama_unavailable"
            res.raise_for_status()
            payload = res.json() if res.content else {}
            raw = str(payload.get("response") or "").strip()
            return _parse_gate_response(raw)
        except Exception as e:
            if attempt + 1 < max_attempts:
                continue
            print(f"[MEMORY_GATE] Falha Ollama: {e!r}")
            return False, "ollama_request_error"

    return False, "ollama_request_error"
