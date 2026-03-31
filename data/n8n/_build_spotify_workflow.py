"""Gera spotify_athena_workflow.json com nós NATIVOS Spotify + Switch."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
map_js = (ROOT / "map_action.js").read_text(encoding="utf-8")

# Switch em modo expression: índice -> nó Spotify correspondente
switch_output_expr = """={{ ({
  pause: 0,
  resume: 1,
  nextSong: 2,
  previousSong: 3,
  volume: 4,
  startMusic: 5,
})[$json.spotifyOp] ?? 6 }}"""

unsupported_js = """return [{
  json: {
    error: true,
    message: 'Acao nao suportada pelo no nativo Spotify no n8n (ex.: shuffle, repeat). '
      + 'Use outro fluxo com HTTP Request ou escolha: pause, play, resume, next, previous, volume, playlist.'
  }
}];"""

respond_body = """={{ JSON.stringify({
  ok: $json.error !== true,
  action: $('Map action').first().json.action,
  spotifyOp: $('Map action').first().json.spotifyOp,
  result: $json
}) }}"""

SPOTIFY_CRED = {"spotifyOAuth2Api": {"name": "Spotify account"}}

def spotify_node(_id: str, name: str, operation: str, position: list, extra: dict | None = None):
    p = {"resource": "player", "operation": operation}
    if extra:
        p.update(extra)
    return {
        "parameters": p,
        "id": _id,
        "name": name,
        "type": "n8n-nodes-base.spotify",
        "typeVersion": 1,
        "position": position,
        "credentials": SPOTIFY_CRED,
    }


nodes = [
    {
        "parameters": {
            "httpMethod": "POST",
            "path": "athena-spotify",
            "responseMode": "responseNode",
            "options": {},
        },
        "id": "wh-athena",
        "name": "Webhook ATHENA",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [0, 300],
        "webhookId": "athena-spotify",
    },
    {
        "parameters": {"mode": "runOnceForAllItems", "jsCode": map_js},
        "id": "code-map",
        "name": "Map action",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [220, 300],
    },
    {
        "parameters": {
            "mode": "expression",
            "numberOutputs": 7,
            "output": switch_output_expr,
        },
        "id": "switch-route",
        "name": "Route",
        "type": "n8n-nodes-base.switch",
        "typeVersion": 3.2,
        "position": [440, 300],
    },
    spotify_node("sp-pause", "Pause", "pause", [700, 0]),
    spotify_node("sp-resume", "Resume", "resume", [700, 120]),
    spotify_node("sp-next", "Next", "nextSong", [700, 240]),
    spotify_node("sp-prev", "Previous", "previousSong", [700, 360]),
    spotify_node(
        "sp-vol",
        "Volume",
        "volume",
        [700, 480],
        {
            "volumePercent": "={{ Number($json.body.volume_percent ?? $json.body.volume ?? 50) }}",
        },
    ),
    spotify_node(
        "sp-playlist",
        "Start playlist",
        "startMusic",
        [700, 600],
        {
            "id": "={{ $json.body.playlist_uri || $json.body.uri || $json.body.context_uri }}",
        },
    ),
    {
        "parameters": {"mode": "runOnceForAllItems", "jsCode": unsupported_js},
        "id": "code-bad",
        "name": "Unsupported action",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [700, 720],
    },
    {
        "parameters": {
            "respondWith": "json",
            "responseBody": respond_body,
            "options": {},
        },
        "id": "respond",
        "name": "Respond to Webhook",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.1,
        "position": [960, 300],
    },
]

connections = {
    "Webhook ATHENA": {"main": [[{"node": "Map action", "type": "main", "index": 0}]]},
    "Map action": {"main": [[{"node": "Route", "type": "main", "index": 0}]]},
    "Route": {
        "main": [
            [{"node": "Pause", "type": "main", "index": 0}],
            [{"node": "Resume", "type": "main", "index": 0}],
            [{"node": "Next", "type": "main", "index": 0}],
            [{"node": "Previous", "type": "main", "index": 0}],
            [{"node": "Volume", "type": "main", "index": 0}],
            [{"node": "Start playlist", "type": "main", "index": 0}],
            [{"node": "Unsupported action", "type": "main", "index": 0}],
        ]
    },
    "Pause": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
    "Resume": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
    "Next": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
    "Previous": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
    "Volume": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
    "Start playlist": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
    "Unsupported action": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
}

wf = {
    "name": "ATHENA Spotify Control",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
    "staticData": None,
    "meta": {"templateCredsSetupCompleted": False},
    "tags": [],
}

(ROOT / "spotify_athena_workflow.json").write_text(
    json.dumps(wf, indent=2, ensure_ascii=False), encoding="utf-8"
)
print("Wrote spotify_athena_workflow.json (native Spotify nodes)")
