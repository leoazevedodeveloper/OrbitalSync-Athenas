// Mapeia body.action -> spotifyOp (chaves do Switch n8n: pause, resume, nextSong, …).
// IMPORTANTE: o Switch NÃO tem chave "play" — só "resume". Por isso play → resume.

const root = $input.first().json;
const body = root.body && typeof root.body === 'object' ? root.body : root;
const raw = String(body.action || '')
  .toLowerCase()
  .trim();

const map = {
  pause: 'pause',
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
  playlist: 'startMusic',
  play_playlist: 'startMusic',
};

let spotifyOp = map[raw];
if (!spotifyOp) {
  spotifyOp = 'unsupported';
}

return [{ json: { spotifyOp, body, action: raw } }];
