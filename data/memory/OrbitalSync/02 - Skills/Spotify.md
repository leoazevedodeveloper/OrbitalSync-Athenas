# Skill: Spotify

Controle do Spotify via webhook n8n (hook `athena-spotify`). Usar `trigger_webhook`.

## Ações suportadas (payload.action)
- `pause` — pausar
- `play` / `resume` / `start` — retomar reprodução
- `play` com `track_name`/`track_uri`/`artist` — tocar música específica
- `next` / `skip` — próxima faixa
- `previous` / `back` — faixa anterior
- `volume` com `volume_percent` — ajustar volume
- `list_playlists` ou `playlist` sem `playlist_uri` — listar playlists salvas do Leo
- `switch_playlist` / `play_playlist` / `playlist` com `playlist_uri`/`context_uri` — tocar playlist
- `play_track` com `track_name` (e `artist` opcional, ou `track_uri`) — tocar faixa
- `play_genre` com `genre` — tocar por gênero

## Regras
- Quando Leo perguntar "quais playlists", "minhas playlists" ou similar → chamar com action `list_playlists`, depois resumir os nomes do JSON
- SEMPRE esperar resultado do tool antes de afirmar sucesso
- Se resultado começa com [FAILED] ou mostra HTTP 4xx/5xx ou ok:false → dizer honestamente que não funcionou e que Spotify Premium + app aberto + playback recente em um dispositivo são geralmente necessários
- NÃO dizer que música está tocando a menos que o tool retorne [SUCCESS]
- Chamar `trigger_webhook` imediatamente quando Leo pedir (não apenas prometer)
- "dá um tempo" pode significar esperar/pausar ambiguamente — se incerto, perguntar brevemente

## Ativado por
- [[Loop_de_execucao]]
- Quando Leo pede para tocar, pausar, pular, ou gerenciar músicas
