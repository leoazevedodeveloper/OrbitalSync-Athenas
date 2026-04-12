---
name: MVP financeiro pessoal
overview: Criar um módulo financeiro pessoal no OrbitalSync integrado à Pierre API (modo leitura) para contas, saldos e transações reais, com dashboard e base preparada para evolução.
todos:
  - id: backend-pierre-client
    content: Criar client Pierre API no backend e configuração segura da API key (.env)
    status: pending
  - id: backend-finance-handlers
    content: Criar handlers Socket.IO finance_* para snapshot e refresh com dados Pierre
    status: pending
  - id: frontend-finance-panel
    content: Criar FinancePanel e integrar abertura no App/ToolsModule com estados de loading/erro
    status: cancelled
  - id: dashboard-real-data
    content: Implementar dashboard com saldo, receitas e despesas mensais a partir de dados reais
    status: pending
  - id: mapping-normalization
    content: Normalizar payload Pierre para modelo interno unificado (accounts, transactions, summary)
    status: pending
  - id: qa-smoke
    content: Validar autenticação, sincronização, exibição e fallback quando API indisponível
    status: cancelled
isProject: false
---

# MVP Financeiro Pessoal no OrbitalSync

## Objetivo

Entregar a primeira versão com dados bancários reais:

- Contas e saldos vindos da Pierre API
- Transações recentes e resumo mensal (receitas/despesas)
- Dashboard financeiro pessoal em painel dedicado

## Estratégia de arquitetura

- Manter o padrão atual via Socket.IO no app (backend busca Pierre e envia snapshot ao frontend).
- Isolar integração externa em client/service próprios (`pierre_client` + `finance_service`) para evitar acoplamento.
- Armazenar apenas cache/snapshot local opcional (não duplicar fonte de verdade da Pierre no MVP).
- API key no backend via variável de ambiente (Bearer token), nunca exposta no frontend.

## Estrutura proposta

- Frontend
  - [src/features/finance/FinancePanel.jsx](src/features/finance/FinancePanel.jsx): painel principal (quase full-screen, padrão visual da agenda)
  - [src/features/finance/components/TransactionForm.jsx](src/features/finance/components/TransactionForm.jsx): cadastro de lançamento
  - [src/features/finance/components/AccountsCardsPanel.jsx](src/features/finance/components/AccountsCardsPanel.jsx): contas e cartões
  - [src/features/finance/components/FinanceDashboard.jsx](src/features/finance/components/FinanceDashboard.jsx): cards e gráficos/resumos
  - [src/App.jsx](src/App.jsx): estado de abertura do painel e listeners `finance_*`
  - [src/features/orbital-ui/ToolsModule.jsx](src/features/orbital-ui/ToolsModule.jsx): botão de acesso ao financeiro
- Backend
  - [backend/orbital/services/pierre_client.py](backend/orbital/services/pierre_client.py): chamadas REST autenticadas na Pierre API
  - [backend/orbital/server/socket_handlers/finance_handlers.py](backend/orbital/server/socket_handlers/finance_handlers.py): eventos socket do financeiro
  - [backend/orbital/server/socket_handlers/**init**.py](backend/orbital/server/socket_handlers/__init__.py): registro do handler
  - [backend/orbital/services/finance_service.py](backend/orbital/services/finance_service.py): normalização e agregações para dashboard
  - [backend/orbital/settings.py](backend/orbital/settings.py): leitura de configuração/env do módulo financeiro

## Contratos Socket (MVP)

- `finance_get_snapshot` → backend consulta Pierre e retorna `accounts`, `transactions`, `summary`
- `finance_refresh` → força sincronização com Pierre e rebroadcast
- `finance_get_month_summary` (year, month) → agregação mensal no backend
- Broadcast de atualização: `finance_snapshot`

## Modelo de dados mínimo

- Account (normalizado): `id`, `name`, `type`, `balance`, `currency`, `institution`, `active`
- Transaction (normalizado): `id`, `kind`, `amount`, `category`, `account_id`, `date`, `description`
- Summary: `current_balance`, `income_month`, `expense_month`, `by_category`

## Fases de implementação

1. **Client Pierre**: autenticação Bearer, chamadas de contas/transações e tratamento de erro
2. **Service financeiro**: normalização + agregações mensais para payload único
3. **Socket handlers**: `finance_get_snapshot`, `finance_refresh`, `finance_get_month_summary`
4. **Painel frontend**: `FinancePanel` + botão no `ToolsModule` + listeners em `App.jsx`
5. **Dashboard**: cards principais + lista/visão de transações reais
6. **Polimento**: loading, erro de credencial, indisponibilidade da API e fallback de UX

## Riscos e mitigação

- `App.jsx` já está grande: limitar mudanças nele a wiring (toggle + listeners), deixando lógica no módulo `features/finance`.
- Conflito de overlay/z-index: padronizar `z-index` do `FinancePanel` acima de agenda e abaixo de modais críticos.
- Limites/rate limit da API externa: usar refresh explícito + cache curto para evitar chamadas excessivas.
- Segurança: API key somente backend; sanitizar logs para nunca imprimir token.

## Critérios de aceite

- Usuário abre “Financeiro” pelo botão da UI
- Sistema busca contas/saldos/transações reais da Pierre sem expor chave no frontend
- Dashboard mostra saldo e resumo mensal consistentes com os dados retornados
- Mensagens claras para erro de credencial/assinatura indisponível da API

