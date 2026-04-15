# WhatsApp — Mensagens Pendentes

**Instruções para ATHENAS:**
- Ao receber notificação de WhatsApp: use `read_brain` nesta nota e conte quantas mensagens pendentes já existem daquele remetente. Se houver mais de uma, diga "Leo, você tem X mensagens de [Nome], quer que eu te mostre?" — não leia todas de uma vez. Se for a primeira do remetente, diga "Leo, chegou mensagem de [Nome]: '[texto]'. Quer responder?"
- Se Leo disser "agora não" / "depois" / "ignora": use `write_brain` (note: `06 - State/WhatsApp_pendente`, mode: `append`) para registrar a mensagem pendente na seção abaixo
- Ao responder um contato: use `read_brain` para ler esta nota, remova **apenas as linhas daquele contato**, e reescreva o restante com `write_brain` (mode: `overwrite`) — nunca apague linhas de outros contatos
- Se for um remetente diferente de msgs anteriores recentes: alerte Leo como notificação separada e prioritária
- Se Leo disser "apaga", "pode apagar", "já respondi", "limpa as pendentes" ou similar: use `write_brain` (note: `06 - State/WhatsApp_pendente`, mode: `overwrite`) reescrevendo o arquivo inteiro — mantenha apenas o cabeçalho `# WhatsApp — Mensagens Pendentes`, as instruções, a seção `## Relacionado` e a linha `## Mensagens não respondidas` vazia, sem nenhuma entrada

## Relacionado
[[WhatsApp]] · [[WhatsApp_log_index]] · [[Contexto_atual]]

## Mensagens não respondidas
- 15:00 | Cássio (+553299946263): Estou só aguardando um horário que tem alguém lá pra receber.
- 15:01 | Cássio (+553299946263): Me fala um horário que eu ligo pro Edinho e vejo se a loja vai estar disponível pra entregar.

