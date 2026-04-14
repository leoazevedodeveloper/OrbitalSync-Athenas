// Mapeia body.action -> spotifyOp (chaves do Switch n8n: pause, resume, nextSong, …).
// IMPORTANTE: o Switch NÃO tem chave "play" — só "resume". Por isso play → resume.

const root = $input.first().json;
const body = root.body && typeof root.body === 'object' ? root.body : root;
const pickAction = () => {
  if (body && typeof body.action === 'string' && body.action.trim()) return body.action;
  if (body && typeof body.command === 'string' && body.command.trim()) return body.command;
  if (body && typeof body.intent === 'string' && body.intent.trim()) return body.intent;
  return '';
};

const raw = String(pickAction())
  .toLowerCase()
  .trim();

const normalized = raw
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '_');

const map = {
  pause: 'pause',
  pausar: 'pause',
  play: 'resume',
  resume: 'resume',
  start: 'resume',
  unpause: 'resume',
  continue: 'resume',
  continuar: 'resume',
  retomar: 'resume',
  despausar: 'resume',
  next: 'nextSong',
  skip: 'nextSong',
  previous: 'previousSong',
  back: 'previousSong',
  volume: 'volume',
  play_playlist: 'startMusic',
  list_playlists: 'listPlaylists',
  playlists: 'listPlaylists',
  listar_playlists: 'listPlaylists',
  trocar_playlist: 'switchPlaylist',
  switch_playlist: 'switchPlaylist',
  change_playlist: 'switchPlaylist',
  tocar_musica: 'playTrack',
  play_track: 'playTrack',
  track: 'playTrack',
  tocar_genero: 'playGenre',
  play_genre: 'playGenre',
  genre: 'playGenre',
};

let spotifyOp = map[raw] || map[normalized];

// Health check/ping interno do Orbital.
if (raw === '__orbital_connectivity_probe__') {
  spotifyOp = 'healthcheck';
}

// play / resume / start + dados de faixa -> tocar música específica (não só retomar).
// Sem isso, action:play + track_name ia para Resume e ignorava o nome.
const hasTrackTarget = Boolean(
  (body.track_uri && String(body.track_uri).trim()) ||
  (body.track_id && String(body.track_id).trim()) ||
  (body.track_name && String(body.track_name).trim()) ||
  (body.track_query && String(body.track_query).trim()) ||
  (body.track && String(body.track).trim()) ||
  (body.song && String(body.song).trim()) ||
  (body.music && String(body.music).trim()) ||
  (body.query &&
    String(body.query).trim() &&
    !body.playlist_uri &&
    !body.context_uri) ||
  (body.artist && String(body.artist).trim()) ||
  (body.artista && String(body.artista).trim())
);
if (hasTrackTarget && spotifyOp === 'resume' && raw !== '__orbital_connectivity_probe__') {
  spotifyOp = 'playTrack';
}

// Desambiguação: "playlist" sem URI/ID -> listar; com URI/ID -> tocar/trocar.
if (raw === 'playlist' || normalized === 'playlist') {
  const hasContext = Boolean(
    body.playlist_uri || body.uri || body.context_uri || body.playlist_id
  );
  spotifyOp = hasContext ? 'switchPlaylist' : 'listPlaylists';
}

if (!spotifyOp) {
  // Linguagem natural no campo action, ex: "toca a paixão me levou pfv"
  if (/^(toca|toque|tocar|play)\b/.test(raw)) {
    spotifyOp = 'playTrack';
    if (!body.track_query && !body.track_name && !body.track && !body.song && !body.music && !body.query) {
      const extracted = raw
        .replace(/^(toca|toque|tocar|play)\s+/i, '')
        .replace(/\b(pfv|por favor)\b/gi, '')
        .trim();
      if (extracted) body.track_query = extracted;
    }
  } else if (
    /\bplaylist(s)?\b/.test(raw) &&
    /\b(quais|quantas|minhas|lista|listar|mostrar|ver|tenho|salva|salvas|cadastrada|cadastradas|guardada|guardadas)\b/.test(raw)
  ) {
    spotifyOp = 'listPlaylists';
  }
}

if (!spotifyOp) {
  spotifyOp = 'unsupported';
}

return [{ json: { spotifyOp, body, action: raw, normalizedAction: normalized } }];
