"""Gera spotify_athena_workflow.json — v2.

Mudanças vs v1:
- Device chain centralizado (1x em vez de 7x duplicados)
- HTTP direto com device_id (elimina Transfer e race condition)
- playTrack via PUT /play com uris[] (sem hack queue + next)
- respond_body resiliente com try/catch
- ~28 nós (era ~50+)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
map_js = (ROOT / "map_action.js").read_text(encoding="utf-8")

SPOTIFY_CRED = {"spotifyOAuth2Api": {"name": "Spotify account"}}
API = "https://api.spotify.com/v1"

# n8n httpRequest: retorna {statusCode, body, headers} e não lança em 4xx/5xx
HTTP_OPTS: dict = {
    "response": {"response": {"fullResponse": True, "neverError": True}}
}


# ── Expression helper ──────────────────────────────────────────────


def n8n(js: str) -> str:
    """Gera expressão n8n: ={{ <js> }}"""
    return "={{ " + js + " }}"


# Referências reutilizadas nas expressões
_DEV = "$('Pick device').first().json.deviceId"
_MAP = "$('Map action').first().json"
_BODY = f"{_MAP}.body"


def _player_url(endpoint: str) -> str:
    """URL Spotify Player com device_id dinâmico."""
    return n8n(f"'{API}/me/player/{endpoint}?device_id=' + {_DEV}")


# ── Node constructors ─────────────────────────────────────────────


def _code(_id: str, name: str, pos: list, js: str) -> dict:
    return {
        "parameters": {"mode": "runOnceForAllItems", "jsCode": js},
        "id": _id,
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": pos,
    }


def _switch(_id: str, name: str, pos: list, n_out: int, expr: str) -> dict:
    return {
        "parameters": {
            "mode": "expression",
            "numberOutputs": n_out,
            "output": expr,
        },
        "id": _id,
        "name": name,
        "type": "n8n-nodes-base.switch",
        "typeVersion": 3.2,
        "position": pos,
    }


def _http(
    _id: str,
    name: str,
    pos: list,
    method: str,
    url: str,
    *,
    body_expr: str | None = None,
) -> dict:
    p: dict = {
        "method": method,
        "url": url,
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "spotifyOAuth2Api",
        "options": HTTP_OPTS,
    }
    if body_expr is not None:
        p.update(sendBody=True, specifyBody="json", jsonBody=body_expr)
    return {
        "parameters": p,
        "id": _id,
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": pos,
        "credentials": SPOTIFY_CRED,
    }


# ── JS code blocks ────────────────────────────────────────────────

PICK_DEVICE_JS = r"""const root = $input.first().json || {};
const raw = root.body || root;

// Detectar erro HTTP (modo fullResponse)
if (root.statusCode && root.statusCode >= 400) {
  const msg = (typeof raw === 'object' && raw !== null && raw.error && raw.error.message)
    ? raw.error.message
    : `Spotify API erro HTTP ${root.statusCode}`;
  return [{ json: { error: true, message: msg } }];
}

const devices = Array.isArray(raw) ? raw : (raw.devices || []);
if (!devices.length) {
  return [{ json: { error: true, message:
    'Nenhum dispositivo Spotify disponivel. Abra o app no celular, PC ou Web Player e tente novamente.' } }];
}
const usable = devices.filter(d => d && d.id && !d.is_restricted);
if (!usable.length) {
  return [{ json: { error: true, message: 'Dispositivos encontrados, mas nenhum permite reproducao.' } }];
}
const score = d => {
  if (d.is_active) return -10;
  const t = String(d.type || '').toLowerCase();
  return t === 'computer' ? 0 : t === 'smartphone' ? 1 : 5;
};
usable.sort((a, b) => score(a) - score(b));
const pick = usable[0];
return [{ json: { deviceId: pick.id, deviceName: pick.name || '', deviceType: pick.type || '' } }];"""

FORMAT_PL_JS = """const items = $input.all().map(i => i.json || {});
const playlists = items.map(p => ({
  id: p.id, uri: p.uri, name: p.name,
  owner: p.owner?.display_name || p.owner?.id || null,
  tracks: p.tracks?.total ?? null, public: p.public ?? null,
}));
return [{ json: { playlists, total: playlists.length } }];"""

PROBE_JS = (
    "return [{ json: { ok: true, probe: true,"
    " message: 'Spotify webhook online' } }];"
)

UNSUPPORTED_JS = (
    "return [{ json: { error: true, message: "
    "'Acao nao suportada. Use: pause, play, resume, next, previous, volume, "
    "list_playlists, switch_playlist, play_track, play_genre.' } }];"
)

RESOLVE_TRACK_JS = r"""const body = $('Map action').first().json.body || {};
const rawAction = String($('Map action').first().json.action || '').trim();
const normalizedAction = String($('Map action').first().json.normalizedAction || '').trim();

const directUri = body.track_uri || body.uri || body.track_id || null;
if (directUri) return [{ json: { trackUri: directUri } }];

let q = body.track_query || body.track_name || body.track
     || body.song || body.music || body.query || '';

if (!q && (rawAction || normalizedAction)) {
  const src = (normalizedAction || rawAction.toLowerCase())
    .replace(/^tocar?_?musica_?/i, '')
    .replace(/^play_?track_?/i, '')
    .replace(/^toca_?/i, '')
    .replace(/^play_?/i, '')
    .replace(/_?pfv$/i, '')
    .replace(/_?por_favor$/i, '')
    .replace(/_/g, ' ').trim();
  if (src) q = src;
}

const artist = String(body.artist || body.artista || '').trim();
if (!q && !artist) {
  return [{ json: { error: true, message:
    'Para tocar musica especifica, envie track_name, track_uri ou artist.' } }];
}

let trackQuery;
if (!q && artist) trackQuery = `artist:${artist}`;
else if (q && artist) trackQuery = `track:${q} artist:${artist}`;
else trackQuery = q;
return [{ json: { trackQuery } }];"""

PICK_URI_JS = r"""const item = $input.first().json || {};
if (item.error) return [{ json: item }];
const uri = item.uri || null;
if (!uri) {
  let q = '';
  try { q = $('Resolve track input').first().json.trackQuery || ''; } catch(e) {}
  return [{ json: { error: true, message: `Nao encontrei faixa para: ${q || 'consulta vazia'}` } }];
}
return [{ json: {
  trackUri: uri,
  matchedTrack: item.name || null,
  matchedArtist: item.artists?.[0]?.name || null
} }];"""

GENRE_JS = r"""const body = $('Map action').first().json.body || {};
const raw = String(body.genre || body.genero || '').trim().toLowerCase();
const map = {
  pop: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
  rock: 'spotify:playlist:37i9dQZF1DWXRqgorJj26U',
  jazz: 'spotify:playlist:37i9dQZF1DXbITWG1ZJKYt',
  lofi: 'spotify:playlist:37i9dQZF1DXdxcBWuJkbcy',
  'lo-fi': 'spotify:playlist:37i9dQZF1DXdxcBWuJkbcy',
  electronic: 'spotify:playlist:37i9dQZF1DX4dyzvuaRJ0n',
  eletronic: 'spotify:playlist:37i9dQZF1DX4dyzvuaRJ0n',
  eletronica: 'spotify:playlist:37i9dQZF1DX4dyzvuaRJ0n',
  'eletrônica': 'spotify:playlist:37i9dQZF1DX4dyzvuaRJ0n',
  funk: 'spotify:playlist:37i9dQZF1DXaXB8fQg7xif',
  rap: 'spotify:playlist:37i9dQZF1DX0XUsuxWHRQd',
  hiphop: 'spotify:playlist:37i9dQZF1DX0XUsuxWHRQd',
  hip_hop: 'spotify:playlist:37i9dQZF1DX0XUsuxWHRQd',
  classica: 'spotify:playlist:37i9dQZF1DWWEJlAGA9gs0',
  'clássica': 'spotify:playlist:37i9dQZF1DWWEJlAGA9gs0',
  classical: 'spotify:playlist:37i9dQZF1DWWEJlAGA9gs0',
};
const uri = map[raw] || body.playlist_uri || body.uri || null;
if (!uri) {
  return [{ json: { error: true, message: 'Genero nao reconhecido. Envie genre ou playlist_uri.' } }];
}
return [{ json: { genreUri: uri } }];"""

# ── Respond body expression (resiliente) ──────────────────────────

RESPOND_BODY = n8n(
    "(() => {"
    " let m = {};"
    " try { m = $('Map action').first().json || {}; } catch(e) {}"
    " const r = $json || {};"
    " const sc = r.statusCode;"
    " const ok = sc != null ? (sc >= 200 && sc < 300) : (r.error !== true);"
    " return JSON.stringify({ ok, action: m.action, spotifyOp: m.spotifyOp, result: r });"
    "})()"
)

# ── Body / URL expressions ────────────────────────────────────────

_PL_URI = f"{_BODY}.playlist_uri || {_BODY}.uri || {_BODY}.context_uri"
_PL_URI_FULL = f"{_PL_URI} || {_BODY}.playlist_id"

START_PL_BODY = n8n("JSON.stringify({ context_uri: " + _PL_URI + " })")
SWITCH_PL_BODY = n8n("JSON.stringify({ context_uri: " + _PL_URI_FULL + " })")
PLAY_TRACK_BODY = n8n("JSON.stringify({ uris: [$json.trackUri] })")
PLAY_GENRE_BODY = n8n("JSON.stringify({ context_uri: $json.genreUri })")

VOLUME_URL = n8n(
    f"'{API}/me/player/volume?volume_percent='"
    f" + Number({_BODY}.volume_percent || {_BODY}.volume || 50)"
    f" + '&device_id=' + {_DEV}"
)

# ── Nodes ─────────────────────────────────────────────────────────

nodes: list[dict] = [
    # ── Entry ──
    {
        "parameters": {
            "httpMethod": "POST",
            "path": "athena-spotify",
            "responseMode": "responseNode",
            "options": {},
        },
        "id": "wh",
        "name": "Webhook ATHENA",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [0, 500],
        "webhookId": "athena-spotify",
    },
    _code("code-map", "Map action", [220, 500], map_js),
    _switch(
        "sw-needs-dev",
        "Needs device?",
        [440, 500],
        2,
        n8n(
            "({'pause':0,'listPlaylists':0,'healthcheck':0,'unsupported':0})"
            "[$json.spotifyOp] ?? 1"
        ),
    ),
    # ── No-device path ──
    _switch(
        "sw-no-dev",
        "Route no-device",
        [660, 200],
        4,
        n8n(
            "({'pause':0,'listPlaylists':1,'healthcheck':2,'unsupported':3})"
            "[$json.spotifyOp] ?? 3"
        ),
    ),
    _http("http-pause", "Pause", [880, 20], "PUT", f"{API}/me/player/pause"),
    {
        "parameters": {
            "resource": "playlist",
            "operation": "getUserPlaylists",
            "returnAll": True,
        },
        "id": "sp-list-pl",
        "name": "List playlists",
        "type": "n8n-nodes-base.spotify",
        "typeVersion": 1,
        "position": [880, 180],
        "credentials": SPOTIFY_CRED,
    },
    _code("code-fmt-pl", "Format playlists", [1100, 180], FORMAT_PL_JS),
    _code("code-probe", "Probe ok", [880, 340], PROBE_JS),
    _code("code-unsup", "Unsupported", [880, 480], UNSUPPORTED_JS),
    # ── Device path ──
    _http(
        "http-get-dev",
        "Get devices",
        [660, 740],
        "GET",
        f"{API}/me/player/devices",
    ),
    _code("code-pick-dev", "Pick device", [880, 740], PICK_DEVICE_JS),
    _switch(
        "sw-dev-ok",
        "Device ok?",
        [1100, 740],
        2,
        n8n("$json.error === true ? 1 : 0"),
    ),
    _switch(
        "sw-actions",
        "Route actions",
        [1320, 740],
        8,
        n8n(
            "({'resume':0,'nextSong':1,'previousSong':2,'volume':3,"
            "'startMusic':4,'switchPlaylist':5,'playTrack':6,'playGenre':7})"
            f"[{_MAP}.spotifyOp] ?? 0"
        ),
    ),
    # ── Device actions ──
    _http("http-resume", "Resume", [1540, 460], "PUT", _player_url("play")),
    _http("http-next", "Next", [1540, 600], "POST", _player_url("next")),
    _http("http-prev", "Previous", [1540, 740], "POST", _player_url("previous")),
    _http("http-vol", "Volume", [1540, 880], "PUT", VOLUME_URL),
    _http(
        "http-start-pl",
        "Start playlist",
        [1540, 1020],
        "PUT",
        _player_url("play"),
        body_expr=START_PL_BODY,
    ),
    _http(
        "http-switch-pl",
        "Switch playlist",
        [1540, 1160],
        "PUT",
        _player_url("play"),
        body_expr=SWITCH_PL_BODY,
    ),
    # ── playTrack sub-chain ──
    _code(
        "code-resolve-tr",
        "Resolve track input",
        [1540, 1340],
        RESOLVE_TRACK_JS,
    ),
    {
        "parameters": {
            "resource": "track",
            "operation": "search",
            "query": n8n("$json.trackQuery"),
            "returnAll": False,
            "limit": 1,
        },
        "id": "sp-search-tr",
        "name": "Search track",
        "type": "n8n-nodes-base.spotify",
        "typeVersion": 1,
        "position": [1760, 1340],
        "credentials": SPOTIFY_CRED,
    },
    _code("code-pick-uri", "Pick track URI", [1980, 1340], PICK_URI_JS),
    _switch(
        "sw-tr-ok",
        "Track ok?",
        [2200, 1340],
        2,
        n8n("$json.error === true ? 1 : 0"),
    ),
    _http(
        "http-play-tr",
        "Play track",
        [2420, 1340],
        "PUT",
        _player_url("play"),
        body_expr=PLAY_TRACK_BODY,
    ),
    # ── playGenre sub-chain ──
    _code("code-genre", "Genre to playlist", [1540, 1520], GENRE_JS),
    _switch(
        "sw-genre-ok",
        "Genre ok?",
        [1760, 1520],
        2,
        n8n("$json.error === true ? 1 : 0"),
    ),
    _http(
        "http-play-genre",
        "Play genre",
        [1980, 1520],
        "PUT",
        _player_url("play"),
        body_expr=PLAY_GENRE_BODY,
    ),
    # ── Response ──
    {
        "parameters": {
            "respondWith": "json",
            "responseBody": RESPOND_BODY,
            "options": {},
        },
        "id": "respond",
        "name": "Respond to Webhook",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.1,
        "position": [2640, 740],
    },
]


# ── Connections ───────────────────────────────────────────────────


def _c(target: str, index: int = 0) -> list[dict]:
    return [{"node": target, "type": "main", "index": index}]


R = "Respond to Webhook"

connections: dict = {
    # Entry
    "Webhook ATHENA": {"main": [_c("Map action")]},
    "Map action": {"main": [_c("Needs device?")]},
    "Needs device?": {"main": [_c("Route no-device"), _c("Get devices")]},
    # No-device routing
    "Route no-device": {
        "main": [
            _c("Pause"),
            _c("List playlists"),
            _c("Probe ok"),
            _c("Unsupported"),
        ]
    },
    "Pause": {"main": [_c(R)]},
    "List playlists": {"main": [_c("Format playlists")]},
    "Format playlists": {"main": [_c(R)]},
    "Probe ok": {"main": [_c(R)]},
    "Unsupported": {"main": [_c(R)]},
    # Device path
    "Get devices": {"main": [_c("Pick device")]},
    "Pick device": {"main": [_c("Device ok?")]},
    "Device ok?": {"main": [_c("Route actions"), _c(R)]},
    # Action routing
    "Route actions": {
        "main": [
            _c("Resume"),
            _c("Next"),
            _c("Previous"),
            _c("Volume"),
            _c("Start playlist"),
            _c("Switch playlist"),
            _c("Resolve track input"),
            _c("Genre to playlist"),
        ]
    },
    # Simple actions → Respond
    "Resume": {"main": [_c(R)]},
    "Next": {"main": [_c(R)]},
    "Previous": {"main": [_c(R)]},
    "Volume": {"main": [_c(R)]},
    "Start playlist": {"main": [_c(R)]},
    "Switch playlist": {"main": [_c(R)]},
    # playTrack chain
    "Resolve track input": {"main": [_c("Search track")]},
    "Search track": {"main": [_c("Pick track URI")]},
    "Pick track URI": {"main": [_c("Track ok?")]},
    "Track ok?": {"main": [_c("Play track"), _c(R)]},
    "Play track": {"main": [_c(R)]},
    # playGenre chain
    "Genre to playlist": {"main": [_c("Genre ok?")]},
    "Genre ok?": {"main": [_c("Play genre"), _c(R)]},
    "Play genre": {"main": [_c(R)]},
}

# ── Output ────────────────────────────────────────────────────────

wf = {
    "name": "ATHENA Spotify Control",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
    "staticData": None,
    "meta": {"templateCredsSetupCompleted": False},
    "tags": [],
}

out = ROOT / "spotify_athena_workflow.json"
out.write_text(json.dumps(wf, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Wrote {out.relative_to(ROOT.parent.parent.parent)}")
