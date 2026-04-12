# Skill: Histórico e Contexto

Busca e gerenciamento de contexto de conversas anteriores.

## Buscar histórico — `search_chat_history`
- Busca semântica na nuvem (Supabase) + busca por palavras-chave no arquivo local
- Usar quando Leo perguntar "você lembra quando..." ou sobre assuntos passados
- Sempre chamar ANTES de responder sobre conversas anteriores

## Contexto de startup/reconnect
- Carregado automaticamente do Supabase quando configurado
- chat_history.jsonl local é fallback se leitura da nuvem falhar
- NUNCA oferecer resumo do log até Leo falar ou escrever

## Imagens recebidas
- Quando Leo envia foto, screenshot ou documento via chat: descrever com precisão, ler texto visível (OCR), extrair dados pedidos
- Responder em português brasileiro (exceto se Leo pedir em inglês)

## Webhooks gerais — `trigger_webhook`
- Automações HTTP opcionais via hook_id de webhooks.json
- Sempre esperar resultado antes de afirmar sucesso

## Ativado por
- [[Loop_de_execucao]]
- Quando Leo pergunta sobre conversas anteriores ou envia imagens
