"""Leitura/gravação do `.env` na raiz do repositório (uso local / Electron)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Tuple

from orbital.paths import REPO_ROOT

DOTENV_PATH = REPO_ROOT / ".env"
DOTENV_BACKUP_PATH = REPO_ROOT / ".env.bak"
MAX_BYTES = 256 * 1024


def dotenv_path_display() -> str:
    return str(DOTENV_PATH)


def read_dotenv_file() -> Tuple[bool, str, str]:
    """
    Retorna (ok, conteúdo_utf8, mensagem_erro).
    Se o ficheiro não existir, ok=True e conteúdo vazio.
    """
    try:
        if not DOTENV_PATH.is_file():
            return True, "", ""
        raw = DOTENV_PATH.read_bytes()
        if len(raw) > MAX_BYTES:
            return False, "", f".env excede {MAX_BYTES // 1024} KB."
        text = raw.decode("utf-8")
        return True, text, ""
    except OSError as e:
        return False, "", str(e)
    except UnicodeDecodeError:
        return False, "", "O .env não está em UTF-8 válido."


def write_dotenv_file(content: str) -> Tuple[bool, str]:
    """Grava o `.env`; cria `.env.bak` se já existia um .env."""
    if not isinstance(content, str):
        return False, "Conteúdo inválido."
    encoded = content.encode("utf-8")
    if len(encoded) > MAX_BYTES:
        return False, f"Conteúdo excede {MAX_BYTES // 1024} KB."

    try:
        DOTENV_PATH.parent.mkdir(parents=True, exist_ok=True)
        if DOTENV_PATH.is_file():
            try:
                DOTENV_BACKUP_PATH.write_bytes(DOTENV_PATH.read_bytes())
            except OSError:
                pass
        DOTENV_PATH.write_bytes(encoded)
        try:
            os.chmod(DOTENV_PATH, 0o600)
        except OSError:
            pass
        return True, ""
    except OSError as e:
        return False, str(e)
