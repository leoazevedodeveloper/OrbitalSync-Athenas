"""Estado de settings — preenchido a partir do Supabase (`try_apply_supabase_config` no bootstrap)."""
from typing import Any, Dict

from orbital.paths import REPO_ROOT

PROJECT_ROOT = REPO_ROOT

SETTINGS: Dict[str, Any] = {"tool_permissions": {}}

SEMANTIC_MEMORY_DEFAULTS: Dict[str, Any] = {
    # RAG do vault (chunks no Supabase pgvector)
    "brain_rag_enabled": True,
    "brain_rag_top_k": 8,
    "brain_rag_chunk_max_chars": 1800,
    "brain_rag_chunk_overlap": 200,
    "brain_rag_semantic_fallback_keyword": True,
    "brain_rag_hybrid_keyword_limit": 15,
}


def apply_semantic_memory_defaults(settings: Dict[str, Any]) -> None:
    for k, v in SEMANTIC_MEMORY_DEFAULTS.items():
        settings.setdefault(k, v)


def load_settings() -> None:
    """Recarrega do banco (Supabase). Sem credenciais, mantém apenas a estrutura vazia."""
    SETTINGS.clear()
    SETTINGS["tool_permissions"] = {}
    try:
        from orbital.services.supabase.remote_config import (
            supabase_config_enabled,
            try_apply_supabase_config,
        )

        if supabase_config_enabled():
            try_apply_supabase_config(SETTINGS)
        else:
            print(
                "[SETTINGS] Supabase inativo (defina SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). "
                "SETTINGS sem dados até o .env estar correto."
            )
    except Exception as e:
        print(f"[SETTINGS] Falha ao carregar do banco: {e}")
    apply_semantic_memory_defaults(SETTINGS)


def save_settings() -> None:
    try:
        from orbital.services.supabase.remote_config import (
            persist_settings_to_supabase,
            supabase_config_enabled,
        )

        if not supabase_config_enabled():
            print(
                "[SETTINGS] Gravação ignorada: Supabase não configurado "
                "(SUPABASE_URL + chave de serviço)."
            )
            return
        ok, err = persist_settings_to_supabase(SETTINGS)
        if ok:
            print("Settings saved (Supabase).")
        else:
            print(f"Error saving settings to Supabase: {err}")
    except Exception as e:
        print(f"Error saving settings: {e}")
