"""RAG do cérebro Obsidian: chunks + embeddings no Supabase (pgvector)."""

from __future__ import annotations

import logging
import os
import re
import threading
from pathlib import Path
from typing import Any, List, Optional
from urllib.parse import quote

import httpx

from orbital.services.supabase.chat_embeddings import EMBEDDING_DIM, embed_text
from orbital.services.supabase.remote_config import _base_url, _rest_headers, supabase_config_enabled

logger = logging.getLogger("orbital.brain")

_TABLE = "athena_brain_chunk_embeddings"


def normalize_vault_rel(raw: str) -> str:
    s = (raw or "").strip().replace("\\", "/")
    if s.endswith(".md"):
        s = s[:-3]
    return s


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


def brain_rag_enabled() -> bool:
    """Supabase + Gemini + flag; não depende de semantic_search_enabled do chat."""
    if "ORBITAL_BRAIN_RAG" in os.environ:
        if (os.getenv("ORBITAL_BRAIN_RAG") or "").strip().lower() in (
            "0",
            "false",
            "no",
            "off",
        ):
            return False
    if not _settings_bool("brain_rag_enabled", True):
        return False
    if not supabase_config_enabled():
        return False
    if not (os.getenv("GEMINI_API_KEY") or "").strip():
        return False
    return True


def chunk_max_chars() -> int:
    if "ORBITAL_BRAIN_RAG_CHUNK_CHARS" in os.environ:
        try:
            return max(400, min(8000, int((os.getenv("ORBITAL_BRAIN_RAG_CHUNK_CHARS") or "1800").strip())))
        except ValueError:
            pass
    return _settings_int("brain_rag_chunk_max_chars", 1800, 400, 8000)


def chunk_overlap() -> int:
    if "ORBITAL_BRAIN_RAG_CHUNK_OVERLAP" in os.environ:
        try:
            return max(0, min(2000, int((os.getenv("ORBITAL_BRAIN_RAG_CHUNK_OVERLAP") or "200").strip())))
        except ValueError:
            pass
    return _settings_int("brain_rag_chunk_overlap", 200, 0, 2000)


def brain_rag_top_k() -> int:
    return _settings_int("brain_rag_top_k", 8, 1, 50)


def brain_rag_hybrid_keyword_limit() -> int:
    if "BRAIN_RAG_HYBRID_KEYWORD_LIMIT" in os.environ:
        raw = (os.getenv("BRAIN_RAG_HYBRID_KEYWORD_LIMIT") or "").strip()
        if raw:
            try:
                return max(1, min(50, int(raw)))
            except ValueError:
                pass
    return _settings_int("brain_rag_hybrid_keyword_limit", 15, 1, 50)


def chunk_markdown(text: str, max_chars: int, overlap: int) -> List[str]:
    """Quebra por headings Markdown; seções longas são fatiadas com sobreposição."""
    text = (text or "").strip()
    if not text:
        return []

    # Split by heading lines while keeping headings attached to their section
    pieces: List[str] = []
    buf: List[str] = []
    for line in text.splitlines(keepends=True):
        stripped = line.lstrip()
        if stripped.startswith("#") and buf:
            pieces.append("".join(buf).strip())
            buf = [line]
        else:
            buf.append(line)
    if buf:
        pieces.append("".join(buf).strip())

    if len(pieces) == 1 and not pieces[0].lstrip().startswith("#"):
        pieces = [p.strip() for p in re.split(r"\n\n+", text) if p.strip()]

    out: List[str] = []
    for sec in pieces:
        sec = sec.strip()
        if not sec:
            continue
        if len(sec) <= max_chars:
            out.append(sec)
            continue
        start = 0
        n = len(sec)
        while start < n:
            end = min(start + max_chars, n)
            chunk = sec[start:end].strip()
            if chunk:
                out.append(chunk)
            if end >= n:
                break
            start = max(start + 1, end - overlap)
    return out


def _delete_chunks_for_path(vault_path_norm: str) -> bool:
    base = _base_url()
    if not base:
        return False
    enc = quote(vault_path_norm, safe="")
    url = f"{base}/rest/v1/{_TABLE}?vault_path=eq.{enc}"
    try:
        with httpx.Client() as client:
            r = client.delete(url, headers=_rest_headers(), timeout=30.0)
            if r.status_code not in (200, 204):
                logger.warning("BRAIN_RAG DELETE chunks status=%s %s", r.status_code, r.text[:200])
                return False
        return True
    except Exception as e:
        logger.error("BRAIN_RAG DELETE chunks: %s", e)
        return False


def _insert_chunk_rows(rows: List[dict]) -> bool:
    if not rows:
        return True
    base = _base_url()
    if not base:
        return False
    try:
        with httpx.Client() as client:
            r = client.post(
                f"{base}/rest/v1/{_TABLE}",
                headers={
                    **_rest_headers(),
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                },
                json=rows,
                timeout=120.0,
            )
            if r.status_code not in (200, 201):
                logger.warning("BRAIN_RAG INSERT status=%s %s", r.status_code, r.text[:300])
                return False
        return True
    except Exception as e:
        logger.error("BRAIN_RAG INSERT: %s", e)
        return False


def index_vault_note(vault_root: Path, vault_rel: str) -> dict:
    """Reindexa uma nota: apaga chunks antigos do path, gera novos embeddings e insere."""
    if not brain_rag_enabled():
        return {"ok": False, "error": "brain_rag disabled or missing Supabase/Gemini"}
    root = Path(vault_root).resolve()
    norm = normalize_vault_rel(vault_rel)
    abs_path = root / f"{norm}.md"
    if not abs_path.is_file():
        # try exact rel with backslash
        alt = root / vault_rel.replace("\\", "/")
        if not alt.is_file():
            alt = root / f"{vault_rel}"
        abs_path = alt if alt.is_file() else abs_path

    if not abs_path.is_file():
        logger.warning("BRAIN_RAG index skip missing file %s", abs_path)
        return {"ok": False, "error": f"file not found: {norm}"}

    try:
        body = abs_path.read_text(encoding="utf-8")
    except Exception as e:
        return {"ok": False, "error": str(e)}

    mc = chunk_max_chars()
    ov = chunk_overlap()
    chunks = chunk_markdown(body, mc, ov)
    if not chunks:
        _delete_chunks_for_path(norm)
        return {"ok": True, "chunks": 0, "vault_path": norm}

    rows: List[dict] = []
    for i, ch in enumerate(chunks):
        vec = embed_text(ch)
        if not vec or len(vec) != EMBEDDING_DIM:
            logger.warning("BRAIN_RAG embed failed chunk %d note=%s", i, norm)
            continue
        rows.append({
            "vault_path": norm,
            "chunk_index": i,
            "chunk_text": ch,
            "embedding": vec,
        })

    if not rows:
        _delete_chunks_for_path(norm)
        return {"ok": False, "error": "no embeddings produced"}

    if not _delete_chunks_for_path(norm):
        return {"ok": False, "error": "failed to delete old chunks"}

    if not _insert_chunk_rows(rows):
        return {"ok": False, "error": "failed to insert chunks"}

    logger.info("BRAIN_RAG indexed note=%s chunks=%d", norm, len(rows))
    return {"ok": True, "chunks": len(rows), "vault_path": norm}


def rebuild_all(vault_root: Path) -> dict:
    """Reindexa todas as notas do vault (exceto .obsidian)."""
    root = Path(vault_root).resolve()
    if not root.is_dir():
        return {"ok": False, "error": "not a directory"}
    count_ok = 0
    errors: List[str] = []
    for md in sorted(root.rglob("*.md")):
        rel = md.relative_to(root)
        if rel.parts and rel.parts[0] == ".obsidian":
            continue
        norm = normalize_vault_rel(str(rel.as_posix()))
        res = index_vault_note(root, norm)
        if res.get("ok"):
            count_ok += 1
        else:
            errors.append(f"{norm}: {res.get('error', '?')}")
    return {"ok": True, "notes_indexed": count_ok, "errors": errors}


def rpc_match_brain_semantic(query: str, limit: int) -> Optional[List[dict]]:
    if not brain_rag_enabled():
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
                f"{base}/rest/v1/rpc/match_brain_semantic",
                headers={**_rest_headers(), "Content-Type": "application/json"},
                json={"query_embedding": vec, "match_count": lim},
                timeout=45.0,
            )
            if r.status_code != 200:
                logger.warning(
                    "BRAIN_RAG rpc match_brain_semantic status=%s %s",
                    r.status_code,
                    r.text[:300],
                )
                return None
            rows = r.json()
    except Exception as e:
        logger.error("BRAIN_RAG rpc: %s", e)
        return None
    return rows if isinstance(rows, list) else None


def _semantic_fallback_enabled() -> bool:
    return _settings_bool("brain_rag_semantic_fallback_keyword", True)


def _format_semantic_rows(rows: List[dict]) -> str:
    parts: List[str] = []
    for r in rows:
        sim = r.get("similarity")
        sim_s = f"{float(sim):.3f}" if sim is not None else "?"
        vp = r.get("vault_path", "?")
        ct = (r.get("chunk_text") or "").strip()
        parts.append(f"--- {vp} (similarity {sim_s}) ---\n{ct}")
    return "\n\n".join(parts)


def _format_keyword_matches(matches: List[dict]) -> str:
    parts: List[str] = []
    for hit in matches:
        parts.append(f"--- {hit['note']} (line {hit['line']}) ---\n{hit['snippet']}")
    return "\n\n".join(parts)


def search_brain_formatted(brain: Any, query: str, mode: Optional[str] = None) -> str:
    """Resultado textual único para search_brain (keyword, semantic ou hybrid)."""
    q = (query or "").strip()
    if not q:
        return "query is required."

    m = (mode or "keyword").strip().lower()
    if m not in ("keyword", "semantic", "hybrid"):
        m = "keyword"

    if m == "hybrid":
        cap_kw = brain_rag_hybrid_keyword_limit()
        all_kw = brain.search_notes(q)
        kw = all_kw[:cap_kw] if len(all_kw) > cap_kw else all_kw

        blocks: List[str] = []
        sem_rows: Optional[List[dict]] = None

        if brain_rag_enabled():
            sem_rows = rpc_match_brain_semantic(q, brain_rag_top_k())
            if sem_rows is None:
                blocks.append(
                    "[Semantic] Vector search failed or unavailable. "
                    "Check Supabase RPC match_brain_semantic and GEMINI_API_KEY."
                )
                kw_display = list(kw)
            elif not sem_rows:
                blocks.append(
                    "[Semantic] No vector matches (empty index or query too narrow for embeddings)."
                )
                kw_display = list(kw)
            else:
                blocks.append(
                    f"[Semantic — meaning] {len(sem_rows)} match(es) for '{q}':\n\n"
                    + _format_semantic_rows(sem_rows)
                )
                sem_paths = {
                    normalize_vault_rel(str(r.get("vault_path", ""))) for r in sem_rows
                }
                kw_display = [h for h in kw if normalize_vault_rel(h["note"]) not in sem_paths]
        else:
            blocks.append(
                "[Semantic] Skipped (brain RAG disabled or missing Supabase/Gemini)."
            )
            kw_display = list(kw)

        if kw_display:
            blocks.append(
                f"[Keyword — literal substring] {len(kw_display)} note(s) for '{q}':\n\n"
                + _format_keyword_matches(kw_display)
            )
        elif kw:
            blocks.append(
                "[Keyword] Literal substring hits only repeat notes already listed in semantic results."
            )

        has_sem_hits = sem_rows is not None and len(sem_rows) > 0
        if not kw and not has_sem_hits:
            if blocks:
                return "\n\n".join(blocks)
            return f"No results for '{q}' (hybrid: no keyword or semantic hits)."

        return "\n\n".join(blocks)

    if m == "semantic":
        rows = rpc_match_brain_semantic(q, brain_rag_top_k())
        if rows is None and _semantic_fallback_enabled():
            matches = brain.search_notes(q)
            if not matches:
                return (
                    f"No notes found for '{q}' (semantic search unavailable; tried keyword fallback)."
                )
            parts = []
            for hit in matches:
                parts.append(f"--- {hit['note']} (line {hit['line']}) ---\n{hit['snippet']}")
            return (
                f"Semantic search unavailable; keyword fallback — {len(matches)} note(s) for '{q}':\n\n"
                + "\n\n".join(parts)
            )
        if rows is None:
            return (
                f"[search_brain semantic] Unavailable: configure Supabase, run SQL for "
                f"{_TABLE}, set GEMINI_API_KEY, and ensure the vault is indexed."
            )
        if not rows:
            return f"No semantic matches for '{q}' (index may be empty; try after notes are saved or rebuild)."
        return f"Found {len(rows)} semantic match(es) for '{q}':\n\n" + _format_semantic_rows(rows)

    matches = brain.search_notes(q)
    if not matches:
        return f"No notes found matching '{q}'."
    parts = []
    for hit in matches:
        parts.append(f"--- {hit['note']} (line {hit['line']}) ---\n{hit['snippet']}")
    return f"Found {len(matches)} note(s) matching '{q}':\n\n" + "\n\n".join(parts)


def schedule_reindex_note(vault_root: Path | str, vault_rel: str) -> None:
    """Reindexação em background após write_brain."""

    def _run():
        try:
            index_vault_note(Path(vault_root), vault_rel)
        except Exception as e:
            logger.error("BRAIN_RAG schedule reindex: %s", e)

    threading.Thread(target=_run, name="brain-rag-reindex", daemon=True).start()
