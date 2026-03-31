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
        "for Spotify, ClickUp, Google Calendar. Optional payload merges into JSON body."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "hook_id": {
                "type": "STRING",
                "description": "Hook id from config/webhooks.json (e.g. athena-spotify).",
            },
            "payload": {
                "type": "OBJECT",
                "description": (
                    "Merged into the webhook JSON body after hook defaults. For Spotify/n8n ALWAYS set "
                    '`action` (e.g. volume, next, pause) AND any fields (e.g. {"action":"volume","volume_percent":50}). '
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
        "Searches persisted chat history: semantic similarity first, then full-text, then substring. "
        "Use when Leo asks if you remember discussing a topic; natural language or keywords both work."
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

tools_list = [{"function_declarations": [
    write_file_tool,
    read_directory_tool,
    read_file_tool,
    list_launch_apps_tool,
    launch_app_tool,
    trigger_webhook_tool,
    search_chat_history_tool,
]}]


