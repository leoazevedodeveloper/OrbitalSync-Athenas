"""
Apps locais permitidos para abrir pelo assistente (lista branca).
Config: Supabase `athena_launch_apps` (com credenciais) ou config/launch_apps.json (modo local).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from orbital.paths import REPO_ROOT

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$", re.I)


def project_root() -> Path:
    return REPO_ROOT


def launch_apps_config_path() -> Path:
    return project_root() / "config" / "launch_apps.json"


def load_launch_apps_config() -> Dict[str, Any]:
    try:
        from .supabase_remote_config import (
            get_cached_launch_apps_config,
            supabase_config_enabled,
        )

        if supabase_config_enabled():
            remote = get_cached_launch_apps_config()
            if remote is not None:
                return remote
            return {"apps": []}
        remote = get_cached_launch_apps_config()
        if remote is not None:
            return remote
    except Exception:
        pass

    path = launch_apps_config_path()
    if not path.is_file():
        return {"apps": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        return {"apps": [], "_error": str(e)}
    if not isinstance(data, dict):
        return {"apps": []}
    apps = data.get("apps")
    if not isinstance(apps, list):
        data["apps"] = []
    return data


def save_launch_apps_config(cfg: Dict[str, Any]) -> Tuple[bool, str]:
    """Persiste JSON sem chaves internas (_error, etc.). No modo Supabase não grava arquivo."""
    try:
        from .supabase_remote_config import supabase_config_enabled

        if supabase_config_enabled():
            return True, ""
    except Exception:
        pass

    path = launch_apps_config_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        return False, str(e)
    out = {k: v for k, v in cfg.items() if not str(k).startswith("_")}
    apps = out.get("apps")
    if not isinstance(apps, list):
        out["apps"] = []
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=4, ensure_ascii=False)
    except OSError as e:
        return False, str(e)
    return True, ""


def _slug_base_from_stem(stem: str) -> str:
    s = re.sub(r"[^a-z0-9_-]+", "-", (stem or "app").lower()).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    if not s:
        s = "app"
    if not _ID_RE.match(s):
        s = "app"
    return s[:64]


def _existing_ids(cfg: Dict[str, Any]) -> set:
    ids: set = set()
    for a in cfg.get("apps", []):
        if isinstance(a, dict):
            aid = str(a.get("id", "")).strip().lower()
            if aid:
                ids.add(aid)
    return ids


def _unique_id(cfg: Dict[str, Any], base: str) -> str:
    ids = _existing_ids(cfg)
    b = (base or "app")[:64].strip("-") or "app"
    if not _ID_RE.match(b):
        b = "app"
    cand = b
    i = 2
    while cand.lower() in ids:
        suffix = f"_{i}"
        cand = (b[: max(1, 64 - len(suffix))] + suffix)[:64]
        if not _ID_RE.match(cand):
            cand = f"app{i}"[:64]
        i += 1
        if i > 10000:
            cand = f"app{i}"[:64]
            break
    return cand


def add_launch_app_entry(
    exe_path: str,
    app_id: Optional[str] = None,
    label: Optional[str] = None,
    description: str = "",
) -> Tuple[bool, str]:
    """
    Adiciona entrada à whitelist. path deve existir.
    Se app_id vazio, gera a partir do nome do arquivo (único).
    """
    raw_path = (exe_path or "").strip().strip('"')
    if not raw_path:
        return False, "Caminho do executável é obrigatório."
    path = os.path.normpath(os.path.expandvars(raw_path))
    if not os.path.isfile(path):
        return False, f"Arquivo não encontrado: {path}"

    if sys.platform == "win32":
        low = path.lower()
        if not (low.endswith(".exe") or low.endswith(".bat") or low.endswith(".cmd")):
            return False, "No Windows, escolha um .exe, .bat ou .cmd."

    cfg = load_launch_apps_config()
    if cfg.get("_error"):
        return False, f"Erro ao ler launch_apps.json: {cfg['_error']}"

    for a in cfg.get("apps", []):
        if not isinstance(a, dict):
            continue
        other = str(a.get("path", "")).strip().strip('"')
        if other and os.path.normpath(os.path.expandvars(other)) == path:
            return False, "Este executável já está na lista."

    stem = Path(path).stem
    if app_id and str(app_id).strip():
        aid = str(app_id).strip().lower()
        if not _ID_RE.match(aid):
            return (
                False,
                "id inválido: use letras, números, _ e - (começando com letra ou número).",
            )
        if _find_app(cfg, aid):
            return False, f"Já existe um app com id '{aid}'."
    else:
        base = _slug_base_from_stem(stem)
        aid = _unique_id(cfg, base)

    lab = (label or stem).strip() or aid
    desc = (description or "").strip()

    entry: Dict[str, Any] = {
        "id": aid,
        "label": lab,
        "description": desc,
        "path": path,
        "args": [],
        "working_dir": None,
    }

    try:
        from .supabase_remote_config import insert_launch_app_supabase, supabase_config_enabled
    except ImportError:
        supabase_config_enabled = lambda: False  # noqa: E731
        insert_launch_app_supabase = None

    if supabase_config_enabled() and insert_launch_app_supabase is not None:
        ok_ins, err_ins = insert_launch_app_supabase(
            app_id=aid,
            label=lab,
            description=desc,
            path=path,
            args=[],
            working_dir=None,
        )
        if not ok_ins:
            return False, f"Falha ao salvar no Supabase: {err_ins}"
        return True, f"Adicionado: {lab} (`{aid}`)."

    apps = cfg.setdefault("apps", [])
    apps.append(entry)
    ok, err = save_launch_apps_config(cfg)
    if not ok:
        return False, f"Falha ao salvar launch_apps.json: {err}"
    return True, f"Adicionado: {lab} (`{aid}`)."


def list_launch_apps_catalog() -> List[Dict[str, str]]:
    """Ids e rótulos para o modelo / UI (sem expor paths completos)."""
    cfg = load_launch_apps_config()
    out: List[Dict[str, str]] = []
    for a in cfg.get("apps", []):
        if not isinstance(a, dict):
            continue
        aid = str(a.get("id", "")).strip()
        if not aid:
            continue
        out.append(
            {
                "id": aid,
                "label": str(a.get("label", aid)),
                "description": str(a.get("description", "")),
            }
        )
    return out


def _find_app(cfg: Dict[str, Any], app_id: str) -> Optional[Dict[str, Any]]:
    needle = app_id.strip().lower()
    for a in cfg.get("apps", []):
        if not isinstance(a, dict):
            continue
        if str(a.get("id", "")).strip().lower() == needle:
            return a
    return None


def launch_app_by_id(app_id: str) -> Tuple[bool, str]:
    """
    Inicia processo apenas se `app_id` existir na lista branca e o arquivo existir.
    """
    raw = (app_id or "").strip()
    if not raw:
        return False, "app_id é obrigatório."
    if not _ID_RE.match(raw):
        return False, f"app_id inválido: use apenas letras, números, _ e - (ex.: chrome, notepad)."

    cfg = load_launch_apps_config()
    if cfg.get("_error"):
        return False, f"Erro ao ler launch_apps.json: {cfg['_error']}"

    entry = _find_app(cfg, raw)
    if not entry:
        return (
            False,
            f"app_id '{raw}' não cadastrado (Supabase athena_launch_apps ou lista local). "
            f"Use a tool list_launch_apps.",
        )

    path = str(entry.get("path", "")).strip().strip('"')
    if not path:
        return False, "Entrada sem 'path' no JSON."

    path = os.path.normpath(os.path.expandvars(path))
    if not os.path.isfile(path):
        return False, f"Executável não encontrado: {path}"

    extra = entry.get("args") or []
    if not isinstance(extra, list):
        return False, "Campo 'args' deve ser uma lista no JSON."
    cmd: List[str] = [path] + [str(x) for x in extra]

    work = entry.get("working_dir")
    cwd: Optional[str]
    if work and str(work).strip():
        cwd = os.path.normpath(os.path.expandvars(str(work).strip()))
        if not os.path.isdir(cwd):
            return False, f"working_dir inválido: {cwd}"
    else:
        cwd = os.path.dirname(path) or None

    try:
        kwargs: Dict[str, Any] = {
            "cwd": cwd,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
            "stdin": subprocess.DEVNULL,
            "shell": False,
        }
        if sys.platform != "win32":
            kwargs["start_new_session"] = True

        subprocess.Popen(cmd, **kwargs)  # noqa: S603 — cmd montado só da lista branca
    except OSError as e:
        return False, f"Falha ao iniciar: {e!r}"

    label = entry.get("label") or raw
    return True, f"Aplicativo '{label}' ({raw}) iniciado."
