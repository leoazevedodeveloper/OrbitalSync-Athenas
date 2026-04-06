"""
Credenciais locais (ficheiro em disco) — sobrepõem o `.env` após `load_dotenv(override=True)`.

Ficheiro: `data/local_credentials.json` na raiz do repositório (gitignored).
Metadados seguros via `build_credentials_public_meta()`; chaves só se `ORBITAL_EXPOSE_SECRETS_IN_SETTINGS_UI=1`.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Tuple
from urllib.parse import urlparse

from orbital.paths import REPO_ROOT

CREDENTIALS_PATH = REPO_ROOT / "data" / "local_credentials.json"

# chave no JSON → variável de ambiente
ENV_MAP: Dict[str, str] = {
    "supabase_url": "SUPABASE_URL",
    "supabase_service_role_key": "SUPABASE_SERVICE_ROLE_KEY",
    "gemini_api_key": "GEMINI_API_KEY",
    "comfyui_base_url": "COMFYUI_BASE_URL",
    "comfyui_workflow_file": "COMFYUI_WORKFLOW_FILE",
    "pierre_api_key": "PIERRE_API_KEY",
}


def _load_raw_file() -> Dict[str, Any]:
    if not CREDENTIALS_PATH.is_file():
        return {}
    try:
        with open(CREDENTIALS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _write_raw_file(data: Dict[str, Any]) -> Tuple[bool, str]:
    try:
        CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
        # Não gravar chaves vazias
        clean = {k: v for k, v in data.items() if v is not None and str(v).strip()}
        with open(CREDENTIALS_PATH, "w", encoding="utf-8") as f:
            json.dump(clean, f, indent=2, ensure_ascii=False)
        try:
            os.chmod(CREDENTIALS_PATH, 0o600)
        except OSError:
            pass
        return True, ""
    except OSError as e:
        return False, str(e)


def reload_env_from_dotenv_and_file() -> None:
    """Reaplica `.env` e depois sobrepõe com `data/local_credentials.json`."""
    from dotenv import load_dotenv

    load_dotenv(REPO_ROOT / ".env", override=True)
    data = _load_raw_file()
    for file_key, env_key in ENV_MAP.items():
        if file_key not in data:
            continue
        val = str(data[file_key]).strip()
        if val:
            os.environ[env_key] = val


def load_and_apply_local_credentials() -> None:
    """Alias usado no bootstrap (compat)."""
    reload_env_from_dotenv_and_file()


def merge_save_and_apply(updates: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Faz merge de `updates` no ficheiro, grava e reaplica env.
    Chaves secretas vazias = não alterar o valor já guardado.
    """
    if not isinstance(updates, dict):
        return False, "Payload inválido."

    data = _load_raw_file()

    if "supabase_url" in updates:
        u = str(updates.get("supabase_url") or "").strip()
        if u:
            data["supabase_url"] = u
        else:
            data.pop("supabase_url", None)

    if "supabase_service_role_key" in updates:
        u = str(updates.get("supabase_service_role_key") or "").strip()
        if u:
            data["supabase_service_role_key"] = u

    if "gemini_api_key" in updates:
        u = str(updates.get("gemini_api_key") or "").strip()
        if u:
            data["gemini_api_key"] = u

    if "comfyui_base_url" in updates:
        u = str(updates.get("comfyui_base_url") or "").strip()
        if u:
            data["comfyui_base_url"] = u
        else:
            data.pop("comfyui_base_url", None)

    if "comfyui_workflow_file" in updates:
        u = str(updates.get("comfyui_workflow_file") or "").strip()
        if u:
            data["comfyui_workflow_file"] = u
        else:
            from orbital.services.integrations.comfyui_client import DEFAULT_COMFYUI_WORKFLOW_REL

            data["comfyui_workflow_file"] = DEFAULT_COMFYUI_WORKFLOW_REL

    if "pierre_api_key" in updates:
        u = str(updates.get("pierre_api_key") or "").strip()
        if u:
            data["pierre_api_key"] = u

    ok, err = _write_raw_file(data)
    if not ok:
        return False, f"Falha ao gravar: {err}"

    reload_env_from_dotenv_and_file()
    return True, "Credenciais gravadas e ambiente atualizado."


def build_credentials_public_meta() -> Dict[str, Any]:
    """Metadados seguros para o painel de definições (sem expor chaves)."""
    url = (os.getenv("SUPABASE_URL") or "").strip()
    srk = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    anon = (os.getenv("SUPABASE_ANON_KEY") or "").strip()
    key = srk or anon
    gemini = (os.getenv("GEMINI_API_KEY") or "").strip()
    supabase_secret_length = len(srk) if srk else len(anon)
    comfy = (os.getenv("COMFYUI_BASE_URL") or "http://127.0.0.1:2000").strip()
    from orbital.services.integrations.comfyui_client import comfyui_workflow_path_for_settings_meta

    wf = comfyui_workflow_path_for_settings_meta()
    pierre = (os.getenv("PIERRE_API_KEY") or "").strip()
    host = ""
    if url:
        try:
            host = urlparse(url).netloc or url[:48]
        except Exception:
            host = url[:48]
    file_exists = CREDENTIALS_PATH.is_file()
    expose_raw = (os.getenv("ORBITAL_EXPOSE_SECRETS_IN_SETTINGS_UI") or "").strip().lower()
    expose = expose_raw in ("1", "true", "yes", "on")

    out: Dict[str, Any] = {
        "credentials_file": str(CREDENTIALS_PATH),
        "credentials_file_exists": file_exists,
        "supabase_url": url,
        "supabase_configured": bool(url and key),
        "supabase_host": host,
        "gemini_configured": bool(gemini),
        "pierre_configured": bool(pierre),
        "comfyui_base_url": comfy,
        "comfyui_workflow_file": wf,
        "secrets_visible_in_ui": expose,
        "supabase_secret_length": supabase_secret_length,
        "gemini_api_key_length": len(gemini),
        "pierre_api_key_length": len(pierre),
    }
    if expose:
        out["credentials_secrets"] = {
            "supabase_service_role_key": (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""),
            "gemini_api_key": (os.getenv("GEMINI_API_KEY") or ""),
            "pierre_api_key": (os.getenv("PIERRE_API_KEY") or ""),
        }
    return out
