"""Formatação consistente do retorno da tool `trigger_webhook` / calendar webhook para o modelo."""
from __future__ import annotations

import json


def format_webhook_tool_result(
    hook_id: str,
    status: int,
    text: str,
    *,
    integration_hint: str | None = None,
) -> str:
    """
    Retorno explícito: [SUCCESS] / [FAILED], com snippet do corpo para o modelo não «alucinar».
    """
    snippet = (text or "").strip()[:1200]
    if status <= 0:
        http_ok = False
    else:
        http_ok = 200 <= status < 300

    n8n_ok: bool | None = None
    if snippet:
        try:
            parsed = json.loads(snippet)
            if isinstance(parsed, dict) and "ok" in parsed:
                raw_ok = parsed.get("ok")
                if isinstance(raw_ok, str):
                    n8n_ok = raw_ok.strip().lower() in ("1", "true", "yes")
                else:
                    n8n_ok = bool(raw_ok)
        except json.JSONDecodeError:
            pass

    if not http_ok:
        tag = "[FAILED]"
    elif n8n_ok is False:
        tag = "[FAILED]"
    else:
        tag = "[SUCCESS]"

    if integration_hint == "spotify":
        hint = (
            "Spotify needs Premium + app open + active device. "
            "Transient 502/429 errors are retried automatically."
        )
    elif integration_hint == "google_calendar":
        hint = (
            "Google Calendar via n8n needs the workflow active and OAuth credentials; "
            "if it failed, check n8n execution logs."
        )
    else:
        hint = ""

    hint_part = f"{hint} " if hint else ""
    return (
        f"{tag} webhook={hook_id!r} http_status={status}. "
        f"{hint_part}"
        f"n8n_body_snippet={snippet!r}"
    )
