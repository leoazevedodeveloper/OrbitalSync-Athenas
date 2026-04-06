"""
Embeddings semânticos para busca no histórico (Gemini + Supabase pgvector).

Modelo: gemini-embedding-001, 768 dim (alinhado à coluna vector(768) no SQL).
"""
from __future__ import annotations

import os
import threading
from typing import List, Optional, Set

import httpx
from google.genai import types

from .remote_config import (
    _base_url,
    _rest_headers,
    supabase_config_enabled,
)

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 768
_DEFAULT_MAX_EMBED_CHARS = 8000
_DEFAULT_EMBED_SENDERS = "User, ATHENAS"


def _settings_bool(key: str, default: bool) -> bool:
    try:
        from orbital.settings import SETTINGS

        if key not in SETTINGS:
            return default
        return bool(SETTINGS[key])
    except Exception:
        return default


def _settings_int(key: str, default: int, lo: int, hi: int) -> int:
    try:
        from orbital.settings import SETTINGS

        if key not in SETTINGS:
            return default
        v = SETTINGS[key]
        if isinstance(v, bool):
            v = int(v)
        n = int(v)
        return max(lo, min(hi, n))
    except Exception:
        return default


def _settings_str(key: str, default: str) -> str:
    try:
        from orbital.settings import SETTINGS

        if key not in SETTINGS:
            return default
        s = str(SETTINGS[key] or "").strip()
        return s if s else default
    except Exception:
        return default


def _max_embed_input_chars() -> int:
    if "ORBITAL_EMBED_MAX_CHARS" in os.environ:
        raw = (os.getenv("ORBITAL_EMBED_MAX_CHARS") or "").strip()
        if not raw:
            return _DEFAULT_MAX_EMBED_CHARS
        try:
            return max(200, min(8000, int(raw)))
        except ValueError:
            return _DEFAULT_MAX_EMBED_CHARS
    return _settings_int(
        "semantic_embed_max_chars", _DEFAULT_MAX_EMBED_CHARS, 200, 8000
    )


def _embed_allowed_senders() -> Optional[Set[str]]:
    """
    None = qualquer sender.
    Set vazio trata-se como None (qualquer um).
    """
    if "ORBITAL_EMBED_SENDERS" in os.environ:
        raw = (os.getenv("ORBITAL_EMBED_SENDERS") or "").strip()
        if not raw:
            return {"user"}
        parts = {p.strip().casefold() for p in raw.split(",") if p.strip()}
        if "*" in parts or "all" in parts:
            return None
        return parts or None
    raw = _settings_str("semantic_embed_senders", _DEFAULT_EMBED_SENDERS)
    parts = {p.strip().casefold() for p in raw.split(",") if p.strip()}
    if "*" in parts or "all" in parts:
        return None
    return parts or None


def _embed_min_text_length() -> int:
    if "ORBITAL_EMBED_MIN_LENGTH" in os.environ:
        raw = (os.getenv("ORBITAL_EMBED_MIN_LENGTH") or "").strip()
        if not raw:
            return 24
        try:
            return max(0, min(500, int(raw)))
        except ValueError:
            return 24
    return _settings_int("semantic_embed_min_length", 24, 0, 500)


def indexing_enabled() -> bool:
    if "ORBITAL_EMBED_INDEX" in os.environ:
        if (os.getenv("ORBITAL_EMBED_INDEX") or "").strip().lower() in (
            "0",
            "false",
            "no",
            "off",
        ):
            return False
    elif not _settings_bool("semantic_embed_index", True):
        return False
    return semantic_search_enabled()


def should_embed_message(sender: str, text: str) -> bool:
    """Evita gastar quota em mensagens curtas ou remetentes excluídos."""
    if not indexing_enabled():
        return False
    t = (text or "").strip()
    if len(t) < _embed_min_text_length():
        return False
    allowed = _embed_allowed_senders()
    if allowed is None:
        return True
    s = (sender or "").strip().casefold()
    return s in allowed


def semantic_search_enabled() -> bool:
    if "ORBITAL_CHAT_SEMANTIC" in os.environ:
        if (os.getenv("ORBITAL_CHAT_SEMANTIC") or "").strip().lower() in (
            "0",
            "false",
            "no",
            "off",
        ):
            return False
    elif not _settings_bool("semantic_search_enabled", True):
        return False
    if not supabase_config_enabled():
        return False
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    return bool(key)


def _get_genai_client():
    from orbital.assistant.gemini_setup import get_gemini_client

    return get_gemini_client()


def embed_text(text: str) -> Optional[List[float]]:
    """Retorna vetor 768d ou None."""
    raw = (text or "").strip()
    if not raw:
        return None
    cap = _max_embed_input_chars()
    if len(raw) > cap:
        raw = raw[:cap]

    client = _get_genai_client()
    if client is None:
        return None
    try:
        res = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=raw,
            config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM),
        )
        vals = res.embeddings[0].values
        if not vals or len(vals) != EMBEDDING_DIM:
            print(
                f"[CHAT_EMBED] Dimensão inesperada: {len(vals) if vals else 0} (esperado {EMBEDDING_DIM})"
            )
            return None
        return list(vals)
    except Exception as e:
        print(f"[CHAT_EMBED] Falha ao gerar embedding: {e}")
        return None


def upsert_message_embedding(message_id: str, embedding: List[float]) -> bool:
    if not supabase_config_enabled() or len(embedding) != EMBEDDING_DIM:
        return False
    base = _base_url()
    if not base:
        return False
    row = {"message_id": message_id, "embedding": embedding}
    try:
        with httpx.Client() as client:
            r = client.post(
                f"{base}/rest/v1/athena_chat_message_embeddings",
                headers={
                    **_rest_headers(),
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal,resolution=merge-duplicates",
                },
                json=row,
                timeout=25.0,
            )
            r.raise_for_status()
        return True
    except Exception as e:
        print(f"[CHAT_EMBED] Falha ao gravar embedding no Supabase: {e}")
        return False


def schedule_embed_for_message(
    message_id: str, text: str, sender: Optional[str] = None
) -> None:
    """Dispara indexação em background (não bloqueia o insert do chat)."""
    if not should_embed_message(sender or "", text):
        return

    def _run():
        vec = embed_text(text)
        if vec:
            upsert_message_embedding(message_id, vec)

    threading.Thread(target=_run, name="chat-embed", daemon=True).start()


def rpc_match_semantic(
    project_name: str, query: str, limit: int
) -> Optional[List[dict]]:
    """
    Chama match_chat_semantic no PostgREST.
    Retorna lista de dicts (sender, message_text, meta, created_at, similarity) ou None se erro.
    Ordem: melhor similaridade primeiro.
    """
    if not semantic_search_enabled():
        return None

    vec = embed_text(query)
    if not vec:
        return None

    base = _base_url()
    if not base:
        return None

    lim = max(1, min(50, int(limit)))
    try:
        with httpx.Client() as client:
            r = client.post(
                f"{base}/rest/v1/rpc/match_chat_semantic",
                headers={**_rest_headers(), "Content-Type": "application/json"},
                json={
                    "query_embedding": vec,
                    "p_project_name": project_name,
                    "match_count": lim,
                },
                timeout=30.0,
            )
            if r.status_code != 200:
                print(
                    f"[CHAT_EMBED] RPC match_chat_semantic status={r.status_code} {r.text[:300]!r}"
                )
                return None
            rows = r.json()
    except Exception as e:
        print(f"[CHAT_EMBED] RPC match_chat_semantic exceção: {e}")
        return None

    if not isinstance(rows, list):
        return None
    return rows
