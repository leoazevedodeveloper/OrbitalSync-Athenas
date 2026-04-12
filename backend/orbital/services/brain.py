"""BrainVault -- persistent Obsidian-based memory for ATHENAS."""

import logging
import os
import re
import tempfile
import unicodedata
from logging.handlers import RotatingFileHandler
from pathlib import Path

from orbital.paths import REPO_ROOT

_LOG_DIR = REPO_ROOT / "logs"
_LOG_DIR.mkdir(parents=True, exist_ok=True)

_mem_logger = logging.getLogger("orbital.brain")
_mem_logger.setLevel(logging.DEBUG)
_mem_logger.propagate = False

if not _mem_logger.handlers:
    _handler = RotatingFileHandler(
        str(_LOG_DIR / "memory.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    _handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%dT%H:%M:%S")
    )
    _mem_logger.addHandler(_handler)

_WIKILINK_RE = re.compile(r"\[\[(.+?)]]")

READONLY_SECTIONS = frozenset([
    "00 - Core",
    "02 - Skills",
    "03 - Thinking",
    "08 - System",
])

_DEFAULT_VAULT_REL = os.path.join("data", "memory", "OrbitalSync")


class BrainVault:
    """Read/write/search the Obsidian vault used as ATHENAS' brain."""

    def __init__(self, vault_path: str | Path | None = None):
        if vault_path is None:
            vault_path = os.environ.get("ORBITAL_BRAIN_PATH") or str(
                REPO_ROOT / _DEFAULT_VAULT_REL
            )
        self.vault = Path(vault_path).resolve()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_accents(text: str) -> str:
        """Remove diacritics/accents for fuzzy path matching (e.g. 'Memória' -> 'Memoria')."""
        nfkd = unicodedata.normalize("NFKD", text)
        return "".join(c for c in nfkd if not unicodedata.combining(c))

    def _note_path(self, note: str) -> Path:
        """Resolve a note reference to an absolute .md path.

        Tries the exact path first. If it doesn't exist, falls back to
        accent-insensitive matching so that ``01 - Memoria/Usuario``
        resolves to ``01 - Memória/Usuário.md``.
        """
        note = note.strip().removesuffix(".md")
        exact = self.vault / f"{note}.md"
        if exact.is_file():
            return exact

        # Fuzzy fallback: compare accent-stripped + lowered paths
        target = self._strip_accents(note).lower().replace("\\", "/")
        for md in self.vault.rglob("*.md"):
            rel = md.relative_to(self.vault)
            if rel.parts[0] == ".obsidian":
                continue
            candidate = self._strip_accents(str(rel.with_suffix(""))).lower().replace("\\", "/")
            if candidate == target:
                _mem_logger.debug("RESOLVE  %r -> fuzzy matched %s", note, rel)
                return md

        return exact

    def _section_of(self, path: Path) -> str | None:
        """Return the top-level section folder name for a note path, or None."""
        try:
            rel = path.relative_to(self.vault)
        except ValueError:
            return None
        parts = rel.parts
        return parts[0] if len(parts) > 1 else None

    def _is_readonly(self, path: Path) -> bool:
        section = self._section_of(path)
        return section in READONLY_SECTIONS if section else False

    def _build_wikilink_index(self) -> dict[str, str]:
        """Map note name (stem) -> section/stem for every .md in the vault."""
        index: dict[str, str] = {}
        for md in self.vault.rglob("*.md"):
            rel = md.relative_to(self.vault)
            if rel.parts[0] == ".obsidian":
                continue
            index[md.stem] = str(rel.with_suffix(""))
        return index

    def resolve_wikilinks(self, content: str) -> dict[str, str | None]:
        """Find all ``[[Name]]`` in *content* and map each to its vault path (or None)."""
        names = _WIKILINK_RE.findall(content)
        if not names:
            return {}
        index = self._build_wikilink_index()
        return {name: index.get(name) for name in dict.fromkeys(names)}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def read_note(self, note: str) -> dict:
        """Return ``{"content": ..., "links": {...}}`` or an error dict."""
        path = self._note_path(note)
        if not path.is_file():
            _mem_logger.warning("READ  note=%r -> NOT FOUND", note)
            return {"error": f"Note not found: {note}"}
        content = path.read_text(encoding="utf-8")
        links = self.resolve_wikilinks(content)
        _mem_logger.info("READ  note=%r  chars=%d  links=%s", note, len(content), list(links.keys()))
        return {"content": content, "links": links}

    def write_note(self, note: str, content: str, mode: str = "overwrite") -> dict:
        """Write (append/overwrite) or create a note. Returns ``{"ok": True}`` or error."""
        path = self._note_path(note)
        if self._is_readonly(path):
            section = self._section_of(path)
            _mem_logger.warning("WRITE note=%r -> BLOCKED (readonly section %r)", note, section)
            return {"error": f"Section '{section}' is read-only."}

        existed = path.is_file()
        path.parent.mkdir(parents=True, exist_ok=True)

        if mode == "append" and existed:
            existing = path.read_text(encoding="utf-8")
            final = existing.rstrip("\n") + "\n" + content + "\n"
        else:
            final = content if content.endswith("\n") else content + "\n"

        # Atomic write: tmp in same dir then rename (safe with Obsidian open).
        fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(final)
            os.replace(tmp, str(path))
        except Exception as exc:
            _mem_logger.error("WRITE note=%r -> FAILED: %s", note, exc)
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

        action = "CREATED" if not existed else ("APPENDED" if mode == "append" else "OVERWRITTEN")
        _mem_logger.info("WRITE note=%r  mode=%s  action=%s  chars=%d", note, mode, action, len(final))
        rel = str(path.relative_to(self.vault))
        try:
            from orbital.services.brain_rag import schedule_reindex_note

            schedule_reindex_note(self.vault, rel)
        except Exception as exc:
            _mem_logger.warning("BRAIN RAG schedule reindex after write: %s", exc)
        return {"ok": True, "path": rel, "created": not existed}

    def search_notes(self, query: str, context_lines: int = 2) -> list[dict]:
        """Case-insensitive keyword search across all notes. Returns matches with snippets."""
        results: list[dict] = []
        q = query.lower()
        for md in sorted(self.vault.rglob("*.md")):
            rel = md.relative_to(self.vault)
            if rel.parts[0] == ".obsidian":
                continue
            try:
                lines = md.read_text(encoding="utf-8").splitlines()
            except Exception:
                continue
            for i, line in enumerate(lines):
                if q in line.lower():
                    start = max(0, i - context_lines)
                    end = min(len(lines), i + context_lines + 1)
                    snippet = "\n".join(lines[start:end])
                    results.append({
                        "note": str(rel.with_suffix("")),
                        "line": i + 1,
                        "snippet": snippet,
                    })
                    break
        _mem_logger.info("SEARCH query=%r  hits=%d", query, len(results))
        return results

    def list_sections(self, section: str | None = None) -> dict:
        """List sections and their notes. If *section* is given, list only that one."""
        tree: dict[str, list[str]] = {}
        for md in sorted(self.vault.rglob("*.md")):
            rel = md.relative_to(self.vault)
            if rel.parts[0] == ".obsidian":
                continue
            sec = rel.parts[0] if len(rel.parts) > 1 else "(root)"
            if section and sec != section:
                continue
            tree.setdefault(sec, []).append(md.stem)
        total = sum(len(v) for v in tree.values())
        _mem_logger.info("LIST  section=%r  sections=%d  notes=%d", section, len(tree), total)
        return tree
