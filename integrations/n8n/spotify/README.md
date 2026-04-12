# Spotify — workflow n8n

Controle Spotify com **nós nativos** do n8n (sem HTTP Request para a API).

Fluxo: **Webhook** → **Map action** (Code) → **Switch** → nós **Spotify** → **Respond to Webhook**.

## Importar

1. n8n → **Workflows** → **Import from File** → `spotify_athena_workflow.json` (nesta pasta)
2. Em **cada** nó Spotify, credencial **Spotify OAuth2** ([docs n8n](https://docs.n8n.io/integrations/builtin/credentials/spotify/))
3. **Salvar** e **Ativar**
4. Usar a **Production URL** do webhook `athena-spotify`

## Regenerar o JSON

Depois de editar `map_action.js`:

```bash
python integrations/n8n/spotify/_build_spotify_workflow.py
```

## `action` no corpo do POST

| `action` | Observação |
|----------|------------|
| `pause` | Pausa |
| `play`, `resume` | Retoma |
| `next`, `skip` | Próxima |
| `previous`, `back` | Anterior |
| `volume` | `volume_percent` ou `volume` (0–100) |
| `playlist` / listas / faixas | Ver `map_action.js` e workflow atual (listPlaylists, switchPlaylist, playTrack, playGenre, …) |

## Limitação do nó nativo

**Shuffle** e **repeat** não existem no nó Spotify do n8n → resposta `Unsupported action` (`ok: false`).

## Requisitos

Spotify **Premium**, dispositivo/app ativo quando precisar de reprodução. Se o **Map action** no n8n estiver desatualizado, reimporta este JSON ou copia o `map_action.js` deste repo.

### Exemplos

```json
{ "action": "pause" }
{ "action": "next" }
{ "action": "volume", "volume_percent": 40 }
{ "action": "playlist", "playlist_uri": "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M" }
```
