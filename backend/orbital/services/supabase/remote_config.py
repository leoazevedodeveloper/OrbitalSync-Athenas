"""
Carrega configurações do Supabase (PostgREST) na inicialização do backend.

Requer no .env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY  (recomendado no servidor; nunca exponha no front)

Opcional:
  SUPABASE_CONFIG_ENABLED=true|false  (default: true se URL + key existirem)
  ATHENA_SETTINGS_MODULE_KEY=athena   (linha em athena_settings)
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Tuple

import httpx

# Cache preenchido em try_apply_supabase_config()
_WEBHOOKS_CFG: Optional[Dict[str, Any]] = None
_LAUNCH_APPS_CFG: Optional[Dict[str, Any]] = None
_LAST_ERROR: Optional[str] = None


def empty_webhooks_config() -> Dict[str, Any]:
    return {
        "version": 1,
        "default_method": "POST",
        "default_timeout_sec": 30.0,
        "default_headers": {},
        "hooks": [],
    }


def _base_url() -> str:
    return (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")


def _request_headers_json() -> Dict[str, str]:
    h = _rest_headers()
    h["Content-Type"] = "application/json"
    return h


def supabase_config_enabled() -> bool:
    explicit = os.getenv("SUPABASE_CONFIG_ENABLED", "").strip().lower()
    if explicit in ("0", "false", "no", "off"):
        return False
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = _supabase_key()
    if not url or not key:
        return False
    if explicit in ("1", "true", "yes", "on"):
        return True
    # Sem variável explícita: habilita se credenciais existirem
    return True


def _supabase_key() -> str:
    return (
        (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
        or (os.getenv("SUPABASE_ANON_KEY") or "").strip()
    )


def _rest_headers() -> Dict[str, str]:
    key = _supabase_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }


def _get_json(client: httpx.Client, path: str) -> Any:
    base = _base_url()
    r = client.get(f"{base}{path}", headers=_rest_headers(), timeout=20.0)
    r.raise_for_status()
    return r.json()


def _post_json(
    client: httpx.Client, path: str, body: Any, prefer: Optional[str] = None
) -> httpx.Response:
    base = _base_url()
    h = _request_headers_json()
    if prefer:
        h["Prefer"] = prefer
    r = client.post(f"{base}{path}", headers=h, json=body, timeout=30.0)
    return r


_URL_KEYS_FLAT = (
    "url",
    "webhook_url",
    "endpoint",
    "webhook_endpoint",
    "uri",
    "link",
    "target_url",
    "webhookUrl",
    "webhookURL",
    "hookUrl",
    "targetUrl",
)


def _first_url_in_mapping(m: dict) -> str:
    if not isinstance(m, dict):
        return ""
    for key in _URL_KEYS_FLAT:
        v = m.get(key)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def _hook_url_from_supabase_row(row: dict) -> str:
    """
    Coluna em PostgREST nem sempre chama-se `url` (ex.: webhook_url, endpoint, camelCase).
    Às vezes a URL vem só dentro de `body` / `metadata` (JSON).
    """
    if not isinstance(row, dict):
        return ""

    u = _first_url_in_mapping(row)
    if u:
        return u

    for nest_key in ("body", "metadata", "config", "payload", "data"):
        nested = row.get(nest_key)
        if isinstance(nested, dict):
            u = _first_url_in_mapping(nested)
            if u:
                return u
        if isinstance(nested, str):
            s = nested.strip()
            if s.startswith("http://") or s.startswith("https://"):
                return s.split()[0].strip().rstrip(",").strip('"').strip("'")
            try:
                parsed = json.loads(s)
                if isinstance(parsed, dict):
                    u = _first_url_in_mapping(parsed)
                    if u:
                        return u
            except json.JSONDecodeError:
                pass

    skip_scan = frozenset(
        {
            "id",
            "description",
            "method",
            "headers",
            "timeout_sec",
            "body",
            "metadata",
            "config",
            "payload",
            "data",
            "created_at",
            "updated_at",
        }
    )
    for k, v in row.items():
        if k in skip_scan or v is None or isinstance(v, (dict, list, bool)):
            continue
        s = str(v).strip()
        if len(s) < 10:
            continue
        if s.startswith("http://") or s.startswith("https://"):
            return s.split()[0].strip().strip('"').strip("'")

    return ""


def _coerce_body(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return {}
        try:
            parsed = json.loads(s)
            return parsed if isinstance(parsed, (dict, list)) else {}
        except json.JSONDecodeError:
            return {}
    return val


def _fetch_webhooks_bundle(client: httpx.Client) -> Dict[str, Any]:
    defaults_rows = _get_json(
        client,
        "/rest/v1/athena_webhook_defaults?singleton_key=eq.default&select=version,default_method,default_timeout_sec,default_headers",
    )
    # select=* para incluir colunas alternativas (webhook_url, endpoint, …) sem erro 400
    hooks_rows = _get_json(
        client,
        "/rest/v1/athena_webhooks?select=*&order=id.asc",
    )
    if not isinstance(defaults_rows, list):
        defaults_rows = []
    if not isinstance(hooks_rows, list):
        hooks_rows = []

    d0: Dict[str, Any] = defaults_rows[0] if defaults_rows else {}
    cfg: Dict[str, Any] = {
        "version": int(d0.get("version") or 1),
        "default_method": str(d0.get("default_method") or "POST"),
        "default_timeout_sec": float(d0.get("default_timeout_sec") or 30),
        "default_headers": d0.get("default_headers")
        if isinstance(d0.get("default_headers"), dict)
        else {},
        "hooks": [],
    }

    for row in hooks_rows:
        if not isinstance(row, dict):
            continue
        hid = str(row.get("id") or "").strip()
        if not hid:
            continue
        resolved_url = _hook_url_from_supabase_row(row)
        hook: Dict[str, Any] = {
            "id": hid,
            "description": str(row.get("description") or ""),
            "url": resolved_url,
        }
        if row.get("method") is not None:
            hook["method"] = row.get("method")
        if isinstance(row.get("headers"), dict):
            hook["headers"] = row.get("headers")
        if row.get("timeout_sec") is not None:
            hook["timeout_sec"] = row.get("timeout_sec")
        body = _coerce_body(row.get("body"))
        if body is not None:
            hook["body"] = body
        cfg["hooks"].append(hook)

    return cfg


def _fetch_launch_apps_bundle(client: httpx.Client) -> Dict[str, Any]:
    rows = _get_json(
        client,
        "/rest/v1/athena_launch_apps?select=app_id,label,description,path,args,working_dir&order=app_id.asc",
    )
    if not isinstance(rows, list):
        rows = []
    apps: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        aid = str(row.get("app_id") or "").strip()
        if not aid:
            continue
        args = row.get("args")
        if not isinstance(args, list):
            args = []
        apps.append(
            {
                "id": aid,
                "label": str(row.get("label") or aid),
                "description": str(row.get("description") or ""),
                "path": str(row.get("path") or "").strip(),
                "args": args,
                "working_dir": row.get("working_dir"),
            }
        )
    return {"apps": apps}


def _fetch_athena_values(client: httpx.Client, module_key: str) -> Dict[str, Any]:
    path = f"/rest/v1/athena_settings?module_key=eq.{module_key}&select=values"
    rows = _get_json(client, path)
    if not isinstance(rows, list) or not rows:
        return {}
    v = rows[0].get("values") if isinstance(rows[0], dict) else None
    if isinstance(v, dict):
        return v
    if isinstance(v, str):
        try:
            parsed = json.loads(v)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _fetch_tool_permissions(client: httpx.Client) -> Dict[str, bool]:
    rows = _get_json(
        client,
        "/rest/v1/athena_tool_permissions?select=permission_key,enabled&order=permission_key.asc",
    )
    if not isinstance(rows, list):
        return {}
    out: Dict[str, bool] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        k = str(row.get("permission_key") or "").strip()
        if not k:
            continue
        out[k] = bool(row.get("enabled"))
    return out


def try_apply_supabase_config(settings: Dict[str, Any]) -> bool:
    """
    Busca Supabase e aplica em `settings` (mutável) + caches de webhooks/launch_apps.
    Retorna True se carregou do remoto com sucesso.
    """
    global _WEBHOOKS_CFG, _LAUNCH_APPS_CFG, _LAST_ERROR
    _WEBHOOKS_CFG = None
    _LAUNCH_APPS_CFG = None
    _LAST_ERROR = None

    if not supabase_config_enabled():
        return False

    module_key = settings_module_key()

    try:
        with httpx.Client() as client:
            athena_vals = _fetch_athena_values(client, module_key)
            perms = _fetch_tool_permissions(client)
            webhooks_cfg = _fetch_webhooks_bundle(client)
            launch_cfg = _fetch_launch_apps_bundle(client)

        # Flags do módulo athena (ex.: face_auth, camera) vêm do JSON `values`
        if "face_auth_enabled" in athena_vals:
            settings["face_auth_enabled"] = bool(athena_vals["face_auth_enabled"])
        if "camera_flipped" in athena_vals:
            settings["camera_flipped"] = bool(athena_vals["camera_flipped"])
        # tool_permissions dentro do JSON (se existir) soma à tabela relacional
        tp_json = athena_vals.get("tool_permissions")
        if isinstance(tp_json, dict):
            settings.setdefault("tool_permissions", {}).update(
                {k: bool(v) for k, v in tp_json.items()}
            )

        if perms:
            tp = settings.setdefault("tool_permissions", {})
            tp.update(perms)

        settings.setdefault("tool_permissions", {})

        _WEBHOOKS_CFG = webhooks_cfg
        _LAUNCH_APPS_CFG = launch_cfg
        print(f"[SUPABASE] Config carregada (module_key={module_key!r}, hooks={len(webhooks_cfg.get('hooks', []))}, apps={len(launch_cfg.get('apps', []))})")
        return True
    except Exception as e:
        _LAST_ERROR = str(e)
        _WEBHOOKS_CFG = empty_webhooks_config()
        _LAUNCH_APPS_CFG = {"apps": []}
        print(f"[SUPABASE] Falha ao carregar config (modo só-banco: hooks/apps vazios até corrigir): {e!r}")
        return False


def settings_module_key() -> str:
    return (os.getenv("ATHENA_SETTINGS_MODULE_KEY") or "athena").strip() or "athena"


def get_cached_webhooks_config() -> Optional[Dict[str, Any]]:
    return _WEBHOOKS_CFG


def get_cached_launch_apps_config() -> Optional[Dict[str, Any]]:
    return _LAUNCH_APPS_CFG


def append_launch_app_to_remote_cache(entry: Dict[str, Any]) -> None:
    """Mantém o cache em memória alinhado após INSERT no Supabase."""
    global _LAUNCH_APPS_CFG
    if _LAUNCH_APPS_CFG is None:
        _LAUNCH_APPS_CFG = {"apps": []}
    _LAUNCH_APPS_CFG.setdefault("apps", []).append(entry)


def persist_settings_to_supabase(settings: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Grava face_auth, camera e memória semântica em athena_settings.values e tool_permissions na tabela relacional.
    """
    if not supabase_config_enabled():
        return False, "Supabase desabilitado (sem URL/chave)."

    module_key = settings_module_key()
    try:
        with httpx.Client() as client:
            current = dict(_fetch_athena_values(client, module_key))
            current.pop("tool_permissions", None)
            current["face_auth_enabled"] = bool(settings.get("face_auth_enabled", False))
            current["camera_flipped"] = bool(settings.get("camera_flipped", False))

            row = {"module_key": module_key, "values": current}
            r = _post_json(
                client,
                "/rest/v1/athena_settings?on_conflict=module_key",
                [row],
                prefer="resolution=merge-duplicates,return=minimal",
            )
            if r.status_code not in (200, 201, 204):
                return False, f"athena_settings: HTTP {r.status_code} {r.text[:500]}"

            tp = settings.get("tool_permissions") or {}
            if not isinstance(tp, dict):
                tp = {}
            batch = [
                {"permission_key": str(k), "enabled": bool(v)}
                for k, v in sorted(tp.items())
            ]
            if batch:
                r2 = _post_json(
                    client,
                    "/rest/v1/athena_tool_permissions?on_conflict=permission_key",
                    batch,
                    prefer="resolution=merge-duplicates,return=minimal",
                )
                if r2.status_code not in (200, 201, 204):
                    return (
                        False,
                        f"athena_tool_permissions: HTTP {r2.status_code} {r2.text[:500]}",
                    )

        return True, ""
    except Exception as e:
        return False, str(e)


def insert_launch_app_supabase(
    app_id: str,
    label: str,
    description: str,
    path: str,
    args: Optional[List[Any]] = None,
    working_dir: Any = None,
) -> Tuple[bool, str]:
    if not supabase_config_enabled():
        return False, "Supabase desabilitado."

    row = {
        "app_id": app_id,
        "label": label,
        "description": description,
        "path": path,
        "args": args if isinstance(args, list) else [],
        "working_dir": working_dir,
    }
    try:
        with httpx.Client() as client:
            r = _post_json(
                client,
                "/rest/v1/athena_launch_apps",
                [row],
                prefer="return=representation",
            )
            if r.status_code not in (200, 201):
                return False, f"HTTP {r.status_code}: {r.text[:500]}"
        append_launch_app_to_remote_cache(
            {
                "id": app_id,
                "label": label,
                "description": description,
                "path": path,
                "args": row["args"],
                "working_dir": working_dir,
            }
        )
        return True, ""
    except Exception as e:
        return False, str(e)


def last_supabase_config_error() -> Optional[str]:
    return _LAST_ERROR
