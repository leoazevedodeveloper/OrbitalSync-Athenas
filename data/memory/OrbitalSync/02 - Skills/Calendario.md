# Skill: Calendário / Agenda

Gerencia eventos no Google Calendar via n8n (hook `athena-google-calendar`).

## Criar evento — `add_calendar_reminder`
- Usar para eventos com data e hora que Leo mencionou (reunião amanhã 15h, compromisso dia 10)
- Parâmetros: `title`, `starts_at_iso` (ISO 8601 com timezone, Brasil: -03:00)
- Opcionais: `ends_at_iso`, `notes`
- Para esperas curtas relativas ("daqui 7 minutos") → usar [[Timer]] em vez disso

## Atualizar evento — `trigger_webhook`
- Hook `athena-google-calendar`, payload `calendar_op: update`
- Obrigatório: `event_id` (vem em data.id ao criar ou listar)
- Campos alteráveis: `title`, `starts_at_iso`, `ends_at_iso`, `notes`
- Usar quando Leo quer reagendar ou mudar título sem apagar o evento existente

## Listar eventos — `trigger_webhook`
- Hook `athena-google-calendar`, payload `calendar_op: list`
- Opcionais: `time_min`, `time_max` (ISO)

## Cancelar evento — `remove_calendar_reminder`
- Preferir `google_event_id` (vem em data.id ao criar ou listar)
- Se Leo não tiver o id, usar `title` + `starts_at_iso` para localizar (correspondência ±2h)
- SEMPRE esperar resultado antes de confirmar

## Regras
- O backend envia `calendar_op` explicitamente — não depender de inferência do n8n
- Se n8n retornar [FAILED] → reportar honestamente (OAuth, workflow inativo, etc.)
- Se n8n retornar `ok: false` → reportar a mensagem de erro ao Leo
- Após sucesso → UMA confirmação curta em português

## Operações disponíveis (via n8n)
| Op | Campos obrigatórios | Opcionais |
|----|---------------------|-----------|
| `create` | `title`, `starts_at_iso` | `ends_at_iso`, `notes` |
| `update` | `event_id` | `title`, `starts_at_iso`, `ends_at_iso`, `notes` |
| `delete` | `event_id` | — |
| `list` | — | `time_min`, `time_max` |

## Ativado por
- [[Loop_de_execucao]]
- Quando Leo menciona compromissos, reuniões, agenda
