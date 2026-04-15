# WhatsApp

Integração via Evolution API (local :8085) + n8n.

## Como funciona
- Mensagens recebidas são salvas em [[WhatsApp_log_index]] → arquivos diários `YYYY-MM-DDWW`
- Mensagens pendentes (não respondidas) ficam em [[WhatsApp_pendente]]
- Ao receber uma mensagem nova, o backend injeta uma notificação na sessão ativa

## Contatos VIP
| Nome | Número | Relação | Tratamento |
|------|--------|---------|------------|
| Maria Dessupoio | +553298288377 | Namorada | Tom pessoal e prioritário. Ex: "Leo, sua namorada mandou mensagem pra você: '[texto]'" |

## Comportamento esperado
Quando chegar uma notificação de WhatsApp:
1. Se for contato VIP: use o tratamento especial da tabela acima — mais pessoal, prioridade imediata
2. Demais contatos: "Leo, chegou mensagem de [Nome]: '[texto]'. Quer que eu responda?"
3. Se Leo disser sim ou pedir para responder, use o hook `athena-whatsapp` com `phone` e `text`
4. Após responder, use `write_brain` para remover a entrada de [[WhatsApp_pendente]] (mode `overwrite` com o conteúdo sem aquela linha)
5. Se Leo disser "agora não" / "depois" / "ignora", use `write_brain` (mode `append`) para registrar a mensagem em [[WhatsApp_pendente]] — assim ela persiste para a próxima sessão

## Enviar mensagem
```
trigger_webhook(hook_id="athena-whatsapp", payload={"phone": "5511999999999", "text": "mensagem"})
```

## Integra com
- [[n8n]]
- [[Loop_de_execucao]]
