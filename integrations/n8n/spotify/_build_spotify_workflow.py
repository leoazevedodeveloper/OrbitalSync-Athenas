"""Gera spotify_athena_workflow.json nesta pasta (nós nativos Spotify + Switch)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
map_js = (ROOT / "map_action.js").read_text(encoding="utf-8")

switch_output_expr = """={{ ({
  pause: 0,
  resume: 1,
  nextSong: 2,
  previousSong: 3,
  volume: 4,
  startMusic: 5,
  listPlaylists: 6,
  switchPlaylist: 7,
  playTrack: 8,
  playGenre: 9,
  healthcheck: 10,
})[$json.spotifyOp] ?? 11 }}"""

unsupported_js = """return [{
  json: {
    error: true,
    message: 'Acao nao suportada pelo no nativo Spotify no n8n (ex.: shuffle, repeat). '
      + 'Use outro fluxo com HTTP Request ou escolha: pause, play, resume, next, previous, volume, playlist, '
      + 'list_playlists, switch_playlist, play_track, play_genre.'
  }
}];"""

respond_body = """={{ JSON.stringify({
  ok: $json.error !== true,
  action: $('Map action').first().json.action,
  spotifyOp: $('Map action').first().json.spotifyOp,
  result: $json
}) }}"""

SPOTIFY_CRED = {"spotifyOAuth2Api": {"name": "Spotify account"}}

PICK_DEVICE_JS = r"""const root = $input.first().json || {};
const devices = root.devices || root.body?.devices || [];
if (!devices.length) {
  return [{
    json: {
      error: true,
      message:
        'Nenhum dispositivo Spotify disponivel. Abra o app Spotify no celular, PC ou Web Player '
        + '(play.spotify.com) e faca login nesta mesma conta; depois tente de novo.'
    }
  }];
}
const usable = devices.filter((d) => d && d.id && !d.is_restricted);
if (!usable.length) {
  return [{ json: { error: true, message: 'Dispositivos encontrados, mas nenhum permite reproducao.' } }];
}
const score = (d) => {
  const t = String(d.type || '').toLowerCase();
  if (t === 'computer') return 0;
  if (t === 'smartphone') return 1;
  if (t === 'tablet') return 2;
  return 5;
};
usable.sort((a, b) => score(a) - score(b));
const active = usable.find((d) => d.is_active);
const pick = active || usable[0];
return [{
  json: {
    deviceId: pick.id,
    deviceName: pick.name || '',
    deviceType: pick.type || ''
  }
}];"""

MERGE_CTX_PLAYTRACK_JS = r"""const prev = $('Pick track URI').first().json || {};
const dev = $input.first().json || {};
return [{ json: { ...prev, ...dev, trackUri: prev.trackUri } }];"""


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


def http_devices_node(_id: str, name: str, pos: list) -> dict:
    return {
        "parameters": {
            "method": "GET",
            "url": "https://api.spotify.com/v1/me/player/devices",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "spotifyOAuth2Api",
            "options": {},
        },
        "id": _id,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": pos,
        "credentials": SPOTIFY_CRED,
    }


def http_transfer_node(_id: str, name: str, pos: list) -> dict:
    return {
        "parameters": {
            "method": "PUT",
            "url": "https://api.spotify.com/v1/me/player",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "spotifyOAuth2Api",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify({ device_ids: [$json.deviceId], play: false }) }}",
            "options": {},
        },
        "id": _id,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": pos,
        "credentials": SPOTIFY_CRED,
    }


def code_pick_device_node(_id: str, name: str, pos: list) -> dict:
    return {
        "parameters": {"mode": "runOnceForAllItems", "jsCode": PICK_DEVICE_JS},
        "id": _id,
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": pos,
    }


def switch_device_ok_node(_id: str, name: str, pos: list) -> dict:
    return {
        "parameters": {
            "mode": "expression",
            "numberOutputs": 2,
            "output": "={{ $json.error === true ? 1 : 0 }}",
        },
        "id": _id,
        "name": name,
        "type": "n8n-nodes-base.switch",
        "typeVersion": 3.2,
        "position": pos,
    }


def make_ensure_chain(suffix: str, y: int, x0: int = 520) -> tuple[list[dict], dict[str, str]]:
    names = {
        "get": f"Get devices · {suffix}",
        "pick": f"Pick device · {suffix}",
        "sw": f"Device ok · {suffix}",
        "xfer": f"Transfer · {suffix}",
    }
    ids = {
        "get": f"http-dev-{suffix}",
        "pick": f"code-dev-{suffix}",
        "sw": f"sw-dev-{suffix}",
        "xfer": f"http-xfer-{suffix}",
    }
    chain = [
        http_devices_node(ids["get"], names["get"], [x0, y]),
        code_pick_device_node(ids["pick"], names["pick"], [x0 + 130, y]),
        switch_device_ok_node(ids["sw"], names["sw"], [x0 + 260, y]),
        http_transfer_node(ids["xfer"], names["xfer"], [x0 + 390, y]),
    ]
    return chain, names


ENSURE_ROWS: list[tuple[str, int]] = [
    ("resume", 120),
    ("next", 240),
    ("prev", 360),
    ("vol", 480),
    ("startpl", 600),
    ("switchpl", 840),
    ("genre", 1080),
]

ENSURE_TARGETS: dict[str, str] = {
    "resume": "Resume",
    "next": "Next",
    "prev": "Previous",
    "vol": "Volume",
    "startpl": "Start playlist",
    "switchpl": "Switch playlist",
    "genre": "Play genre",
}

ensure_nodes: list[dict] = []
ensure_meta: list[tuple[dict[str, str], str]] = []
for suf, y in ENSURE_ROWS:
    chain, names = make_ensure_chain(suf, y)
    ensure_nodes.extend(chain)
    ensure_meta.append((names, ENSURE_TARGETS[suf]))

playtr_chain, playtr_names = make_ensure_chain("playtr", 960, x0=1180)
ensure_nodes.extend(playtr_chain)

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
            "numberOutputs": 12,
            "output": switch_output_expr,
        },
        "id": "switch-route",
        "name": "Route",
        "type": "n8n-nodes-base.switch",
        "typeVersion": 3.2,
        "position": [440, 300],
    },
    spotify_node("sp-pause", "Pause", "pause", [1080, 0]),
    spotify_node("sp-resume", "Resume", "resume", [1080, 120]),
    spotify_node("sp-next", "Next", "nextSong", [1080, 240]),
    spotify_node("sp-prev", "Previous", "previousSong", [1080, 360]),
    spotify_node(
        "sp-vol",
        "Volume",
        "volume",
        [1080, 480],
        {
            "volumePercent": "={{ Number($json.body.volume_percent ?? $json.body.volume ?? 50) }}",
        },
    ),
    spotify_node(
        "sp-playlist",
        "Start playlist",
        "startMusic",
        [1080, 600],
        {
            "id": "={{ $json.body.playlist_uri || $json.body.uri || $json.body.context_uri }}",
        },
    ),
    {
        "parameters": {
            "resource": "playlist",
            "operation": "getUserPlaylists",
            "returnAll": True,
        },
        "id": "sp-list-playlists",
        "name": "List playlists",
        "type": "n8n-nodes-base.spotify",
        "typeVersion": 1,
        "position": [700, 720],
        "credentials": SPOTIFY_CRED,
    },
    {
        "parameters": {
            "mode": "runOnceForAllItems",
            "jsCode": """const items = $input.all().map(i => i.json || {});
const playlists = items.map((p) => ({
  id: p.id,
  uri: p.uri,
  name: p.name,
  owner: p.owner?.display_name || p.owner?.id || null,
  tracks: p.tracks?.total ?? null,
  public: p.public ?? null,
}));
return [{ json: { playlists, total: playlists.length } }];""",
        },
        "id": "code-format-playlists",
        "name": "Format playlists",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [900, 720],
    },
    spotify_node(
        "sp-switch-playlist",
        "Switch playlist",
        "startMusic",
        [1080, 840],
        {
            "id": "={{ $json.body.playlist_uri || $json.body.uri || $json.body.context_uri || $json.body.playlist_id }}",
        },
    ),
    {
        "parameters": {
            "mode": "runOnceForAllItems",
            "jsCode": """const body = $json.body || {};
const rawAction = String($json.action || '').trim();
const normalizedAction = String($json.normalizedAction || '').trim();

const directUri = body.track_uri || body.uri || body.track_id || null;
if (directUri) {
  return [{ json: { ...$json, trackUri: directUri, trackQuery: null } }];
}

let q =
  body.track_query ||
  body.track_name ||
  body.track ||
  body.song ||
  body.music ||
  body.query ||
  '';

if (!q && (rawAction || normalizedAction)) {
  const source = normalizedAction || rawAction.toLowerCase();
  q = source
    .replace(/^tocar?_?musica_?/i, '')
    .replace(/^play_?track_?/i, '')
    .replace(/^toca_?/i, '')
    .replace(/^play_?/i, '')
    .replace(/_?pfv$/i, '')
    .replace(/_?por_favor$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

const artist = String(body.artist || body.artista || '').trim();

if (!q && !artist) {
  return [{ json: { error: true, message: 'Para tocar música específica, envie track_uri/track_id ou track_name ou artist.' } }];
}

let trackQuery;
if (!q && artist) {
  trackQuery = `artist:${artist}`;
} else if (q && artist) {
  trackQuery = `track:${q} artist:${artist}`;
} else {
  trackQuery = q;
}
return [{ json: { ...$json, trackQuery } }];""",
        },
        "id": "code-resolve-track",
        "name": "Resolve track input",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [700, 960],
    },
    {
        "parameters": {
            "resource": "track",
            "operation": "search",
            "query": "={{ $json.trackQuery }}",
            "returnAll": False,
            "limit": 1,
        },
        "id": "sp-search-track",
        "name": "Search track",
        "type": "n8n-nodes-base.spotify",
        "typeVersion": 1,
        "position": [860, 960],
        "credentials": SPOTIFY_CRED,
    },
    {
        "parameters": {
            "mode": "runOnceForAllItems",
            "jsCode": """const inItem = $input.first().json || {};
if (inItem.error) return [{ json: inItem }];

const uri = inItem.uri || null;
if (!uri) {
  return [{ json: { error: true, message: `Nao encontrei faixa para: ${$json.trackQuery || 'consulta vazia'}` } }];
}

return [{ json: { ...$json, trackUri: uri, matchedTrack: inItem.name || null, matchedArtist: inItem.artists?.[0]?.name || null } }];""",
        },
        "id": "code-pick-track-uri",
        "name": "Pick track URI",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1020, 960],
    },
    {
        "parameters": {
            "mode": "expression",
            "numberOutputs": 2,
            "output": "={{ $json.error === true ? 1 : 0 }}",
        },
        "id": "sw-track-resolved",
        "name": "Track resolved?",
        "type": "n8n-nodes-base.switch",
        "typeVersion": 3.2,
        "position": [1140, 960],
    },
    {
        "parameters": {"mode": "runOnceForAllItems", "jsCode": MERGE_CTX_PLAYTRACK_JS},
        "id": "code-merge-playtr",
        "name": "Restore track after transfer",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [1840, 960],
    },
    spotify_node(
        "sp-queue-track",
        "Queue track",
        "addSongToQueue",
        [2000, 960],
        {
            "id": "={{ $json.trackUri }}",
        },
    ),
    spotify_node("sp-play-queued", "Play queued track", "nextSong", [2160, 960]),
    {
        "parameters": {
            "mode": "runOnceForAllItems",
            "jsCode": """const body = $json.body || {};
const raw = String(body.genre || body.genero || '').trim().toLowerCase();
const byGenre = {
  pop: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
  rock: 'spotify:playlist:37i9dQZF1DWXRqgorJj26U',
  jazz: 'spotify:playlist:37i9dQZF1DXbITWG1ZJKYt',
  lofi: 'spotify:playlist:37i9dQZF1DXdxcBWuJkbcy',
  'lo-fi': 'spotify:playlist:37i9dQZF1DXdxcBWuJkbcy',
  eletronic: 'spotify:playlist:37i9dQZF1DX4dyzvuaRJ0n',
  eletrônica: 'spotify:playlist:37i9dQZF1DX4dyzvuaRJ0n',
  electronic: 'spotify:playlist:37i9dQZF1DX4dyzvuaRJ0n',
  funk: 'spotify:playlist:37i9dQZF1DXaXB8fQg7xif',
  rap: 'spotify:playlist:37i9dQZF1DX0XUsuxWHRQd',
  hiphop: 'spotify:playlist:37i9dQZF1DX0XUsuxWHRQd',
  hip_hop: 'spotify:playlist:37i9dQZF1DX0XUsuxWHRQd',
  classica: 'spotify:playlist:37i9dQZF1DWWEJlAGA9gs0',
  clássica: 'spotify:playlist:37i9dQZF1DWWEJlAGA9gs0',
  classical: 'spotify:playlist:37i9dQZF1DWWEJlAGA9gs0',
};
const genreUri = byGenre[raw] || body.playlist_uri || body.uri || null;
if (!genreUri) {
  return [{ json: { error: true, message: 'Genero nao reconhecido. Envie genre ou playlist_uri.' } }];
}
return [{ json: { ...$json, genreUri } }];""",
        },
        "id": "code-genre-map",
        "name": "Genre to playlist",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [700, 1080],
    },
    spotify_node(
        "sp-play-genre",
        "Play genre",
        "startMusic",
        [1080, 1080],
        {"id": "={{ $json.genreUri }}"},
    ),
    {
        "parameters": {
            "mode": "runOnceForAllItems",
            "jsCode": """return [{ json: { ok: true, probe: true, message: 'Spotify webhook online' } }];""",
        },
        "id": "code-probe-ok",
        "name": "Connectivity probe ok",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [700, 1140],
    },
    {
        "parameters": {"mode": "runOnceForAllItems", "jsCode": unsupported_js},
        "id": "code-bad",
        "name": "Unsupported action",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [700, 1260],
    },
    *ensure_nodes,
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
        "position": [1280, 300],
    },
]

connections: dict = {
    "Webhook ATHENA": {"main": [[{"node": "Map action", "type": "main", "index": 0}]]},
    "Map action": {"main": [[{"node": "Route", "type": "main", "index": 0}]]},
    "Route": {
        "main": [
            [{"node": "Pause", "type": "main", "index": 0}],
            [{"node": "Get devices · resume", "type": "main", "index": 0}],
            [{"node": "Get devices · next", "type": "main", "index": 0}],
            [{"node": "Get devices · prev", "type": "main", "index": 0}],
            [{"node": "Get devices · vol", "type": "main", "index": 0}],
            [{"node": "Get devices · startpl", "type": "main", "index": 0}],
            [{"node": "List playlists", "type": "main", "index": 0}],
            [{"node": "Get devices · switchpl", "type": "main", "index": 0}],
            [{"node": "Resolve track input", "type": "main", "index": 0}],
            [{"node": "Genre to playlist", "type": "main", "index": 0}],
            [{"node": "Connectivity probe ok", "type": "main", "index": 0}],
            [{"node": "Unsupported action", "type": "main", "index": 0}],
        ]
    },
    "Pause": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
    "List playlists": {"main": [[{"node": "Format playlists", "type": "main", "index": 0}]]},
    "Format playlists": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
    "Resolve track input": {"main": [[{"node": "Search track", "type": "main", "index": 0}]]},
    "Search track": {"main": [[{"node": "Pick track URI", "type": "main", "index": 0}]]},
    "Pick track URI": {"main": [[{"node": "Track resolved?", "type": "main", "index": 0}]]},
    "Track resolved?": {
        "main": [
            [{"node": "Get devices · playtr", "type": "main", "index": 0}],
            [{"node": "Respond to Webhook", "type": "main", "index": 0}],
        ]
    },
    "Restore track after transfer": {"main": [[{"node": "Queue track", "type": "main", "index": 0}]]},
    "Queue track": {"main": [[{"node": "Play queued track", "type": "main", "index": 0}]]},
    "Play queued track": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
    "Genre to playlist": {"main": [[{"node": "Get devices · genre", "type": "main", "index": 0}]]},
    "Connectivity probe ok": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
    "Unsupported action": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]},
}

for names, target in ensure_meta:
    g, p, s, x = names["get"], names["pick"], names["sw"], names["xfer"]
    connections[g] = {"main": [[{"node": p, "type": "main", "index": 0}]]}
    connections[p] = {"main": [[{"node": s, "type": "main", "index": 0}]]}
    connections[s] = {
        "main": [
            [{"node": x, "type": "main", "index": 0}],
            [{"node": "Respond to Webhook", "type": "main", "index": 0}],
        ]
    }
    connections[x] = {"main": [[{"node": target, "type": "main", "index": 0}]]}

pg, pp, ps, px = playtr_names["get"], playtr_names["pick"], playtr_names["sw"], playtr_names["xfer"]
connections[pg] = {"main": [[{"node": pp, "type": "main", "index": 0}]]}
connections[pp] = {"main": [[{"node": ps, "type": "main", "index": 0}]]}
connections[ps] = {
    "main": [
        [{"node": px, "type": "main", "index": 0}],
        [{"node": "Respond to Webhook", "type": "main", "index": 0}],
    ]
}
connections[px] = {"main": [[{"node": "Restore track after transfer", "type": "main", "index": 0}]]}

connections["Resume"] = {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
connections["Next"] = {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
connections["Previous"] = {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
connections["Volume"] = {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
connections["Start playlist"] = {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
connections["Switch playlist"] = {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
connections["Play genre"] = {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}

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
print("Wrote integrations/n8n/spotify/spotify_athena_workflow.json")
