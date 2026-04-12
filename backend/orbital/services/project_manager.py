import json
import os
import shutil
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from orbital.services.memory.salience import (
    is_selective_remote_enabled,
    should_sync_to_remote_memory,
)
from orbital.services.supabase.chat_history import (
    append_chat_message,
    fetch_recent_messages,
    search_messages,
)
from orbital.settings import SETTINGS

SINGLE_PROJECT_NAME = "OrbitalSync"


def _memory_backend() -> str:
    return str(SETTINGS.get("memory_backend", "supabase")).strip().lower()


def _supabase_enabled() -> bool:
    return _memory_backend() in ("supabase", "both")


def _brain_enabled() -> bool:
    return _memory_backend() in ("brain", "both")


def _remote_memory_followup(
    project: str,
    sender: str,
    text: str,
    *,
    mime_type: Optional[str] = None,
    image_relpath: Optional[str] = None,
) -> None:
    """Gate Ollama + Supabase fora do caminho crítico (evita atrasar Gemini Live / chat)."""
    if not _supabase_enabled():
        return
    try:
        selective = is_selective_remote_enabled()
        sync_remote, mem_reason = should_sync_to_remote_memory(
            sender,
            text,
            selective=selective,
            mime_type=mime_type,
            image_relpath=image_relpath,
        )
        if not sync_remote:
            if selective and (os.getenv("ORBITAL_MEMORY_SALIENCE_DEBUG") or "").strip().lower() in (
                "1",
                "true",
                "yes",
            ):
                print(
                    f"[MEMORY] Remoto omitido ({mem_reason}) "
                    f"sender={sender!r} len={len((text or '').strip())}"
                )
            return

        ok = append_chat_message(
            project,
            sender,
            text,
            mime_type=mime_type,
            image_relpath=image_relpath,
            memory_salience=mem_reason,
        )
        if not ok:
            print(
                f"[ProjectManager] Mensagem aprovada ({mem_reason}) ficou só no disco — Supabase erro/off."
            )
    except Exception as e:
        print(f"[ProjectManager] [ERR] follow-up memória remota: {e!r}")


def _entry_fingerprint(entry: Dict[str, Any]) -> Tuple[float, str]:
    ts = float(entry.get("timestamp", 0) or 0.0)
    text = str(entry.get("text", "") or "")[:160]
    return (round(ts, 2), text)


def _merge_search_matches(a: List[dict], b: List[dict], lim: int) -> List[dict]:
    seen: Set[Tuple[float, str]] = set()
    merged: List[dict] = []
    for entry in a + b:
        fp = _entry_fingerprint(entry)
        if fp in seen:
            continue
        seen.add(fp)
        merged.append(entry)
    merged.sort(key=lambda e: float(e.get("timestamp", 0) or 0.0))
    return merged[-lim:]


class ProjectManager:
    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)
        self.projects_dir = self.workspace_root / "data" / "projects"
        self.current_project = SINGLE_PROJECT_NAME

        if not self.projects_dir.exists():
            self.projects_dir.mkdir(parents=True)

        self._ensure_single_project_dirs()

    def _single_project_path(self) -> Path:
        return self.projects_dir / SINGLE_PROJECT_NAME

    def _ensure_single_project_dirs(self) -> None:
        project_path = self._single_project_path()
        if not project_path.exists():
            project_path.mkdir(parents=True)
        (project_path / "cad").mkdir(exist_ok=True)
        (project_path / "browser").mkdir(exist_ok=True)

    def create_project(self, name: str):
        self._ensure_single_project_dirs()
        requested = (name or "").strip()
        if requested and requested != SINGLE_PROJECT_NAME:
            return (
                False,
                f"Single-project mode enabled. Only '{SINGLE_PROJECT_NAME}' is available.",
            )
        return True, f"Single-project mode active: '{SINGLE_PROJECT_NAME}'."

    def switch_project(self, name: str):
        self._ensure_single_project_dirs()
        requested = (name or "").strip()
        if requested and requested != SINGLE_PROJECT_NAME:
            return (
                False,
                f"Single-project mode enabled. Only '{SINGLE_PROJECT_NAME}' is available.",
            )
        self.current_project = SINGLE_PROJECT_NAME
        return True, f"Using single project '{SINGLE_PROJECT_NAME}'."

    def list_projects(self):
        return [SINGLE_PROJECT_NAME]

    def get_current_project_path(self):
        return self._single_project_path()

    def _chat_log_path(self) -> Path:
        return self.get_current_project_path() / "chat_history.jsonl"

    def _tail_jsonl_messages(self, path: Path, limit: int) -> List[dict]:
        lim = max(1, min(500, int(limit)))
        if not path.is_file():
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except OSError as e:
            print(f"[ProjectManager] [ERR] Failed to read {path.name}: {e}")
            return []
        history: List[dict] = []
        for line in lines[-lim:]:
            try:
                history.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return history

    def _search_jsonl_tokens(self, path: Path, query: str, cap: int) -> List[dict]:
        q = (query or "").strip()
        lim = max(1, min(200, int(cap)))
        if not q or not path.is_file():
            return []

        tokens = [t for t in q.casefold().split() if t]
        if not tokens:
            tokens = [q.casefold()]
        matches: List[dict] = []
        try:
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    text_fold = str(entry.get("text", "")).casefold()
                    if all(tok in text_fold for tok in tokens):
                        matches.append(entry)
        except OSError as e:
            print(f"[ProjectManager] [ERR] Failed to search chat history: {e}")
            return []

        return matches[-lim:]

    def log_chat(
        self,
        sender: str,
        text: str,
        *,
        mime_type: Optional[str] = None,
        image_relpath: Optional[str] = None,
    ):
        """Transcrição completa no JSONL de imediato; gate Ollama + Supabase em thread (não bloqueia a IA)."""
        log_file = self._chat_log_path()
        entry = {
            "timestamp": time.time(),
            "sender": sender,
            "text": text,
        }
        if mime_type:
            entry["mime_type"] = mime_type
        if image_relpath:
            entry["image_relpath"] = image_relpath

        log_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
        except OSError as e:
            print(f"[ProjectManager] [ERR] Falha ao gravar transcript local: {e}")
            return

        project = self.current_project
        threading.Thread(
            target=_remote_memory_followup,
            args=(project, sender, text),
            kwargs={"mime_type": mime_type, "image_relpath": image_relpath},
            daemon=True,
            name="orbital-remote-memory",
        ).start()

    def save_cad_artifact(self, source_path: str, prompt: str):
        if not os.path.exists(source_path):
            print(f"[ProjectManager] [ERR] Source file not found: {source_path}")
            return None

        timestamp = int(time.time())
        safe_prompt = (
            "".join([c for c in prompt if c.isalnum() or c in (" ", "-", "_")])[:30]
            .strip()
            .replace(" ", "_")
        )
        filename = f"{timestamp}_{safe_prompt}.stl"

        dest_path = self.get_current_project_path() / "cad" / filename

        try:
            shutil.copy2(source_path, dest_path)
            print(f"[ProjectManager] Saved CAD artifact to: {dest_path}")
            return str(dest_path)
        except Exception as e:
            print(f"[ProjectManager] [ERR] Failed to save artifact: {e}")
            return None

    def get_project_context(self, max_file_size: int = 10000) -> str:
        project_path = self.get_current_project_path()
        if not project_path.exists():
            return f"Project '{self.current_project}' does not exist."

        context_lines = [f"=== Project Context: '{self.current_project}' ==="]
        context_lines.append(f"Project directory: {project_path}")
        context_lines.append("")

        all_files = []
        for root, dirs, files in os.walk(project_path):
            for f in files:
                rel_path = os.path.relpath(os.path.join(root, f), project_path)
                all_files.append(rel_path)

        if not all_files:
            context_lines.append("(No files in project yet)")
        else:
            context_lines.append(f"Files ({len(all_files)} total):")
            for f in all_files:
                context_lines.append(f"  - {f}")

        context_lines.append("")

        text_extensions = {
            ".txt",
            ".py",
            ".js",
            ".jsx",
            ".ts",
            ".tsx",
            ".json",
            ".md",
            ".html",
            ".css",
            ".jsonl",
        }
        for rel_path in all_files:
            ext = os.path.splitext(rel_path)[1].lower()
            if ext not in text_extensions:
                continue

            full_path = project_path / rel_path
            try:
                file_size = full_path.stat().st_size
                if file_size > max_file_size:
                    context_lines.append(
                        f"--- {rel_path} (too large: {file_size} bytes, skipped) ---"
                    )
                    continue

                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                context_lines.append(f"--- {rel_path} ---")
                context_lines.append(content)
                context_lines.append("")
            except Exception as e:
                context_lines.append(f"--- {rel_path} (error reading: {e}) ---")

        return "\n".join(context_lines)

    def get_ui_chat_transcript(self, limit: int = 120):
        """
        Histórico para o painel de chat (Socket `get_chat_history`): transcrição completa
        em `chat_history.jsonl`, independente do que está só na nuvem.
        """
        log_file = self._chat_log_path()
        if not log_file.is_file():
            print(f"[ProjectManager] UI chat: 0 msg — {log_file.name} inexistente.")
            return []
        local = self._tail_jsonl_messages(log_file, limit)
        print(
            f"[ProjectManager] UI chat: {len(local)} msg(s) transcript "
            f"({log_file.name}, limit={limit})"
        )
        return local

    def get_live_startup_history(self, limit: int = 10):
        """
        Contexto injectado na sessão Live (arranque/reconnect).
        Respeita memory_backend: supabase (primeiro Supabase, fallback JSONL),
        brain (só JSONL local), both (Supabase primeiro, fallback JSONL).
        """
        backend = _memory_backend()

        if _supabase_enabled():
            remote = fetch_recent_messages(self.current_project, limit)
            if remote is not None:
                print(
                    f"[ProjectManager] Live context: {len(remote)} msg(s) via Supabase "
                    f"(projeto={self.current_project!r}, limit={limit}, backend={backend})"
                )
                return remote

        log_file = self._chat_log_path()
        if log_file.is_file():
            local = self._tail_jsonl_messages(log_file, limit)
            if local:
                print(
                    f"[ProjectManager] Live context: {len(local)} msg(s) via JSONL local "
                    f"({log_file.name}, limit={limit}, backend={backend})"
                )
                return local

        print(f"[ProjectManager] Live context: 0 msg (backend={backend}).")
        return []

    def search_chat_history(self, query: str, limit: int = 10):
        q = (query or "").strip()
        lim = max(1, min(50, int(limit)))
        if not q:
            return []

        backend = _memory_backend()
        log_file = self._chat_log_path()
        local_hits = self._search_jsonl_tokens(log_file, q, max(lim * 4, 24))

        if not _supabase_enabled():
            out = local_hits[-lim:] if local_hits else []
            print(
                f"[ProjectManager] Busca histórico: {len(out)} match(es) local "
                f"(query={q!r}, limit={lim}, backend={backend})"
            )
            return out

        remote = search_messages(self.current_project, q, lim)
        if remote is None:
            out = local_hits[-lim:] if local_hits else []
            print(
                f"[ProjectManager] Busca histórico: {len(out)} match(es) disco "
                f"(query={q!r}, limit={lim}, backend={backend})"
            )
            return out

        merged = _merge_search_matches(local_hits, remote, lim)
        print(
            f"[ProjectManager] Busca histórico: {len(merged)} match(es) híbrido "
            f"(query={q!r}, limit={lim}, backend={backend})"
        )
        return merged
