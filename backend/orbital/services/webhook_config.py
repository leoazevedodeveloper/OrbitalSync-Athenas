"""
Carrega config/webhooks.json e dispara webhooks (ex.: n8n) com substituição ${ENV_VAR}.
"""
from __future__ import annotations

import copy
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from orbital.paths import REPO_ROOT

_ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)\}")


def _substitute_env(obj: Any) -> Any:
    if isinstance(obj, str):

        def repl(m: re.Match) -> str:
            return os.getenv(m.group(1), "")

        return _ENV_PATTERN.sub(repl, obj)
    if isinstance(obj, dict):
        return {k: _substitute_env(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_substitute_env(x) for x in obj]
    return obj


def project_root() -> Path:
    return REPO_ROOT


def webhooks_config_path() -> Path:
    return project_root() / "config" / "webhooks.json"


def load_webhooks_config() -> Dict[str, Any]:
    try:
        from .supabase_remote_config import (
            empty_webhooks_config,
            get_cached_webhooks_config,
            supabase_config_enabled,
        )

        if supabase_config_enabled():
            remote = get_cached_webhooks_config()
            return remote if remote is not None else empty_webhooks_config()
        remote = get_cached_webhooks_config()
        if remote is not None:
            return remote
    except Exception:
        pass

    path = webhooks_config_path()
    if not path.is_file():
        return {"version": 1, "hooks": []}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return {"version": 1, "hooks": []}
    if "hooks" not in data or not isinstance(data["hooks"], list):
        data["hooks"] = []
    return data


def get_hook_by_id(cfg: Dict[str, Any], hook_id: str) -> Optional[Dict[str, Any]]:
    for h in cfg.get("hooks", []):
        if isinstance(h, dict) and h.get("id") == hook_id:
            return h
    return None


def _resolved_hook_url(hook: Dict[str, Any]) -> str:
    """URL final com ${ENV}; aceita aliases comuns (Supabase / JSON local)."""
    if not isinstance(hook, dict):
        return ""
    raw = (
        str(hook.get("url", "")).strip()
        or str(hook.get("webhook_url", "")).strip()
        or str(hook.get("endpoint", "")).strip()
        or str(hook.get("webhook_endpoint", "")).strip()
    )
    if not raw:
        return ""
    return str(_substitute_env(raw)).strip()


def list_hook_summaries(cfg: Dict[str, Any]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for h in cfg.get("hooks", []):
        if not isinstance(h, dict):
            continue
        hid = h.get("id", "")
        if not hid:
            continue
        url = _resolved_hook_url(h)
        out.append(
            {
                "id": str(hid),
                "description": str(h.get("description", "")),
                "url": url,
            }
        )
    return out


def _global_defaults(cfg: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in cfg.items() if k != "hooks"}


_TOP_LEVEL_TOOL_FIELDS = frozenset(
    {
        "action",
        "volume_percent",
        "volume",
        "playlist_uri",
        "context_uri",
        "uri",
        "device_id",
        "spotify_action",
        "skip",
        "next_track",
        "previous_track",
    }
)


def coerce_tool_args(obj: Any) -> Dict[str, Any]:
    """Converte fc.args do Gemini / objetos mapeáveis em dict Python."""
    return _coerce_dict(obj)


def _coerce_dict(obj: Any) -> Dict[str, Any]:
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return {str(k): v for k, v in obj.items()}
    if hasattr(obj, "__getitem__") and hasattr(obj, "keys"):
        try:
            return {str(k): obj[k] for k in obj.keys()}
        except Exception:
            pass
    try:
        return dict(obj)
    except Exception:
        return {}


def normalize_trigger_webhook_payload(
    raw_payload: Any,
    tool_args: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Unifica o que vem da tool Gemini / front:
    - payload como dict ou string JSON
    - campos soltos no mesmo objeto da tool (ex.: action no nível superior com payload vazio)
    """
    pl: Dict[str, Any] = {}

    if isinstance(raw_payload, str):
        s = raw_payload.strip()
        if s:
            try:
                parsed = json.loads(s)
                if isinstance(parsed, dict):
                    pl.update(parsed)
            except json.JSONDecodeError:
                pass
    elif raw_payload is not None:
        pl.update(_coerce_dict(raw_payload))

    ta = _coerce_dict(tool_args) if tool_args else {}
    for key in _TOP_LEVEL_TOOL_FIELDS:
        if key not in ta or ta[key] is None:
            continue
        dest = "action" if key == "spotify_action" else key
        pl[dest] = ta[key]

    # Não enviar hook_id no JSON do webhook
    if "hook_id" in pl:
        del pl["hook_id"]

    return pl if pl else None


def _merge_hook_body_with_payload(
    hook_body: Any, payload_extra: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Mescla body do hook com payload da tool.

    Quando a IA manda só partes (ex.: volume_percent) e o hook tem default
    action:'pause', sem isso o n8n receberia pause+volume e ignoraria volume.
    Se payload não trouxer 'action', inferimos a partir dos campos presentes.
    """
    base: Dict[str, Any]
    if isinstance(hook_body, dict):
        base = copy.deepcopy(hook_body)
    else:
        base = {}

    pl = copy.deepcopy(payload_extra) if isinstance(payload_extra, dict) else {}

    merged: Dict[str, Any] = {**base, **pl}

    action_in_payload = "action" in pl and pl.get("action") is not None and str(pl.get("action")).strip() != ""

    if not action_in_payload:
        uri = pl.get("playlist_uri") or pl.get("context_uri") or pl.get("uri")
        if uri and str(uri).startswith("spotify:playlist"):
            merged["action"] = "playlist"
        elif "volume_percent" in pl or "volume" in pl:
            merged["action"] = "volume"
        elif pl.get("skip") is True or pl.get("next_track") is True:
            merged["action"] = "next"
        elif pl.get("previous_track") is True:
            merged["action"] = "previous"

    act = merged.get("action")
    if isinstance(act, str):
        a = act.lower().strip()
        # Sinônimos → play/resume: o n8n (map_action) roteia "resume" para o nó certo
        _RESUME_ALIASES = frozenset(
            {
                "resume",
                "play",
                "start",
                "unpause",
                "continue",
                "continuar",
                "continua",
                "retomar",
                "despausar",
                "tocar",
            }
        )
        if a in _RESUME_ALIASES:
            merged["action"] = "play"
        else:
            merged["action"] = a

    return merged


async def fire_webhook_by_id(
    cfg: Dict[str, Any],
    hook_id: str,
    payload_extra: Optional[Dict[str, Any]] = None,
) -> Tuple[int, str]:
    hook = get_hook_by_id(cfg, hook_id)
    if not hook:
        return 0, f"Unknown hook_id: {hook_id}"

    g = _global_defaults(cfg)
    method = (hook.get("method") or g.get("default_method") or "POST").upper()
    url = _resolved_hook_url(hook)
    if not url:
        return 0, "Hook has no url"

    headers: Dict[str, str] = copy.deepcopy(g.get("default_headers") or {})
    hook_headers = hook.get("headers")
    if isinstance(hook_headers, dict):
        headers.update(copy.deepcopy(hook_headers))
    headers = {k: str(v) for k, v in _substitute_env(headers).items() if str(v) != ""}

    raw_body = hook.get("body")
    body: Any = _merge_hook_body_with_payload(
        {} if raw_body is None else raw_body,
        payload_extra,
    )
    body = _substitute_env(body)
    print(f"[WEBHOOK] hook_id={hook_id!r} POST body={body!r}")

    timeout = float(hook.get("timeout_sec") or g.get("default_timeout_sec") or 30)

    async with httpx.AsyncClient(timeout=timeout) as client:
        if method in ("GET", "HEAD"):
            r = await client.request(method, url, headers=headers)
        else:
            r = await client.request(
                method,
                url,
                headers=headers,
                json=body if isinstance(body, (dict, list)) else body,
            )

    snippet = (r.text or "")[:2000]
    return r.status_code, snippet
