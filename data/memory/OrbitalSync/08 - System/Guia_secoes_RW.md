# Guia das secoes RW (Read-Write) da ATHENAS

Este documento descreve as secoes em que a IA pode ler e escrever no cerebro (`RW`), para manter memoria util, organizada e consistente.

---

## 01 - Memoria

### Funcao
Guardar conhecimento persistente que deve continuar valido ao longo do tempo.

### O que salvar
- Preferencias e perfil do usuario (ex.: estilo de resposta, rotina, contexto pessoal relevante).
- Aprendizados recorrentes da IA (ex.: "quando Leo pede X, costuma querer Y").
- Conhecimento de projetos de medio/longo prazo que nao e apenas estado momentaneo.

### Exemplos
- "Leo prefere respostas objetivas com passo a passo."
- "Leo vai completar 3 anos na empresa."
- "No projeto financeiro pessoal, priorizar simplicidade antes de automacoes."

### O que evitar
- Estado temporario do momento atual (isso vai para `06 - State`).
- Logs de conversa brutos (isso vai para `07 - Logs`).
- Tarefas operacionais (isso vai para `04 - Tasks`).

---

## 04 - Tasks

### Funcao
Organizar o fluxo de trabalho: o que foi pedido, o que esta em andamento e o que foi concluido.

### O que salvar
- Novas tarefas solicitadas pelo usuario.
- Tarefas ativas do ciclo atual.
- Tarefas concluidas com data/resumo.

### Exemplos
- "Criar handler para `search_brain` no `audio_loop.py`."
- "Refatorar template de memoria do usuario."
- "Concluido: ajuste de permissoes RO/RW em `brain.py`."

### O que evitar
- Preferencias pessoais permanentes do usuario (isso vai para `01 - Memoria`).
- Reflexoes narrativas longas de conversa (isso vai para `07 - Logs`).

---

## 05 - Integrations

### Funcao
Documentar integracoes externas e como elas funcionam no ecossistema da ATHENAS.

### O que salvar
- Integracoes novas (API, webhook, servico externo, ferramenta).
- Configuracoes funcionais (sem expor segredos).
- Fluxos de uso, dependencias, limites e troubleshooting.

### Exemplos
- "Integracao com n8n: fluxo de disparo por webhook."
- "Nano Banana 2: geracao de imagem via Gemini API, free tier 500/dia, modelo gemini-2.5-flash-preview."
- "Google Calendar: escopo de permissao e rotina de sincronizacao."

### O que evitar
- Credenciais, tokens, segredos e dados sensiveis em texto puro.
- Estado de conversa atual (isso vai para `06 - State`).

---

## 06 - State

### Funcao
Representar o estado vivo da sessao atual: contexto, intencao, modo de operacao e objetivo corrente.

### O que salvar
- Contexto atual da conversa ("sobre o que estamos agora").
- Intencao imediata do usuario.
- Modo atual (assistente, dev, pesquisa, etc.).
- Objetivo ativo no curto prazo.

### Exemplos
- "Contexto atual: refinando arquitetura do BrainVault."
- "Intencao do usuario: entender onde salvar informacoes pessoais."
- "Modo atual: suporte tecnico com foco em organizacao de memoria."

### O que evitar
- Historico permanente e consolidado (isso vai para `01 - Memoria`).
- Conversas completas e reflexoes pos-conversa (isso vai para `07 - Logs`).

---

## 07 - Logs

### Funcao
Registrar historico e reflexao: trilha do que aconteceu e aprendizados apos interacoes importantes.

### O que salvar
- Resumo de conversas relevantes.
- Eventos importantes de uso.
- Reflexoes da IA sobre o que funcionou e o que melhorar.

### Exemplos
- "Resumo da conversa de hoje: definicao de papeis RW/RO."
- "Reflexao: usar exemplos concretos melhora entendimento do usuario."
- "Incidente: tentativa de escrita em secao RO bloqueada corretamente."

### O que evitar
- Transformar logs em lista de tarefas (isso vai para `04 - Tasks`).
- Preferencias do usuario sem consolidar em `01 - Memoria`.

---

## Regras praticas de ouro

- Se e permanente sobre o usuario ou padrao aprendido: `01 - Memoria`.
- Se e acao/execucao de trabalho: `04 - Tasks`.
- Se envolve sistema externo/ferramenta: `05 - Integrations`.
- Se e "agora" da conversa: `06 - State`.
- Se e historico/reflexao do que ja aconteceu: `07 - Logs`.

---

## Padrao recomendado de escrita

- Preferir entradas curtas, claras e rastreaveis.
- Sempre que possivel, incluir links entre notas com `[[Wikilinks]]`.
- Evitar duplicacao: cada tipo de dado deve ter "casa principal".
- Atualizar `State` com `overwrite` quando o contexto muda.
- Usar `append` para memoria cumulativa, tarefas e logs.

