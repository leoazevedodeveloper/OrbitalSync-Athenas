"""Socket.IO: configurações, credenciais, .env, integrações, webhooks e permissões de tools."""
from __future__ import annotations

import asyncio
import os

from orbital.settings import SETTINGS, apply_semantic_memory_defaults, save_settings
from orbital.services.config.local_credentials import merge_save_and_apply
from orbital.services.integrations.launch_apps import add_launch_app_entry
from orbital.services.integrations.agenda_google import (
    delete_google_calendar_event,
    fetch_google_agenda_events_month,
)
from orbital.services.integrations.webhook_config import (
    fire_webhook_by_id,
    load_webhooks_config,
    normalize_trigger_webhook_payload,
)

from .. import state as st
from .common import append_settings_runtime_fields


async def emit_integration_tests_for_client(sio, sid: str) -> None:
    """Ping Supabase, ComfyUI, webhooks e Ollama; emite `integration_test_result` para o cliente."""
    try:
        from orbital.services.integrations.integration_connectivity import run_all_integration_tests

        comfy_base = (os.getenv("COMFYUI_BASE_URL") or "http://127.0.0.1:2000").strip().rstrip("/")
        ollama_raw = (os.getenv("ORBITAL_MEMORY_OLLAMA_URL") or "").strip().rstrip("/")
        if not ollama_raw:
            ollama_raw = str(SETTINGS.get("memory_ollama_url") or "").strip().rstrip("/")
        if not ollama_raw:
            ollama_raw = "http://127.0.0.1:11434"
        results = await asyncio.to_thread(run_all_integration_tests, comfy_base, ollama_raw)
        await sio.emit(
            "integration_test_result",
            {"ok": True, "results": results},
            room=sid,
        )
    except Exception as e:
        await sio.emit(
            "integration_test_result",
            {"ok": False, "error": str(e)[:500]},
            room=sid,
        )


def register_settings_handlers(sio, emit_runtime_log, emit_full_settings):
    @sio.event
    async def get_settings(sid):
        payload = dict(SETTINGS)
        append_settings_runtime_fields(payload)
        await sio.emit("settings", payload)

    @sio.event
    async def save_server_credentials(sid, data=None):
        """Grava `data/local_credentials.json`, reaplica env, recarrega Supabase e cliente Gemini."""
        try:
            from orbital.assistant.gemini_setup import refresh_gemini_client
            from orbital.services.supabase.remote_config import try_apply_supabase_config

            if not isinstance(data, dict):
                await sio.emit(
                    "server_credentials_save_result",
                    {"ok": False, "message": "Dados inválidos."},
                    room=sid,
                )
                return
            ok, msg = merge_save_and_apply(data)
            if ok:
                try:
                    try_apply_supabase_config(SETTINGS)
                except Exception as e:
                    print(f"[SERVER] Supabase reload após credenciais: {e!r}")
                apply_semantic_memory_defaults(SETTINGS)
                try:
                    refresh_gemini_client()
                except Exception as e:
                    print(f"[SERVER] Gemini refresh: {e!r}")
            await emit_full_settings()
            await sio.emit(
                "server_credentials_save_result",
                {"ok": ok, "message": msg or ("OK" if ok else "Erro")},
                room=sid,
            )
            await emit_runtime_log(
                "info" if ok else "error",
                f"Salvar credenciais: {'OK' if ok else 'falhou'} - {msg or ''}".strip(" -"),
                source="credentials",
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] save_server_credentials: {e!r}")
            await sio.emit(
                "server_credentials_save_result",
                {"ok": False, "message": str(e)[:500]},
                room=sid,
            )
            await emit_runtime_log(
                "error",
                f"Excecao em save_server_credentials: {e}",
                source="credentials",
                room=sid,
            )

    @sio.event
    async def get_dotenv_file(sid):
        """Devolve o texto do `.env` na raiz do repo (apenas ligações locais)."""
        try:
            from orbital.services.config.dotenv_file import DOTENV_PATH, dotenv_path_display, read_dotenv_file

            ok, text, err = read_dotenv_file()
            await sio.emit(
                "dotenv_file_content",
                {
                    "ok": ok,
                    "path": dotenv_path_display(),
                    "exists": DOTENV_PATH.is_file(),
                    "content": text if ok else "",
                    "message": err if not ok else "",
                },
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] get_dotenv_file: {e!r}")
            await sio.emit(
                "dotenv_file_content",
                {"ok": False, "path": "", "exists": False, "content": "", "message": str(e)[:500]},
                room=sid,
            )

    @sio.event
    async def save_dotenv_file(sid, data=None):
        """Grava `.env`, reaplica env (com override do JSON local) e refresca Supabase/Gemini."""
        try:
            from orbital.assistant.gemini_setup import refresh_gemini_client
            from orbital.services.config.dotenv_file import dotenv_path_display, write_dotenv_file
            from orbital.services.config.local_credentials import reload_env_from_dotenv_and_file
            from orbital.services.supabase.remote_config import try_apply_supabase_config

            if not isinstance(data, dict):
                await sio.emit(
                    "dotenv_file_save_result",
                    {"ok": False, "message": "Dados inválidos."},
                    room=sid,
                )
                return
            content = data.get("content")
            if not isinstance(content, str):
                await sio.emit(
                    "dotenv_file_save_result",
                    {"ok": False, "message": "Campo content deve ser texto."},
                    room=sid,
                )
                return
            ok, err = write_dotenv_file(content)
            if ok:
                try:
                    reload_env_from_dotenv_and_file()
                except Exception as e:
                    print(f"[SERVER] reload após .env: {e!r}")
                try:
                    try_apply_supabase_config(SETTINGS)
                except Exception as e:
                    print(f"[SERVER] Supabase reload após .env: {e!r}")
                apply_semantic_memory_defaults(SETTINGS)
                try:
                    refresh_gemini_client()
                except Exception as e:
                    print(f"[SERVER] Gemini refresh após .env: {e!r}")
            await emit_full_settings()
            await sio.emit(
                "dotenv_file_save_result",
                {
                    "ok": ok,
                    "message": (err or "Ficheiro .env gravado.") if ok else (err or "Erro ao gravar."),
                    "path": dotenv_path_display(),
                },
                room=sid,
            )
            await emit_runtime_log(
                "info" if ok else "error",
                f"Salvar .env: {'OK' if ok else 'falhou'} - {(err or '').strip()}".strip(" -"),
                source="dotenv",
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] save_dotenv_file: {e!r}")
            await sio.emit(
                "dotenv_file_save_result",
                {"ok": False, "message": str(e)[:500]},
                room=sid,
            )
            await emit_runtime_log("error", f"Excecao em save_dotenv_file: {e}", source="dotenv", room=sid)

    @sio.event
    async def reveal_setting_secret(sid, data=None):
        """Devolve uma chave do ambiente atual (.env + local_credentials) para preencher a UI local."""
        try:
            from orbital.services.config.local_credentials import reload_env_from_dotenv_and_file

            reload_env_from_dotenv_and_file()
            if not isinstance(data, dict):
                await sio.emit(
                    "setting_secret_revealed",
                    {"ok": False, "field": "", "value": "", "message": "Dados inválidos."},
                    room=sid,
                )
                return
            field = str(data.get("field") or "").strip()
            if field == "gemini_api_key":
                val = (os.getenv("GEMINI_API_KEY") or "").strip()
            elif field == "supabase_service_role_key":
                val = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
                if not val:
                    val = (os.getenv("SUPABASE_ANON_KEY") or "").strip()
            elif field == "supabase_anon_key":
                val = (os.getenv("SUPABASE_ANON_KEY") or "").strip()
            elif field == "pierre_api_key":
                val = (os.getenv("PIERRE_API_KEY") or "").strip()
            else:
                await sio.emit(
                    "setting_secret_revealed",
                    {"ok": False, "field": field, "value": "", "message": "Campo não suportado."},
                    room=sid,
                )
                return
            await sio.emit(
                "setting_secret_revealed",
                {"ok": True, "field": field, "value": val, "message": ""},
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] reveal_setting_secret: {e!r}")
            await sio.emit(
                "setting_secret_revealed",
                {
                    "ok": False,
                    "field": str((data or {}).get("field") or ""),
                    "value": "",
                    "message": str(e)[:500],
                },
                room=sid,
            )

    @sio.event
    async def test_integrations(sid, data=None):
        """Ping Supabase, ComfyUI, webhooks e Ollama (/api/tags). Logs: ORBITAL_INTEGRATION_TEST_LOG=1."""
        await emit_integration_tests_for_client(sio, sid)

    @sio.event
    async def update_settings(sid, data):
        print(f"Updating settings: {data}")
        keys = list(data.keys()) if isinstance(data, dict) else []
        await emit_runtime_log(
            "debug",
            f"update_settings keys={keys}",
            source="settings",
            room=sid,
        )

        if "tool_permissions" in data:
            SETTINGS["tool_permissions"].update(data["tool_permissions"])
            if st.audio_loop:
                st.audio_loop.update_permissions(SETTINGS["tool_permissions"])

        if "face_auth_enabled" in data:
            SETTINGS["face_auth_enabled"] = data["face_auth_enabled"]
            if not data["face_auth_enabled"]:
                await sio.emit("auth_status", {"authenticated": True})
                if st.authenticator:
                    st.authenticator.stop()

        if "camera_flipped" in data:
            SETTINGS["camera_flipped"] = data["camera_flipped"]
            print(f"[SERVER] Camera flip set to: {data['camera_flipped']}")

        if "semantic_search_enabled" in data:
            SETTINGS["semantic_search_enabled"] = bool(data["semantic_search_enabled"])
        if "semantic_embed_index" in data:
            SETTINGS["semantic_embed_index"] = bool(data["semantic_embed_index"])
        if "semantic_embed_senders" in data:
            s = str(data["semantic_embed_senders"] or "").strip()
            SETTINGS["semantic_embed_senders"] = s or "User, ATHENAS"
        if "chat_startup_context_limit" in data:
            try:
                SETTINGS["chat_startup_context_limit"] = max(
                    10, min(500, int(data["chat_startup_context_limit"]))
                )
            except (TypeError, ValueError):
                pass
        if "semantic_embed_min_length" in data:
            try:
                SETTINGS["semantic_embed_min_length"] = max(
                    0, min(500, int(data["semantic_embed_min_length"]))
                )
            except (TypeError, ValueError):
                pass
        if "semantic_embed_max_chars" in data:
            try:
                SETTINGS["semantic_embed_max_chars"] = max(
                    200, min(8000, int(data["semantic_embed_max_chars"]))
                )
            except (TypeError, ValueError):
                pass
        if "memory_remote_selective" in data:
            SETTINGS["memory_remote_selective"] = bool(data["memory_remote_selective"])
        if "memory_full_remote" in data:
            SETTINGS["memory_full_remote"] = bool(data["memory_full_remote"])
        if "memory_ollama_gate_enabled" in data:
            SETTINGS["memory_ollama_gate_enabled"] = bool(data["memory_ollama_gate_enabled"])
        if "memory_gemini_gate_enabled" in data:
            SETTINGS["memory_gemini_gate_enabled"] = bool(data["memory_gemini_gate_enabled"])
        if "memory_gate_model" in data:
            SETTINGS["memory_gate_model"] = str(data.get("memory_gate_model") or "").strip()
        if "memory_ollama_model" in data:
            SETTINGS["memory_ollama_model"] = str(data.get("memory_ollama_model") or "").strip()
        if "memory_ollama_url" in data:
            SETTINGS["memory_ollama_url"] = str(data.get("memory_ollama_url") or "").strip()
        if "memory_gate_retries" in data:
            try:
                SETTINGS["memory_gate_retries"] = max(
                    1, min(5, int(data["memory_gate_retries"]))
                )
            except (TypeError, ValueError):
                pass
        if "memory_gate_timeout_sec" in data:
            try:
                SETTINGS["memory_gate_timeout_sec"] = max(
                    3.0, min(120.0, float(data["memory_gate_timeout_sec"]))
                )
            except (TypeError, ValueError):
                pass
        if "memory_salience_debug" in data:
            SETTINGS["memory_salience_debug"] = bool(data["memory_salience_debug"])

        save_settings()
        await emit_full_settings()

    @sio.event
    async def add_launch_app(sid, data):
        try:
            if not isinstance(data, dict):
                await sio.emit(
                    "launch_app_add_result",
                    {"ok": False, "message": "Dados inválidos."},
                    room=sid,
                )
                return
            path = str(data.get("path", "") or "").strip()
            if not path:
                await sio.emit(
                    "launch_app_add_result",
                    {"ok": False, "message": "Selecione um executável."},
                    room=sid,
                )
                return
            app_id = data.get("id") or data.get("app_id")
            if isinstance(app_id, str) and not app_id.strip():
                app_id = None
            label = data.get("label")
            if isinstance(label, str) and not label.strip():
                label = None
            desc = str(data.get("description", "") or "")
            ok, msg = add_launch_app_entry(path, app_id=app_id, label=label, description=desc)
            await sio.emit("launch_app_add_result", {"ok": ok, "message": msg}, room=sid)
            if ok:
                await emit_full_settings()
        except Exception as e:
            await sio.emit(
                "launch_app_add_result",
                {"ok": False, "message": repr(e)},
                room=sid,
            )

    @sio.event
    async def trigger_webhook(sid, data):
        try:
            if not isinstance(data, dict):
                await sio.emit(
                    "webhook_result",
                    {"ok": False, "error": "Invalid data"},
                    room=sid,
                )
                return
            hook_id = data.get("hook_id")
            payload = data.get("payload")
            if not hook_id:
                await sio.emit(
                    "webhook_result",
                    {"ok": False, "error": "hook_id required"},
                    room=sid,
                )
                return
            pl = normalize_trigger_webhook_payload(payload, data)
            cfg = load_webhooks_config()
            status, text = await fire_webhook_by_id(cfg, hook_id, pl)
            ok = 200 <= status < 300
            await sio.emit(
                "webhook_result",
                {"ok": ok, "status": status, "body": text[:2000]},
                room=sid,
            )
        except Exception as e:
            await sio.emit(
                "webhook_result",
                {"ok": False, "error": str(e)},
                room=sid,
            )

    @sio.event
    async def agenda_google_delete_event(sid, data=None):
        """UI: apaga evento no Google (id) após utilizador remover item com vínculo Google."""
        try:
            if not isinstance(data, dict):
                await sio.emit(
                    "agenda_google_delete_result",
                    {"ok": False, "message": "Dados inválidos."},
                    room=sid,
                )
                return
            eid = str(data.get("event_id") or "").strip()
            if not eid:
                await sio.emit(
                    "agenda_google_delete_result",
                    {"ok": False, "message": "event_id obrigatório."},
                    room=sid,
                )
                return
            ok, msg = await delete_google_calendar_event(eid)
            await sio.emit(
                "agenda_google_delete_result",
                {"ok": ok, "message": msg, "event_id": eid},
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] agenda_google_delete_event: {e!r}")
            await sio.emit(
                "agenda_google_delete_result",
                {"ok": False, "message": str(e)[:500]},
                room=sid,
            )

    @sio.event
    async def agenda_google_sync(sid, data=None):
        """UI agenda: pede eventos Google Calendar (n8n list) para um mês."""
        try:
            if not isinstance(data, dict):
                await sio.emit(
                    "agenda_google_sync_result",
                    {"ok": False, "events": [], "message": "Dados inválidos."},
                    room=sid,
                )
                return
            year = int(data.get("year", 0))
            month = int(data.get("month", 0))
            ok, events, msg = await fetch_google_agenda_events_month(year, month)
            await sio.emit(
                "agenda_google_sync_result",
                {"ok": ok, "events": events, "message": msg},
                room=sid,
            )
        except Exception as e:
            print(f"[SERVER] agenda_google_sync: {e!r}")
            await sio.emit(
                "agenda_google_sync_result",
                {"ok": False, "events": [], "message": str(e)[:500]},
                room=sid,
            )

    @sio.event
    async def get_tool_permissions(sid):
        await sio.emit("tool_permissions", SETTINGS["tool_permissions"])

    @sio.event
    async def update_tool_permissions(sid, data):
        print(f"Updating permissions (legacy event): {data}")
        SETTINGS["tool_permissions"].update(data)
        save_settings()
        if st.audio_loop:
            st.audio_loop.update_permissions(SETTINGS["tool_permissions"])
        await sio.emit("tool_permissions", SETTINGS["tool_permissions"])
