"""
Persistência de histórico de chat no Supabase (PostgREST).

Usado quando `supabase_config_enabled()` é True; caso contrário o ProjectManager
continua só com `chat_history.jsonl`.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx

from .remote_config import (
    _base_url,
    _rest_headers,
    supabase_config_enabled,
)


def _parse_created_at(iso: str) -> float:
    if not iso:
        return 0.0
    s = iso.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def append_chat_message(
    project_name: str,
    sender: str,
    text: str,
    *,
    mime_type: Optional[str] = None,
    image_relpath: Optional[str] = None,
    memory_salience: Optional[str] = None,
) -> bool:
    """
    Insere uma linha em `athena_chat_messages`. Retorna True se gravou no remoto.
    """
    if not supabase_config_enabled():
        return False

    meta: Dict[str, Any] = {}
    if mime_type:
        meta["mime_type"] = mime_type
    if image_relpath:
        meta["image_relpath"] = image_relpath
    if memory_salience:
        meta["memory_salience"] = memory_salience

    row = {
        "project_name": project_name,
        "sender": sender,
        "message_text": text,
        "meta": meta,
    }

    base = _base_url()
    if not base:
        return False

    try:
        with httpx.Client() as client:
            r = client.post(
                f"{base}/rest/v1/athena_chat_messages",
                headers={
                    **_rest_headers(),
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                },
                json=row,
                timeout=20.0,
            )
            r.raise_for_status()
            body = r.json()
            rid = None
            if isinstance(body, list) and body:
                rid = body[0].get("id")
            elif isinstance(body, dict):
                rid = body.get("id")
            if rid and str(text).strip():
                from .chat_embeddings import schedule_embed_for_message

                schedule_embed_for_message(str(rid), text, sender=sender)
        return True
    except Exception as e:
        print(f"[SUPABASE_CHAT] Falha ao inserir mensagem: {e}")
        return False


def _row_to_entry(row: dict) -> dict:
    entry: Dict[str, Any] = {
        "timestamp": _parse_created_at(str(row.get("created_at") or "")),
        "sender": row.get("sender") or "Unknown",
        "text": row.get("message_text") or "",
    }
    meta = row.get("meta")
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            meta = {}
    if isinstance(meta, dict):
        if meta.get("mime_type"):
            entry["mime_type"] = meta["mime_type"]
        if meta.get("image_relpath"):
            entry["image_relpath"] = meta["image_relpath"]
    return entry


def fetch_recent_messages(project_name: str, limit: int) -> Optional[List[dict]]:
    """
    Últimas `limit` mensagens do projeto, da mais antiga à mais recente (igual ao jsonl).
    Retorna None se Supabase inativo ou erro (caller usa fallback disco).
    """
    if not supabase_config_enabled():
        return None

    base = _base_url()
    if not base:
        return None

    lim = max(1, min(500, int(limit)))
    proj_q = quote(project_name, safe="")
    path = (
        f"/rest/v1/athena_chat_messages"
        f"?project_name=eq.{proj_q}"
        f"&select=sender,message_text,meta,created_at"
        f"&order=created_at.desc"
        f"&limit={lim}"
    )

    try:
        with httpx.Client() as client:
            r = client.get(f"{base}{path}", headers=_rest_headers(), timeout=20.0)
            r.raise_for_status()
            rows = r.json()
    except Exception as e:
        print(f"[SUPABASE_CHAT] Falha ao ler histórico: {e}")
        return None

    if not isinstance(rows, list):
        return None

    entries = [_row_to_entry(row) for row in rows]
    entries.reverse()
    return entries


def _search_messages_ilike(
    client: httpx.Client, base: str, project_name: str, q: str, lim: int
) -> Optional[List[dict]]:
    proj_q = quote(project_name, safe="")
    text_q = quote(f"*{q}*", safe="")
    path = (
        f"/rest/v1/athena_chat_messages"
        f"?project_name=eq.{proj_q}"
        f"&message_text=ilike.{text_q}"
        f"&select=sender,message_text,meta,created_at"
        f"&order=created_at.desc"
        f"&limit={lim}"
    )
    try:
        r = client.get(f"{base}{path}", headers=_rest_headers(), timeout=20.0)
        r.raise_for_status()
        rows = r.json()
    except Exception as e:
        print(f"[SUPABASE_CHAT] Falha ao buscar histórico (ilike): {e}")
        return None
    if not isinstance(rows, list):
        return None
    entries = [_row_to_entry(row) for row in rows]
    entries.reverse()
    return entries


def _search_semantic(project_name: str, q: str, lim: int) -> Optional[List[dict]]:
    """Busca por similaridade (pgvector). None = indisponível/erro; [] = sem resultados."""
    from .chat_embeddings import rpc_match_semantic

    rows = rpc_match_semantic(project_name, q, lim)
    if rows is None:
        return None
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        out.append(
            _row_to_entry(
                {
                    "sender": row.get("sender"),
                    "message_text": row.get("message_text"),
                    "meta": row.get("meta"),
                    "created_at": row.get("created_at"),
                }
            )
        )
    return out


def search_messages(project_name: str, query: str, limit: int = 10) -> Optional[List[dict]]:
    """
    Busca no histórico remoto: semântica (pgvector) → full-text (`fts`) → ILIKE.
    Retorna None se Supabase inativo ou erro total (caller usa fallback disco).
    """
    if not supabase_config_enabled():
        return None

    base = _base_url()
    if not base:
        return None

    q = (query or "").strip()
    if not q:
        return []

    lim = max(1, min(50, int(limit)))

    sem = _search_semantic(project_name, q, lim)
    if sem is not None and len(sem) > 0:
        print(f"[SUPABASE_CHAT] Busca semântica: {len(sem)} resultado(s)")
        return sem

    try:
        with httpx.Client() as client:
            r = client.get(
                f"{base}/rest/v1/athena_chat_messages",
                headers=_rest_headers(),
                params={
                    "project_name": f"eq.{project_name}",
                    "search_tsv": f"fts(simple).{q}",
                    "select": "sender,message_text,meta,created_at",
                    "order": "created_at.desc",
                    "limit": str(lim),
                },
                timeout=20.0,
            )
            if r.status_code == 200:
                rows = r.json()
                if isinstance(rows, list):
                    entries = [_row_to_entry(row) for row in rows]
                    entries.reverse()
                    return entries
            print(
                f"[SUPABASE_CHAT] FTS status={r.status_code} body={r.text[:200]!r} — tentando ilike"
            )
            return _search_messages_ilike(client, base, project_name, q, lim)
    except Exception as e:
        print(f"[SUPABASE_CHAT] FTS exceção: {e} — tentando ilike")
        try:
            with httpx.Client() as client:
                return _search_messages_ilike(client, base, project_name, q, lim)
        except Exception as e2:
            print(f"[SUPABASE_CHAT] ilike após FTS falhou: {e2}")
            return None
