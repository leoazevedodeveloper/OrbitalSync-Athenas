"""
Cliente HTTP mínimo para ComfyUI (API local).

Requer um workflow exportado em formato API (JSON) — ver integrations/comfyui/README.md.

Variáveis de ambiente:
  COMFYUI_BASE_URL   (padrão: http://127.0.0.1:2000)
  COMFYUI_WORKFLOW_FILE (opcional; senão usa integrations/comfyui/workflow_api.json)
"""

from __future__ import annotations

import base64
import copy
import json
import os
import secrets
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from orbital.paths import REPO_ROOT

DEFAULT_COMFYUI_WORKFLOW_REL = "integrations/comfyui/workflow_api.json"
_LEGACY_COMFYUI_WORKFLOW_REL = "data/comfyui/workflow_api.json"


def resolved_comfyui_workflow_path() -> Path:
    """
    Caminho absoluto do workflow API (COMFYUI_WORKFLOW_FILE ou padrão na raiz do repo).
    Caminhos relativos são relativos a REPO_ROOT, não ao cwd do processo.
    """
    primary = (REPO_ROOT / DEFAULT_COMFYUI_WORKFLOW_REL).resolve()
    raw = (os.getenv("COMFYUI_WORKFLOW_FILE") or "").strip()
    if not raw:
        if primary.is_file():
            return primary
        legacy_wf = (REPO_ROOT / _LEGACY_COMFYUI_WORKFLOW_REL).resolve()
        return legacy_wf if legacy_wf.is_file() else primary

    p = Path(raw)
    out = p.resolve() if p.is_absolute() else (REPO_ROOT / p).resolve()
    if out.is_file():
        return out
    norm = raw.replace("\\", "/").strip()
    if primary.is_file() and norm.rstrip("/") == _LEGACY_COMFYUI_WORKFLOW_REL:
        return primary
    return out


def comfyui_workflow_path_for_settings_meta() -> str:
    """String para o formulário das definições (mantém valor do env se existir)."""
    raw = (os.getenv("COMFYUI_WORKFLOW_FILE") or "").strip()
    if raw:
        return raw
    try:
        return str(resolved_comfyui_workflow_path().relative_to(REPO_ROOT.resolve())).replace("\\", "/")
    except ValueError:
        return str(resolved_comfyui_workflow_path())


PROMPT_PLACEHOLDER = "{{PROMPT}}"
NEGATIVE_PROMPT_PLACEHOLDER = "{{NEGATIVE_PROMPT}}"


def _aspect_to_wh(aspect_ratio: str) -> Tuple[int, int]:
    """Tamanhos comuns (múltiplos de 8) para latent."""
    m = {
        "1:1": (1024, 1024),
        "16:9": (1344, 768),
        "4:3": (1152, 896),
        "3:4": (896, 1152),
        "9:16": (768, 1344),
    }
    return m.get((aspect_ratio or "16:9").strip(), (1344, 768))


def _load_workflow(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("Workflow JSON deve ser um objeto (dict) no formato API do ComfyUI.")
    return data


def _clip_encode_nodes_sorted(w: Dict[str, Any]) -> list:
    """CLIPTextEncode com inputs.text, ordenados por id de nó numérico."""
    out: list = []
    for nid, node in w.items():
        if not isinstance(node, dict):
            continue
        if node.get("class_type") != "CLIPTextEncode":
            continue
        inp = node.get("inputs")
        if not isinstance(inp, dict) or "text" not in inp:
            continue
        try:
            sort_key = int(str(nid))
        except ValueError:
            sort_key = hash(str(nid)) % (10**9)
        out.append((sort_key, nid, node))
    out.sort(key=lambda x: x[0])
    return [(nid, node) for _, nid, node in out]


def _inject_prompt_and_size(
    workflow: Dict[str, Any],
    prompt: str,
    aspect_ratio: str,
    negative_prompt: str = "",
) -> Dict[str, Any]:
    w = copy.deepcopy(workflow)
    raw = json.dumps(workflow)
    had_pos_ph = PROMPT_PLACEHOLDER in raw
    had_neg_ph = NEGATIVE_PROMPT_PLACEHOLDER in raw
    neg_clean = (negative_prompt or "").strip()

    if had_pos_ph or had_neg_ph:

        def walk_replace(obj: Any) -> None:
            if isinstance(obj, dict):
                for k, v in list(obj.items()):
                    if isinstance(v, str):
                        s = v
                        if PROMPT_PLACEHOLDER in s:
                            s = s.replace(PROMPT_PLACEHOLDER, prompt)
                        if NEGATIVE_PROMPT_PLACEHOLDER in s:
                            s = s.replace(NEGATIVE_PROMPT_PLACEHOLDER, neg_clean)
                        obj[k] = s
                    else:
                        walk_replace(v)
            elif isinstance(obj, list):
                for item in obj:
                    walk_replace(item)

        walk_replace(w)

    clips = _clip_encode_nodes_sorted(w)

    if not had_pos_ph:
        if not clips:
            raise ValueError(
                "Coloque '{{PROMPT}}' no prompt positivo do workflow (API JSON) "
                "ou garanta pelo menos um nó CLIPTextEncode com inputs.text."
            )
        clips[0][1]["inputs"]["text"] = prompt

    if not had_neg_ph and len(clips) >= 2:
        clips[1][1]["inputs"]["text"] = neg_clean

    ww, hh = _aspect_to_wh(aspect_ratio)
    latent_types = ("EmptyLatentImage", "EmptySD3LatentImage")
    for _node_id, node in w.items():
        if not isinstance(node, dict):
            continue
        if node.get("class_type") not in latent_types:
            continue
        inp = node.setdefault("inputs", {})
        inp["width"] = ww
        inp["height"] = hh

    return w


def _post_prompt(base_url: str, workflow: Dict[str, Any], client_id: str = "orbitalsync") -> Dict[str, Any]:
    url = base_url.rstrip("/") + "/prompt"
    body = json.dumps({"prompt": workflow, "client_id": client_id}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _wait_for_history_entry(base_url: str, prompt_id: str, timeout_sec: float = 180.0) -> Dict[str, Any]:
    hist_url = base_url.rstrip("/") + "/history"
    deadline = time.time() + timeout_sec
    last_err: Optional[BaseException] = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(hist_url, timeout=60) as r:
                all_hist = json.loads(r.read().decode("utf-8"))
            entry = all_hist.get(prompt_id)
            if entry and entry.get("outputs"):
                return entry
        except Exception as e:
            last_err = e
        time.sleep(0.4)
    msg = f"Timeout aguardando resultado do ComfyUI (prompt_id={prompt_id})."
    if last_err:
        msg += f" Último erro: {last_err}"
    raise TimeoutError(msg)


def _first_image_ref(outputs: Dict[str, Any]) -> Optional[Tuple[str, str, str]]:
    if not isinstance(outputs, dict):
        return None
    for _nid, out in outputs.items():
        if not isinstance(out, dict):
            continue
        images = out.get("images") or []
        if not isinstance(images, list):
            continue
        for img in images:
            if not isinstance(img, dict):
                continue
            fn = img.get("filename")
            if not fn:
                continue
            sub = img.get("subfolder", "") or ""
            typ = img.get("type", "output") or "output"
            return str(fn), str(sub), str(typ)
    return None


def _fetch_image_bytes(base_url: str, filename: str, subfolder: str, typ: str) -> bytes:
    q = urllib.parse.urlencode(
        {"filename": filename, "subfolder": subfolder, "type": typ}
    )
    url = base_url.rstrip("/") + "/view?" + q
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def _mime_to_file_ext(mime: str) -> str:
    m = (mime or "").lower().split(";")[0].strip()
    if m == "image/jpeg":
        return ".jpg"
    if m == "image/webp":
        return ".webp"
    return ".png"


def comfyui_imagens_dir() -> Path:
    return REPO_ROOT / "integrations" / "comfyui" / "imagens"


def _legacy_comfyui_imagens_dir() -> Path:
    """Histórico antigo gravava `data/comfyui/imagens/` — mantido só para resolver ficheiros já referenciados."""
    return REPO_ROOT / "data" / "comfyui" / "imagens"


def repo_relative_posix(path: Path) -> Optional[str]:
    """Caminho relativo à raiz do repo, com `/` (para JSON / URLs)."""
    try:
        return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return None


def safe_comfyui_imagens_file(relpath: str) -> Optional[Path]:
    """
    Resolve `relpath` (ex.: integrations/comfyui/imagens/foo.png) dentro das pastas
    permitidas (sem path traversal). Aceita ainda `data/comfyui/imagens/` legado no JSON
    e procura o mesmo ficheiro em integrations/comfyui/imagens/ se tiver sido movido.
    """
    if not relpath or not isinstance(relpath, str):
        return None
    norm = relpath.replace("\\", "/").strip().lstrip("/")
    if not norm or ".." in norm.split("/"):
        return None

    def _try_under(root: Path, rel_norm: str) -> Optional[Path]:
        candidate = (REPO_ROOT / rel_norm).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError:
            return None
        return candidate if candidate.is_file() else None

    primary = comfyui_imagens_dir().resolve()
    legacy = _legacy_comfyui_imagens_dir().resolve()

    for hit in (_try_under(primary, norm), _try_under(legacy, norm)):
        if hit is not None:
            return hit

    old_prefix = "data/comfyui/imagens/"
    if norm.startswith(old_prefix):
        tail = norm[len(old_prefix) :].lstrip("/")
        if tail and ".." not in tail.split("/"):
            alt = (primary / tail).resolve()
            try:
                alt.relative_to(primary)
            except ValueError:
                return None
            if alt.is_file():
                return alt
    return None


def save_comfyui_image_to_data_dir(raw: bytes, mime_type: str) -> Optional[Path]:
    """
    Grava cópia da imagem gerada em `integrations/comfyui/imagens/`.
    Falhas de I/O não interrompem a geração; retorna None nesse caso.
    """
    try:
        out_dir = comfyui_imagens_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        ext = _mime_to_file_ext(mime_type)
        name = f"athenas_{ts}_{secrets.token_hex(4)}{ext}"
        path = out_dir / name
        path.write_bytes(raw)
        return path
    except OSError as e:
        print(f"[ComfyUI] Não foi possível salvar em integrations/comfyui/imagens: {e}")
        return None


def save_chat_upload_image_to_data_dir(raw: bytes, mime_type: str) -> Optional[Path]:
    """
    Grava anexo enviado pelo utilizador no chat em `integrations/comfyui/imagens/`
    (mesmo destino que `/api/comfyui-image`, para o histórico mostrar a miniatura).
    """
    try:
        out_dir = comfyui_imagens_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        ext = _mime_to_file_ext(mime_type)
        name = f"chat_upload_{ts}_{secrets.token_hex(4)}{ext}"
        path = out_dir / name
        path.write_bytes(raw)
        return path
    except OSError as e:
        print(f"[Chat] Não foi possível gravar anexo do chat: {e}")
        return None


def generate_image_via_comfyui(
    base_url: str,
    workflow_path: str,
    prompt: str,
    aspect_ratio: str = "16:9",
    negative_prompt: str = "",
) -> Tuple[str, str, Optional[str]]:
    """
    Enfileira o workflow no ComfyUI, espera o histórico e retorna
    (base64_str, mime_type, image_relpath ou None se não gravou em disco).
    """
    base_url = (base_url or "").strip().rstrip("/")
    if not base_url:
        raise ValueError("COMFYUI_BASE_URL vazio.")

    wf = _load_workflow(workflow_path)
    wf_ready = _inject_prompt_and_size(wf, prompt, aspect_ratio, negative_prompt=negative_prompt)

    res = _post_prompt(base_url, wf_ready)
    if res.get("node_errors"):
        raise RuntimeError(f"ComfyUI node_errors: {res['node_errors']}")
    prompt_id = res.get("prompt_id")
    if not prompt_id:
        raise RuntimeError(f"Resposta inesperada do ComfyUI /prompt: {res}")

    entry = _wait_for_history_entry(base_url, str(prompt_id))
    outputs = entry.get("outputs") or {}
    ref = _first_image_ref(outputs)
    if not ref:
        raise RuntimeError(f"ComfyUI não retornou imagem nos outputs: {outputs}")

    filename, subfolder, typ = ref
    raw = _fetch_image_bytes(base_url, filename, subfolder, typ)
    b64 = base64.b64encode(raw).decode("ascii")

    lower = filename.lower()
    if lower.endswith(".png"):
        mime = "image/png"
    elif lower.endswith(".jpg") or lower.endswith(".jpeg"):
        mime = "image/jpeg"
    elif lower.endswith(".webp"):
        mime = "image/webp"
    else:
        mime = "image/png"

    saved = save_comfyui_image_to_data_dir(raw, mime)
    saved_relpath: Optional[str] = None
    if saved is not None:
        print(f"[ComfyUI] Imagem salva no projeto: {saved}")
        saved_relpath = repo_relative_posix(saved)

    return b64, mime, saved_relpath
