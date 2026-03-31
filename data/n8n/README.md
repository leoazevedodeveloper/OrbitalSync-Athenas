# Workflows n8n (ATHENA)

## `spotify_athena_workflow.json`

Controle Spotify com **nós nativos Spotify** do n8n (sem HTTP Request para a API).

Fluxo: **Webhook** → **Map action** (Code) → **Switch** (expressão) → vários nós **Spotify** → **Respond to Webhook**.

### Importar

1. n8n → **Workflows** → **Import from File** → `spotify_athena_workflow.json`
2. Em **cada** nó Spotify (Pause, Resume, Next, …), escolha a credencial **Spotify OAuth2** (Documentação: [Spotify credentials](https://docs.n8n.io/integrations/builtin/credentials/spotify/))
3. **Salvar** e **Ativar** o workflow
4. Usar a **Production URL** do webhook `athena-spotify`

### Regenerar o JSON

Depois de editar `map_action.js`:

```bash
python data/n8n/_build_spotify_workflow.py
```

### `action` no JSON do POST

| `action` | Observação |
|----------|------------|
| `pause` | Pausa |
| `play`, `resume` | Retoma |
| `next`, `skip` | Próxima |
| `previous`, `back` | Anterior |
| `volume` | Corpo: `volume_percent` ou `volume` (0–100) |
| `playlist`, `play_playlist` | Corpo: `playlist_uri` ou `uri` ou `context_uri` (`spotify:playlist:...`) |

### Limitação do nó nativo

O nó Spotify do n8n **não** expõe **shuffle** nem **repeat** no Player. Essas ações caem em **Unsupported action** (resposta JSON com `ok: false`).

Para shuffle/repeat, opções:

- Montar um segundo workflow só com **HTTP Request** + OAuth Spotify, ou  
- Usar o histórico no Git se ainda tiver a variante “só HTTP”.

### Requisitos

- Spotify **Premium**, **app Spotify aberto** (ou dispositivo ativo) e, para **play/resume**, costuma ser preciso já ter tido **reprodução recente** na conta (fila ativa). Se nada toca: use **`action: playlist`** com `playlist_uri`, ou dê play uma vez manualmente no app e tente de novo.
- Se o workflow no n8n ainda tiver `play: 'play'` no nó **Map action**, **`play` cai em “unsupported”** — reimporte `spotify_athena_workflow.json` ou copie o `map_action.js` deste repo (onde `play` → `resume`).

### Exemplos

```json
{ "action": "pause" }
{ "action": "next" }
{ "action": "volume", "volume_percent": 40 }
{ "action": "playlist", "playlist_uri": "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M" }
```
