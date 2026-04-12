write_file_tool = {
    "name": "write_file",
    "description": "Writes content to a file at the specified path. Overwrites if exists.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "path": {
                "type": "STRING",
                "description": "The path of the file to write to."
            },
            "content": {
                "type": "STRING",
                "description": "The content to write to the file."
            }
        },
        "required": ["path", "content"]
    }
}

read_directory_tool = {
    "name": "read_directory",
    "description": "Lists the contents of a directory.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "path": {
                "type": "STRING",
                "description": "The path of the directory to list."
            }
        },
        "required": ["path"]
    }
}

read_file_tool = {
    "name": "read_file",
    "description": "Reads the content of a file.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "path": {
                "type": "STRING",
                "description": "The path of the file to read."
            }
        },
        "required": ["path"]
    }
}

list_launch_apps_tool = {
    "name": "list_launch_apps",
    "description": (
        "Lista aplicativos locais permitidos (whitelist em config/launch_apps.json). "
        "Chame antes de launch_app para saber os app_id válidos."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {},
    },
}

launch_app_tool = {
    "name": "launch_app",
    "description": (
        "Abre um programa neste PC somente se estiver cadastrado em config/launch_apps.json. "
        "Sempre use list_launch_apps primeiro; use exatamente um app_id retornado."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "app_id": {
                "type": "STRING",
                "description": "Id da whitelist (ex.: notepad), vindo de list_launch_apps.",
            }
        },
        "required": ["app_id"],
    },
}

trigger_webhook_tool = {
    "name": "trigger_webhook",
    "description": (
        "Calls a configured HTTP webhook by id (see config/webhooks.json), e.g. n8n automations "
        "for Spotify, ClickUp, Google Calendar. Optional payload merges into JSON body. "
        "Spotify hook `athena-spotify`: payload.action may be pause, play, resume, next, previous, volume, "
        "list_playlists ( Lista playlists do usuário no Spotify; resposta JSON com playlists ), "
        "switch_playlist / play_playlist + playlist_uri, "
        "play_track + track_name ou track_uri (+ artist opcional), play_genre + genre. "
        "Perguntas tipo 'quais playlists' → list_playlists. "
        "Google Calendar hook `athena-google-calendar`: use calendar_op `create` (default; title, starts_at_iso, …), "
        "`delete` (event_id), or `list` (optional time_min/time_max ISO; default próximos 7 dias)."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "hook_id": {
                "type": "STRING",
                "description": "Hook id from config/webhooks.json (e.g. athena-spotify, athena-google-calendar).",
            },
            "payload": {
                "type": "OBJECT",
                "description": (
                    "Merged into the webhook JSON body after hook defaults. For Spotify (`athena-spotify`) set "
                    '`action` (pause, play, resume, next, previous, volume, list_playlists, switch_playlist, play_track, play_genre, playlist) '
                    "and fields like volume_percent, playlist_uri, track_name, artist, genre. "
                    "If you omit action but send volume_percent/volume, action is assumed to be volume."
                ),
            },
        },
        "required": ["hook_id"],
    },
}

search_chat_history_tool = {
    "name": "search_chat_history",
    "description": (
        "Searches chat history: semantic cloud recall plus keyword scan of the full local transcript. "
        "Use when Leo asks if you remember a topic; natural language or keywords both work."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "query": {
                "type": "STRING",
                "description": "Keyword or short phrase to search for (e.g. 'c#', 'supabase').",
            },
            "limit": {
                "type": "NUMBER",
                "description": "Maximum number of matching messages to return (1-20).",
            },
        },
        "required": ["query"],
    },
}

start_timer_tool = {
    "name": "start_timer",
    "description": (
        "Starts a visible countdown timer in Leo's OrbitalSync UI. Use when he asks for a timer, "
        "stopwatch-style wait, reminder after X minutes, or cooking/exercise intervals. "
        "Always pass duration in seconds (e.g. 5 minutes → 300, 90 seconds → 90). "
        "After calling: your next spoken output must be ONE brief acknowledgment in Portuguese only "
        "(e.g. 'Combinado, Leo' or 'Vou contando.')—do not restate the duration, do not say both "
        "'iniciando' and 'iniciado', and do not say time is up until a later system message tells you the timer ended."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "duration_seconds": {
                "type": "NUMBER",
                "description": "Total duration in seconds (1–7200). Example: 120 for 2 minutes.",
            },
            "label": {
                "type": "STRING",
                "description": "Optional short label shown on the UI (e.g. 'Coffee break', 'Stretch').",
            },
        },
        "required": ["duration_seconds"],
    },
}

add_calendar_reminder_tool = {
    "name": "add_calendar_reminder",
    "description": (
        "Adds a fixed date/time entry to Leo's OrbitalSync agenda UI AND syncs to Google Calendar via n8n "
        "(webhook id athena-google-calendar in webhooks.json), when that hook is configured. "
        "Not for short relative waits—use start_timer for 'in 5 minutes'. "
        "Required: title, starts_at_iso (ISO 8601 with offset; Brazil often -03:00). "
        "Optional: ends_at_iso (end of event; if omitted, n8n defaults to ~30 minutes after start), notes (description). "
        "Wait for the tool result: if the n8n line shows [FAILED], say so honestly (OAuth, workflow inactive, etc.). "
        "After clear success: ONE short Portuguese acknowledgment."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "title": {
                "type": "STRING",
                "description": "Short label for the calendar (e.g. Dentista, Reunião equipe).",
            },
            "starts_at_iso": {
                "type": "STRING",
                "description": (
                    "Instant in ISO 8601 with offset, e.g. 2026-04-02T15:00:00-03:00. "
                    "If Leo gives only a date, assume a sensible hour (e.g. 09:00) and state it briefly when speaking."
                ),
            },
            "ends_at_iso": {
                "type": "STRING",
                "description": (
                    "Optional end time ISO 8601 with the same timezone rules as starts_at_iso. "
                    "Example: 2026-04-02T15:30:00-03:00. Omit to let n8n use default duration."
                ),
            },
            "notes": {
                "type": "STRING",
                "description": "Optional description for the calendar event (e.g. 'Criado pela ATHENAS').",
            },
        },
        "required": ["title", "starts_at_iso"],
    },
}

remove_calendar_reminder_tool = {
    "name": "remove_calendar_reminder",
    "description": (
        "Apaga um evento no Google Calendar (n8n athena-google-calendar). "
        "Preferir google_event_id (vem em data.id ao criar ou ao listar). "
        "Se Leo não tiver o id, use title + starts_at_iso para localizar no mês certo (correspondência ±2h). "
        "Aguarde o resultado antes de dizer que apagou."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "google_event_id": {
                "type": "STRING",
                "description": "Id do evento no Google (campo id / data.id).",
            },
            "title": {
                "type": "STRING",
                "description": "Título para busca quando google_event_id não está disponível.",
            },
            "starts_at_iso": {
                "type": "STRING",
                "description": "Data/hora ISO com fuso; obrigatório junto com title se não houver google_event_id.",
            },
        },
        "required": [],
    },
}

read_brain_tool = {
    "name": "read_brain",
    "description": (
        "Reads a note from your persistent brain/memory vault (Obsidian). "
        "Returns the note content with resolved wikilinks showing connected notes. "
        "Use section/Note_name format (no .md extension needed)."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "note": {
                "type": "STRING",
                "description": (
                    "Note path relative to vault: 'section/Note_name' "
                    "(e.g. '00 - Core/Identidade', '06 - State/Contexto_atual')."
                ),
            }
        },
        "required": ["note"],
    },
}

write_brain_tool = {
    "name": "write_brain",
    "description": (
        "Writes or updates a note in your brain vault. Use 'append' to add info (logs, learnings, preferences). "
        "Use 'overwrite' to replace state (current context, active tasks). "
        "If the note doesn't exist, it will be created automatically. "
        "Cannot write to read-only sections (00-Core, 02-Skills, 03-Thinking, 08-System)."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "note": {
                "type": "STRING",
                "description": "Note path: 'section/Note_name' (e.g. '01 - Memoria/Aprendizados').",
            },
            "content": {
                "type": "STRING",
                "description": "Markdown content. Include [[wikilinks]] to connect to related notes.",
            },
            "mode": {
                "type": "STRING",
                "description": "Write mode: 'append' adds to end, 'overwrite' replaces all content.",
                "enum": ["overwrite", "append"],
            },
        },
        "required": ["note", "content"],
    },
}

search_brain_tool = {
    "name": "search_brain",
    "description": (
        "Searches across ALL notes in your brain vault. "
        "mode 'keyword' = exact substring (default). "
        "mode 'semantic' = meaning similarity (embeddings + Supabase). "
        "mode 'hybrid' = run semantic + keyword together (dedupe overlap); best when unsure. "
        "Requires Gemini + Supabase brain index for semantic/hybrid semantic half."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "query": {
                "type": "STRING",
                "description": "Search query: keyword, phrase, or topic to find across all brain notes.",
            },
            "mode": {
                "type": "STRING",
                "description": "keyword | semantic | hybrid (semantic + literal substring, deduped).",
                "enum": ["keyword", "semantic", "hybrid"],
            },
        },
        "required": ["query"],
    },
}

list_brain_tool = {
    "name": "list_brain",
    "description": (
        "Lists sections and notes in your brain vault. "
        "Use to discover what knowledge is available or check a section's contents before reading/writing."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "section": {
                "type": "STRING",
                "description": "Optional: specific section (e.g. '01 - Memoria'). Omit to list all sections with their notes.",
            }
        },
    },
}

tools_list = [{"function_declarations": [
    write_file_tool,
    read_directory_tool,
    read_file_tool,
    list_launch_apps_tool,
    launch_app_tool,
    trigger_webhook_tool,
    search_chat_history_tool,
    start_timer_tool,
    add_calendar_reminder_tool,
    remove_calendar_reminder_tool,
    read_brain_tool,
    write_brain_tool,
    search_brain_tool,
    list_brain_tool,
]}]


