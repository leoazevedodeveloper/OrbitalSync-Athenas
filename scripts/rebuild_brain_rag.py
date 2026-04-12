#!/usr/bin/env python3
"""
Reindexação completa do vault Obsidian → chunks + embeddings no Supabase (RAG).

Uso (na raiz do repositório):
  cd backend
  python ..\\scripts\\rebuild_brain_rag.py

Ou, com venv ativo e cwd = backend:
  python ..\\scripts\\rebuild_brain_rag.py

Requer: .env na raiz com GEMINI_API_KEY, SUPABASE_URL, chave Supabase;
         SQL `supabase/athena_brain_chunk_embeddings.sql` já aplicado no projeto.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_BACKEND = _REPO_ROOT / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

os.chdir(_BACKEND)

from dotenv import load_dotenv

load_dotenv(_REPO_ROOT / ".env", override=False)

from orbital.paths import REPO_ROOT
from orbital.services.brain_rag import brain_rag_enabled, rebuild_all


def main() -> int:
    vault = (os.environ.get("ORBITAL_BRAIN_PATH") or "").strip() or str(
        REPO_ROOT / "data" / "memory" / "OrbitalSync"
    )
    vp = Path(vault).resolve()
    print(f"[rebuild_brain_rag] vault={vp}")
    if not brain_rag_enabled():
        print(
            "[rebuild_brain_rag] AVISO: brain_rag_enabled()=false "
            "(SUPABASE_URL+key, GEMINI_API_KEY, ORBITAL_BRAIN_RAG não off). "
            "Indexação pode falhar nos embeddings/remoto."
        )
    out = rebuild_all(vp)
    print(out)
    if not out.get("ok"):
        return 1
    errs = out.get("errors") or []
    if errs:
        print(f"[rebuild_brain_rag] {len(errs)} nota(s) com erro; ver lista em 'errors'.")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
