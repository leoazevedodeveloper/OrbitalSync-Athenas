"""Raízes do repositório e do diretório `backend/` (única fonte de verdade para paths)."""
from pathlib import Path

_ORBITAL_PKG = Path(__file__).resolve().parent
BACKEND_ROOT = _ORBITAL_PKG.parent
REPO_ROOT = BACKEND_ROOT.parent
