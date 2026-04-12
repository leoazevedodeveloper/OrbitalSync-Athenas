# Google Calendar — workflow n8n

Workflow **ATHENA Google Calendar**: webhook `athena-google-calendar` (create, list, delete eventos).

## Importar

1. n8n → **Workflows** → **Import from File** → `google_calendar_athena_workflow.json`
2. Configurar credencial **Google Calendar OAuth2** nos nós que precisarem
3. **Ativar** o workflow
4. URL de produção deve bater com `config/webhooks.json` → hook `athena-google-calendar`

## Corpo típico

- **Criar:** `calendar_op: create` (ou `starts_at_iso` sem `event_id`), `title`, `starts_at_iso`, opcional `ends_at_iso`, `notes`
- **Listar:** `calendar_op: list` ou `time_min` / `time_max`
- **Apagar:** `calendar_op: delete` + `event_id`

O nó **Parse Calendar** normaliza o payload; ver o código embutido no JSON para detalhes.
