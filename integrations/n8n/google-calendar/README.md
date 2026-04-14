# Google Calendar — workflow n8n

Workflow **ATHENA Google Calendar**: webhook `athena-google-calendar` (create, update, list, delete eventos).

## Importar

1. n8n → **Workflows** → **Import from File** → `google_calendar_athena_workflow.json`
2. Configurar credencial **Google Calendar OAuth2** nos nós que precisarem
3. **Ativar** o workflow
4. URL de produção deve bater com `config/webhooks.json` → hook `athena-google-calendar`

## Corpo típico

- **Criar:** `calendar_op: create`, `title`, `starts_at_iso`, opcional `ends_at_iso`, `notes`
- **Atualizar:** `calendar_op: update`, `event_id`, + campos a alterar (`title`, `starts_at_iso`, `ends_at_iso`, `notes`)
- **Listar:** `calendar_op: list` ou `time_min` / `time_max`
- **Apagar:** `calendar_op: delete` + `event_id`

## Inferência automática de operação

Quando `calendar_op` não é enviado, o **Parse Calendar** infere:

| Condição | Operação inferida |
|----------|-------------------|
| `event_id` + `starts_at_iso` | `update` |
| `event_id` sem `starts_at_iso` | `delete` |
| `time_min` ou `time_max` | `list` |
| `starts_at_iso` sem `event_id` | `create` |

## Error handling

Cada nó Google Calendar tem `onError: continueRegularOutput`. Um nó **Check** intermediário
verifica se o output contém `error` ou `errorMessage` e retorna `{ok: false, message: "..."}` em vez de HTTP 500.

## Diagrama do fluxo

```
Webhook → Parse Calendar → Route op (Switch 4)
  ├─ 0: Create → Check Create → Respond Create
  ├─ 1: Update → Check Update → Respond Update
  ├─ 2: Delete → Check Delete → Respond Delete
  └─ 3: List   → Aggregate List → Respond List
```

O nó **Parse Calendar** normaliza o payload; ver o código embutido no JSON para detalhes.
