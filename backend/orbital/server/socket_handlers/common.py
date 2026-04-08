"""Estado e helpers síncronos compartilhados pelos eventos Socket.IO."""
from __future__ import annotations

from collections import deque
from datetime import datetime

from orbital.services.config.local_credentials import CREDENTIALS_PATH, build_credentials_public_meta
from orbital.services.integrations.integration_hub import build_integrations_snapshot
from orbital.services.integrations.launch_apps import launch_apps_config_path, list_launch_apps_catalog
from orbital.services.integrations.webhook_config import list_hook_summaries, load_webhooks_config

MAX_CHAT_IMAGE_B64_LEN = 14_000_000
RUNTIME_LOGS: deque = deque(maxlen=400)
# Só clientes nesta sala recebem `runtime_log` em tempo real (evita tráfego/parse com config fechadas).
RUNTIME_LOGS_ROOM = "runtime_logs_watchers"


def log_entry(level: str, message: str, source: str = "server") -> dict:
    ts = datetime.now().strftime("%H:%M:%S")
    entry = {
        "ts": ts,
        "level": str(level or "info").strip().lower(),
        "source": str(source or "server").strip() or "server",
        "message": str(message or "").strip(),
    }
    RUNTIME_LOGS.append(entry)
    return entry


def normalize_chat_image_payload(data: dict):
    """Retorna ((b64, mime), None) se OK; (None, None) sem imagem; (None, 'too_large') se exceder tamanho."""
    raw = data.get("image_b64") or data.get("image")
    if raw is None:
        return None, None
    if not isinstance(raw, str):
        return None, None
    s = raw.strip()
    mime = str(data.get("mime_type") or "image/jpeg").split(";")[0].strip().lower()
    if s.startswith("data:"):
        head, _, rest = s.partition(",")
        s = rest.strip()
        h = head.lower()
        if "image/png" in h:
            mime = "image/png"
        elif "image/webp" in h:
            mime = "image/webp"
        elif "image/gif" in h:
            mime = "image/gif"
        else:
            mime = "image/jpeg"
    if len(s) > MAX_CHAT_IMAGE_B64_LEN:
        return None, "too_large"
    return (s, mime), None


def append_settings_runtime_fields(payload: dict) -> None:
    try:
        payload["automation_hooks"] = list_hook_summaries(load_webhooks_config())
    except Exception as e:
        print(f"[SERVER] automation_hooks: {e}")
        payload["automation_hooks"] = []
    try:
        payload["launch_app_catalog"] = list_launch_apps_catalog()
    except Exception as e:
        print(f"[SERVER] launch_app_catalog: {e}")
        payload["launch_app_catalog"] = []
    payload["launch_apps_config_path"] = str(launch_apps_config_path())
    try:
        payload["integrations"] = build_integrations_snapshot()
    except Exception as e:
        print(f"[SERVER] integrations snapshot: {e}")
        payload["integrations"] = None
    try:
        payload["credentials_meta"] = build_credentials_public_meta()
    except Exception as e:
        print(f"[SERVER] credentials_meta: {e}")
        payload["credentials_meta"] = {
            "credentials_file": str(CREDENTIALS_PATH),
            "credentials_file_exists": False,
            "supabase_url": "",
            "supabase_configured": False,
            "supabase_host": "",
            "supabase_config_enabled": True,
            "athena_settings_module_key": "athena",
            "supabase_anon_key_length": 0,
            "supabase_service_role_key_length": 0,
            "gemini_configured": False,
            "comfyui_base_url": "http://127.0.0.1:2000",
            "comfyui_workflow_file": "",
            "secrets_visible_in_ui": False,
            "supabase_secret_length": 0,
            "gemini_api_key_length": 0,
        }
