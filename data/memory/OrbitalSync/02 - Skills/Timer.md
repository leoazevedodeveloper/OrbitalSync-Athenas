# Skill: Timer

Inicia contagem regressiva na UI do OrbitalSync via tool `start_timer`.

## Parâmetros
- `duration_seconds` — duração em segundos (minutos → segundos, ex: 5 min = 300)
- `label` — opcional, rótulo curto mostrado na UI (ex: "Coffee break", "Alongamento")

## Regras RÍGIDAS
1. Após o resultado do tool, falar NO MÁXIMO uma linha curta em português (2-6 palavras, ex: "Combinado, Leo.")
2. PROIBIDO no mesmo turno: repetir a duração duas vezes, combinar "iniciando..." com "...iniciado", ou re-explicar que a UI está contando
3. NÃO dizer "tempo esgotado", "acabou" ou que o timer terminou até receber uma notificação de sistema separada — nunca narrar o fim antecipadamente
4. Quando a notificação de fim chegar, responder com exatamente uma frase curta em português

## Ativado por
- [[Loop_de_execucao]]
- Quando Leo pede contagem regressiva, cronômetro, espera, ou intervalo
