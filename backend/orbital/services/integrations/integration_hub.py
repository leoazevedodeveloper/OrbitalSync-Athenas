"""Snapshot de integrações para o frontend (somente leitura; sem segredos)."""
from __future__ import annotations

import os
from urllib.parse import urlparse

from orbital.services.supabase.remote_config import settings_module_key, supabase_config_enabled

from .webhook_config import list_hook_summaries, load_webhooks_config


def _supabase_host() -> str:
    raw = (os.getenv("SUPABASE_URL") or "").strip()
    if not raw:
        return ""
    try:
        p = urlparse(raw)
        if p.netloc:
            return p.netloc
    except Exception:
        pass
    return raw[:64] + ("…" if len(raw) > 64 else "")


def build_integrations_snapshot() -> dict:
    """Dados seguros para o hub de integrações no app."""
    supabase_on = supabase_config_enabled()

    hooks: list = []
    try:
        hooks = list_hook_summaries(load_webhooks_config())
    except Exception:
        hooks = []

    webhooks_source = "supabase" if supabase_config_enabled() else "local_file"

    return {
        "supabase": {
            "configured": supabase_on,
            "host": _supabase_host() if supabase_on else "",
            "module_key": settings_module_key(),
        },
        "n8n": {
            "label": "Webhooks / n8n",
            "hooks_count": len(hooks),
            "hooks_preview": hooks[:12],
            "webhooks_source": webhooks_source,
        },
    }
