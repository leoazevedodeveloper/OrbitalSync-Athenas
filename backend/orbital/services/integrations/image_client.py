"""
Cliente de geracao de imagem — OpenAI API (100%).

Pipeline:
  1. Gemini Flash turbina/traduz o prompt para ingles profissional
  2. GPT Image 1.5 gera/edita a imagem (fallback: gpt-image-1)

Variaveis de ambiente necessarias:
  OPENAI_API_KEY   (platform.openai.com)
  GEMINI_API_KEY   (aistudio.google.com)
"""
from __future__ import annotations

import base64
import io
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


def _enhance_prompt_gemini(raw_prompt: str, gemini_api_key: str) -> str:
    """
    Usa Gemini Flash para traduzir e enriquecer o prompt em ingles profissional.
    Retorna o prompt melhorado, ou o original se falhar.
    """
    from google import genai

    system = (
        "You are an expert image generation prompt engineer. "
        "Receive a user's image idea (in any language) and return ONLY "
        "a rich, detailed English prompt optimized for a photorealistic AI image generator. "
        "Rules: always write in English; add professional photography terms (lighting, "
        "camera angle, lens, style); include mood, atmosphere, color palette; "
        "keep it under 200 words; return ONLY the prompt text, no explanations."
    )
    try:
        client = genai.Client(api_key=gemini_api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=f"{system}\n\nImage idea: {raw_prompt}",
        )
        enhanced = (response.text or "").strip()
        if enhanced:
            print(f"[ImageGen] Prompt turbinado (Gemini): {enhanced[:120]!r}...")
            return enhanced
    except Exception as e:
        print(f"[ImageGen] Enhance prompt falhou, usando original: {e!r}")
    return raw_prompt


def _call_openai_images(api_key: str, model: str, prompt: str, size: str, quality: str) -> Tuple[bytes, str]:
    """Chama OpenAI Images API (geracao do zero). Levanta excecao se falhar."""
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


def _call_openai_images_edit(
    api_key: str, model: str, prompt: str, size: str, quality: str,
    input_image_bytes: bytes, input_mime_type: str,
) -> Tuple[bytes, str]:
    """Chama OpenAI Images Edit API (edicao de imagem existente). Levanta excecao se falhar."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    ext = ".jpg" if "jpeg" in input_mime_type else ".png"
    image_file = io.BytesIO(input_image_bytes)
    image_file.name = f"input{ext}"
    response = client.images.edit(
        model=model,
        image=image_file,
        prompt=prompt,
        size=size,
        n=1,
    )
    img = response.data[0] if response.data else None
    if img is None:
        raise RuntimeError(f"OpenAI nao retornou imagem editada. Resposta: {response}")
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
    input_image_b64: Optional[str] = None,
    input_mime_type: Optional[str] = None,
) -> Tuple[str, str, Optional[str]]:
    """
    Gera ou edita imagem via OpenAI (Gemini turbo + GPT Image).
    Se input_image_b64 for fornecido, usa o endpoint de edicao.
    Retorna (base64_str, mime_type, saved_relpath_ou_None).
    """
    import asyncio

    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError(
            "OPENAI_API_KEY nao configurada. "
            "Adicione no .env ou nas definicoes da Athena."
        )

    gemini_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    size = _ASPECT_TO_SIZE.get(aspect_ratio.strip(), "1024x1024")
    quality = _SIZE_TO_QUALITY.get(image_size.strip(), "medium")

    print(f"[ImageGen] Prompt original: {prompt[:80]!r}")
    if gemini_key:
        prompt = await asyncio.to_thread(_enhance_prompt_gemini, prompt, gemini_key)
    else:
        print("[ImageGen] GEMINI_API_KEY nao configurada, usando prompt original.")
    print(f"[ImageGen] {'Editando' if input_image_b64 else 'Gerando'} | size={size} | quality={quality}")

    # Decodifica imagem de entrada para edicao
    input_bytes: Optional[bytes] = None
    if input_image_b64:
        try:
            input_bytes = base64.b64decode(input_image_b64.strip(), validate=False)
        except Exception as e:
            print(f"[ImageGen] Falha ao decodificar imagem de entrada: {e!r}. Gerando do zero.")
            input_bytes = None

    last_error: Exception = RuntimeError("Nenhum modelo disponivel.")
    for model in _IMAGE_MODELS:
        try:
            print(f"[ImageGen] Tentando: {model}")
            if input_bytes:
                raw_bytes, mime_type = await asyncio.to_thread(
                    _call_openai_images_edit,
                    api_key, model, prompt, size, quality,
                    input_bytes, input_mime_type or "image/png",
                )
            else:
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
