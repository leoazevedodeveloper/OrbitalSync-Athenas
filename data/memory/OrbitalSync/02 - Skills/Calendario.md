# Skill: Calendário / Agenda

Gerencia eventos no Google Calendar via n8n (hook `athena-google-calendar`).

## Criar evento — `add_calendar_reminder`
- Usar para eventos com data e hora que Leo mencionou (reunião amanhã 15h, compromisso dia 10)
- Parâmetros: `title`, `starts_at_iso` (ISO 8601 com timezone, Brasil: -03:00)
- Opcionais: `ends_at_iso`, `notes`
- Para esperas curtas relativas ("daqui 7 minutos") → usar [[Timer]] em vez disso

## Listar eventos — `trigger_webhook`
- Hook `athena-google-calendar`, payload `calendar_op: list`
- Opcionais: `time_min`, `time_max` (ISO)

## Cancelar evento — `remove_calendar_reminder`
- Preferir `google_event_id` (vem em data.id ao criar ou listar)
- Se Leo não tiver o id, usar `title` + `starts_at_iso` para localizar (correspondência ±2h)
- SEMPRE esperar resultado antes de confirmar

## Regras
- Se n8n retornar [FAILED] → reportar honestamente (OAuth, workflow inativo, etc.)
- Após sucesso → UMA confirmação curta em português

## Ativado por
- [[Loop_de_execucao]]
- Quando Leo menciona compromissos, reuniões, agenda
