"""Utilitários partilhados pelo loop Gemini Live (contexto, datas lembrete, exceções aninhadas)."""
from __future__ import annotations

import os

try:
    from builtins import BaseExceptionGroup
except ImportError:
    from exceptiongroup import BaseExceptionGroup
from datetime import datetime
from zoneinfo import ZoneInfo


def chat_startup_history_limit() -> int:
    """Últimas N mensagens injectadas na sessão Live ao ligar / reconnect."""
    if "ORBITAL_CHAT_STARTUP_CONTEXT_LIMIT" in os.environ:
        raw = (os.getenv("ORBITAL_CHAT_STARTUP_CONTEXT_LIMIT") or "").strip()
        if raw:
            try:
                return max(10, min(500, int(raw)))
            except ValueError:
                pass
    try:
        from orbital.settings import SETTINGS

        return max(10, min(500, int(SETTINGS.get("chat_startup_context_limit", 100))))
    except Exception:
        return 100


def iter_leaf_exceptions(exc: BaseException):
    """Expõe exceções reais dentro de ExceptionGroup (ex.: falha do TaskGroup)."""
    if isinstance(exc, BaseExceptionGroup):
        for e in exc.exceptions:
            yield from iter_leaf_exceptions(e)
    else:
        yield exc


def parse_reminder_starts_at(raw: str) -> tuple[float | None, str | None]:
    """Retorna (unix_timestamp ou None, mensagem de erro ou None)."""
    s = str(raw or "").strip()
    if not s:
        return None, "data/hora vazia"
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None, "ISO 8601 inválido"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
    return dt.timestamp(), None


def normalize_reminder_iso(raw: str) -> str:
    """ISO 8601 normalizado para envio ao n8n (mesma lógica de fuso que starts)."""
    s = str(raw or "").strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("America/Sao_Paulo"))
    return dt.isoformat()
