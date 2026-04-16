"""
Cliente de geracao de imagem — OpenAI API (100%).

Pipeline:
  1. GPT-4o-mini turbina/traduz o prompt para ingles profissional
  2. GPT Image 1.5 gera a imagem (fallback: gpt-image-1)

Variavel de ambiente necessaria:
  OPENAI_API_KEY  (platform.openai.com)
"""
from __future__ import annotations

import base64
import logging
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

from orbital.paths import REPO_ROOT

logger = logging.getLogger("orbital.image_gen")

_IMAGE_MODELS = [
    "gpt-image-1.5",
    "gpt-image-1",
]

_ASPECT_TO_SIZE: dict[str, str] = {
    "1:1":  "1024x1024",
    "16:9": "1536x1024",
    "4:3":  "1536x1024",
    "3:4":  "1024x1536",
    "9:16": "1024x1536",
}

_SIZE_TO_QUALITY: dict[str, str] = {
    "512": "low",
    "1K":  "medium",
    "2K":  "high",
    "4K":  "high",
}


def generated_images_dir() -> Path:
    return REPO_ROOT / "data" / "generated-images"


def repo_relative_posix(path: Path) -> Optional[str]:
    """Caminho relativo a raiz do repo com `/` (para JSON / URLs)."""
    try:
        return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return None


def safe_generated_image_file(relpath: str) -> Optional[Path]:
    """Resolve relpath dentro da pasta permitida. Protege contra path traversal."""
    if not relpath or not isinstance(relpath, str):
        return None
    norm = relpath.replace("\\", "/").strip().lstrip("/")
    if not norm or ".." in norm.split("/"):
        return None
    images_dir = generated_images_dir().resolve()
    candidate = (REPO_ROOT / norm).resolve()
    try:
        candidate.relative_to(images_dir)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def save_generated_image(raw: bytes, mime_type: str) -> Optional[Path]:
    """Grava copia da imagem gerada em `data/generated-images/`."""
    try:
        out_dir = generated_images_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        m = (mime_type or "").lower().split(";")[0].strip()
        ext = ".jpg" if m == "image/jpeg" else (".webp" if m == "image/webp" else ".png")
        name = f"athenas_{ts}_{secrets.token_hex(4)}{ext}"
        path = out_dir / name
        path.write_bytes(raw)
        print(f"[ImageGen] Imagem salva: {path}")
        return path
    except OSError as e:
        print(f"[ImageGen] Nao foi possivel salvar imagem: {e}")
        return None


def save_chat_upload_image_to_data_dir(raw: bytes, mime_type: str) -> Optional[Path]:
    """Grava imagem enviada pelo utilizador no chat em `data/generated-images/`."""
    try:
        out_dir = generated_images_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        m = (mime_type or "").lower().split(";")[0].strip()
        ext = ".jpg" if m == "image/jpeg" else (".webp" if m == "image/webp" else ".png")
        name = f"chat_upload_{ts}_{secrets.token_hex(4)}{ext}"
        path = out_dir / name
        path.write_bytes(raw)
        return path
    except OSError as e:
        print(f"[ImageGen] Nao foi possivel gravar anexo do chat: {e}")
        return None


def _turbo_prompt(raw_prompt: str, api_key: str) -> str:
    """
    Usa GPT-4o-mini para traduzir e enriquecer o prompt em ingles profissional.
    Retorna o prompt melhorado, ou o original se falhar.
    """
    from openai import OpenAI

    system = (
        "You are an expert image generation prompt engineer. "
        "Receive a user's image idea (in any language) and return ONLY "
        "a rich, detailed English prompt optimized for a photorealistic AI image generator. "
        "Rules: always write in English; add professional photography terms (lighting, "
        "camera angle, lens, style); include mood, atmosphere, color palette; "
        "keep it under 200 words; return ONLY the prompt text, no explanations."
    )
    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Image idea: {raw_prompt}"},
            ],
            temperature=0.7,
            max_tokens=300,
        )
        enhanced = (response.choices[0].message.content or "").strip()
        if enhanced:
            print(f"[ImageGen] Prompt turbinado: {enhanced[:120]!r}...")
            return enhanced
    except Exception as e:
        print(f"[ImageGen] Turbo prompt falhou, usando original: {e!r}")
    return raw_prompt


def _call_openai_images(api_key: str, model: str, prompt: str, size: str, quality: str) -> Tuple[bytes, str]:
    """Chama OpenAI Images API. Levanta excecao se falhar."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    response = client.images.generate(
        model=model,
        prompt=prompt,
        size=size,
        quality=quality,
        output_format="png",
        n=1,
    )
    img = response.data[0] if response.data else None
    if img is None:
        raise RuntimeError(f"OpenAI nao retornou imagem. Resposta: {response}")
    if img.b64_json:
        return base64.b64decode(img.b64_json), "image/png"
    if img.url:
        import urllib.request
        with urllib.request.urlopen(img.url, timeout=60) as r:
            return r.read(), "image/png"
    raise RuntimeError(f"OpenAI retornou item sem b64_json nem url: {img}")


async def generate_image(
    prompt: str,
    aspect_ratio: str = "1:1",
    image_size: str = "1K",
) -> Tuple[str, str, Optional[str]]:
    """
    Gera imagem via OpenAI (GPT-4o-mini turbo + GPT Image).
    Retorna (base64_str, mime_type, saved_relpath_ou_None).
    """
    import asyncio

    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError(
            "OPENAI_API_KEY nao configurada. "
            "Adicione no .env ou nas definicoes da Athena."
        )

    size = _ASPECT_TO_SIZE.get(aspect_ratio.strip(), "1024x1024")
    quality = _SIZE_TO_QUALITY.get(image_size.strip(), "medium")

    print(f"[ImageGen] Prompt original: {prompt[:80]!r}")
    prompt = await asyncio.to_thread(_turbo_prompt, prompt, api_key)
    print(f"[ImageGen] Gerando | size={size} | quality={quality}")

    last_error: Exception = RuntimeError("Nenhum modelo disponivel.")
    for model in _IMAGE_MODELS:
        try:
            print(f"[ImageGen] Tentando: {model}")
            raw_bytes, mime_type = await asyncio.to_thread(
                _call_openai_images, api_key, model, prompt, size, quality
            )
            print(f"[ImageGen] OK | modelo={model} | bytes={len(raw_bytes)}")
            break
        except Exception as e:
            print(f"[ImageGen] {model!r} falhou: {e!r}")
            logger.warning("[ImageGen] modelo=%s erro=%r", model, e)
            last_error = e
    else:
        raise RuntimeError(f"Geracao de imagem falhou. Ultimo erro: {last_error}") from last_error

    b64 = base64.b64encode(raw_bytes).decode("ascii")
    saved = save_generated_image(raw_bytes, mime_type)
    saved_relpath = repo_relative_posix(saved) if saved else None

    return b64, mime_type, saved_relpath
