# n8n
- Motor de automação (Docker local, exposto via Cloudflare Tunnel)
- URL produção: `https://n8n.orbitalsync.site`

## Workflows ativos
| Webhook | Operações | Notas |
|---------|-----------|-------|
| `athena-spotify` | play, pause, next, previous, volume, playlists, play_track, play_genre | [[Spotify]] |
| `athena-google-calendar` | create, update, delete, list | [[Calendario]] |

## Detalhes Google Calendar
- Todos os nós GCal têm error handling (`onError: continueRegularOutput`)
- Respostas sempre em formato `{ok: true/false, message, data}`
- O backend envia `calendar_op` explicitamente no payload

## Integra com
- [[Loop_de_execucao]]
- [[Memoria_curto_prazo]]
