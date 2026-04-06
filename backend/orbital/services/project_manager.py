import os
import json
import shutil
import time
from pathlib import Path
from typing import Optional

from orbital.services.supabase.chat_history import (
    append_chat_message,
    fetch_recent_messages,
    search_messages,
)

SINGLE_PROJECT_NAME = "OrbitalSync"

class ProjectManager:
    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)
        self.projects_dir = self.workspace_root / "data" / "projects"
        self.current_project = SINGLE_PROJECT_NAME
        
        # Ensure projects root exists
        if not self.projects_dir.exists():
            self.projects_dir.mkdir(parents=True)

        # Single-project mode: ensure only the assistant's project path exists.
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
        """Single-project mode: keeps only OrbitalSync as active context."""
        self._ensure_single_project_dirs()
        requested = (name or "").strip()
        if requested and requested != SINGLE_PROJECT_NAME:
            return (
                False,
                f"Single-project mode enabled. Only '{SINGLE_PROJECT_NAME}' is available.",
            )
        return True, f"Single-project mode active: '{SINGLE_PROJECT_NAME}'."

    def switch_project(self, name: str):
        """Single-project mode: keeps OrbitalSync as the only active context."""
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
        """Single-project mode: always return only OrbitalSync."""
        return [SINGLE_PROJECT_NAME]

    def get_current_project_path(self):
        return self._single_project_path()

    def log_chat(
        self,
        sender: str,
        text: str,
        *,
        mime_type: Optional[str] = None,
        image_relpath: Optional[str] = None,
    ):
        """Appends a chat message to the current project's history."""
        log_file = self.get_current_project_path() / "chat_history.jsonl"
        entry = {
            "timestamp": time.time(),
            "sender": sender,
            "text": text,
        }
        if mime_type:
            entry["mime_type"] = mime_type
        if image_relpath:
            entry["image_relpath"] = image_relpath

        if append_chat_message(
            self.current_project,
            sender,
            text,
            mime_type=mime_type,
            image_relpath=image_relpath,
        ):
            return

        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")

    def save_cad_artifact(self, source_path: str, prompt: str):
        """Copies a generated CAD file to the project's 'cad' folder."""
        if not os.path.exists(source_path):
            print(f"[ProjectManager] [ERR] Source file not found: {source_path}")
            return None

        # Create a filename based on timestamp and prompt
        timestamp = int(time.time())
        # Brief sanitization of prompt for filename
        safe_prompt = "".join([c for c in prompt if c.isalnum() or c in (' ', '-', '_')])[:30].strip().replace(" ", "_")
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
        """
        Gathers context about the current project for the AI.
        Lists all files and reads text file contents (up to max_file_size bytes).
        """
        project_path = self.get_current_project_path()
        if not project_path.exists():
            return f"Project '{self.current_project}' does not exist."

        context_lines = [f"=== Project Context: '{self.current_project}' ==="]
        context_lines.append(f"Project directory: {project_path}")
        context_lines.append("")

        # List all files recursively
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

        # Read text files (skip binary and large files)
        text_extensions = {'.txt', '.py', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.html', '.css', '.jsonl'}
        for rel_path in all_files:
            ext = os.path.splitext(rel_path)[1].lower()
            if ext not in text_extensions:
                continue

            full_path = project_path / rel_path
            try:
                file_size = full_path.stat().st_size
                if file_size > max_file_size:
                    context_lines.append(f"--- {rel_path} (too large: {file_size} bytes, skipped) ---")
                    continue

                with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                context_lines.append(f"--- {rel_path} ---")
                context_lines.append(content)
                context_lines.append("")
            except Exception as e:
                context_lines.append(f"--- {rel_path} (error reading: {e}) ---")

        return "\n".join(context_lines)

    def get_recent_chat_history(self, limit: int = 10):
        """Returns the last 'limit' chat messages from history."""
        remote = fetch_recent_messages(self.current_project, limit)
        if remote is not None:
            print(
                f"[ProjectManager] Histórico: {len(remote)} msg(s) via Supabase "
                f"(projeto={self.current_project!r}, limit={limit})"
            )
            return remote

        log_file = self.get_current_project_path() / "chat_history.jsonl"
        if not log_file.exists():
            print(
                f"[ProjectManager] Histórico: 0 msg — Supabase indisponível/erro e sem {log_file.name}"
            )
            return []
            
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                
            # Parse last N lines
            history = []
            for line in lines[-limit:]:
                try:
                    entry = json.loads(line)
                    history.append(entry)
                except json.JSONDecodeError:
                    continue
            print(
                f"[ProjectManager] Histórico: {len(history)} msg(s) via disco "
                f"({log_file.name}, limit={limit})"
            )
            return history
        except Exception as e:
            print(f"[ProjectManager] [ERR] Failed to read chat history: {e}")
            return []

    def search_chat_history(self, query: str, limit: int = 10):
        """Search chat history by keyword/phrase, newest matches last for readable chronology."""
        q = (query or "").strip()
        lim = max(1, min(50, int(limit)))
        if not q:
            return []

        remote = search_messages(self.current_project, q, lim)
        if remote is not None:
            print(
                f"[ProjectManager] Busca histórico: {len(remote)} match(es) via Supabase "
                f"(query={q!r}, limit={lim})"
            )
            return remote

        log_file = self.get_current_project_path() / "chat_history.jsonl"
        if not log_file.exists():
            return []

        tokens = [t for t in q.casefold().split() if t]
        if not tokens:
            tokens = [q.casefold()]
        matches = []
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                for line in f:
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    text_fold = str(entry.get("text", "")).casefold()
                    if all(tok in text_fold for tok in tokens):
                        matches.append(entry)
        except Exception as e:
            print(f"[ProjectManager] [ERR] Failed to search chat history: {e}")
            return []

        out = matches[-lim:]
        print(
            f"[ProjectManager] Busca histórico: {len(out)} match(es) via disco "
            f"(query={q!r}, limit={lim})"
        )
        return out

