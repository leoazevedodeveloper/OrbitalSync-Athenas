"""Estado de settings — preenchido só a partir do Supabase (`try_apply_supabase_config` no bootstrap)."""
from typing import Any, Dict

from orbital.paths import REPO_ROOT

PROJECT_ROOT = REPO_ROOT

# Estrutura mínima em memória; valores vêm das tabelas `athena_settings`, `athena_tool_permissions`, etc.
SETTINGS: Dict[str, Any] = {"tool_permissions": {}}

# Memória semântica (embeddings / busca no histórico) — também em `athena_settings.values`.
SEMANTIC_MEMORY_DEFAULTS: Dict[str, Any] = {
    "semantic_search_enabled": True,
    "semantic_embed_index": True,
    "semantic_embed_senders": "User, ATHENAS",
    "semantic_embed_min_length": 24,
    "semantic_embed_max_chars": 8000,
    "chat_startup_context_limit": 100,
}


def apply_semantic_memory_defaults(settings: Dict[str, Any]) -> None:
    for k, v in SEMANTIC_MEMORY_DEFAULTS.items():
        settings.setdefault(k, v)


def load_settings() -> None:
    """Recarrega do banco (Supabase). Sem credenciais, mantém apenas a estrutura vazia."""
    SETTINGS.clear()
    SETTINGS["tool_permissions"] = {}
    try:
        from orbital.services.supabase_remote_config import (
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
        from orbital.services.supabase_remote_config import (
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
