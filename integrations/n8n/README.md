# n8n — OrbitalSync

| Pasta | Webhook (produção) | Conteúdo |
|--------|-------------------|----------|
| **`spotify/`** | `athena-spotify` | Spotify (nós nativos), `map_action.js`, gerador Python |
| **`google-calendar/`** | `athena-google-calendar` | Google Calendar (create / update / list / delete) |
| **`whatsapp/`** | `evolution-whatsapp-in` + `athena-whatsapp` | WhatsApp pessoal via Evolution API (receber + enviar) |

Credenciais e URLs de produção alinham com **`config/webhooks.json`** (ou Supabase `athena_webhooks`).

Evolution API (WhatsApp) roda via Docker — ver **`integrations/evolution-api/docker-compose.yml`**.

Geração de imagem: **Nano Banana 2** via Gemini API — sem pasta de integração dedicada, usa `GEMINI_API_KEY`.
