# WhatsApp — workflow n8n (Evolution API)

ATHENAS gerencia o WhatsApp pessoal do Leo via **Evolution API** (gratuita, sem API oficial do Meta).

## Arquitetura

```
WhatsApp (seu celular)
    ↕ QR Code
Evolution API (Docker :8085)
    ↕ webhook
n8n (Docker — n8n.orbitalsync.site)
    ↕ HTTP
OrbitalSync Backend (:8000)  +  Gemini API
```

### Fluxo de entrada (mensagem recebida)

1. Pessoa manda mensagem no WhatsApp
2. Evolution API dispara webhook → n8n `evolution-whatsapp-in`
3. n8n parseia a mensagem (ignora grupos, broadcasts, fromMe, mídia sem texto)
4. **Salva no brain vault** → `07 - Logs/YYYY-MM-DDWW` (append com hora + remetente + texto)
5. **Carrega contexto** → identidade da ATHENAS + log WW do dia
6. **Gemini gera resposta** como ATHENAS (curta, natural, pt-BR)
7. **Envia resposta** via Evolution API `sendText`
8. **Salva resposta** no brain vault (mesmo log WW)

### Fluxo de saída (ATHENAS envia proativamente)

1. Leo pede para ATHENAS mandar mensagem → `trigger_webhook("athena-whatsapp", {phone, text})`
2. n8n recebe no webhook `athena-whatsapp`
3. Envia via Evolution API
4. Salva no brain vault

## Setup

### 1. Evolution API

```bash
cd integrations/evolution-api
docker compose up -d
```

API rodando em `http://localhost:8085`.

### 2. Criar instância + conectar WhatsApp

```bash
# Criar instância
curl -X POST http://localhost:8085/instance/create \
  -H "apikey: change-me-orbital" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "athenas", "integration": "WHATSAPP-BAILEYS"}'

# Gerar QR Code para conectar
curl -X GET http://localhost:8085/instance/connect/athenas \
  -H "apikey: change-me-orbital"
```

Escaneie o QR Code com o WhatsApp do seu celular.

### 3. Variáveis de ambiente no n8n

No n8n, vá em **Settings → Variables** e configure:

| Variável | Valor | Exemplo |
|----------|-------|---------|
| `EVOLUTION_API_URL` | URL da Evolution API | `http://host.docker.internal:8085` |
| `EVOLUTION_API_KEY` | API key da Evolution | `change-me-orbital` |
| `EVOLUTION_INSTANCE` | Nome da instância | `athenas` |
| `GEMINI_API_KEY` | API key do Gemini | `AIza...` |
| `ORBITAL_BACKEND_URL` | URL do backend OrbitalSync | `http://host.docker.internal:8000` |

### 4. Credencial no n8n

Crie uma credencial **Header Auth** chamada `OrbitalSync Brain API`:
- **Name**: `Authorization`
- **Value**: `Bearer <sua-ORBITAL_BRAIN_API_KEY>` (ou deixe vazio se não usar API key)

### 5. Importar workflow

1. n8n → **Workflows** → **Import from File** → `whatsapp_athena_workflow.json`
2. Confirme as credenciais nos nós HTTP
3. **Salvar** e **Ativar**

### 6. Configurar webhook na Evolution API

Se não configurou via env var no docker-compose, defina manualmente:

```bash
curl -X POST http://localhost:8085/webhook/set/athenas \
  -H "apikey: change-me-orbital" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://n8n.orbitalsync.site/webhook/evolution-whatsapp-in",
    "webhook_by_events": true,
    "events": ["MESSAGES_UPSERT"]
  }'
```

## Formato do log no Brain Vault

Nota: `07 - Logs/2026-04-14WW`

```markdown
### 10:30 — João (5511999999999)
Oi, tudo bem?

### 10:30 — ATHENAS (resposta)
Oi João! Tudo ótimo por aqui, e contigo?

### 14:15 — Maria (5521888888888)
Leo, me liga quando puder

### 14:15 — ATHENAS (resposta)
Oi Maria! O Leo tá ocupado agora, mas vou avisar ele. Assim que der, ele te liga!
```

## Enviar mensagem pela ATHENAS (via voz/chat)

> "Athenas, manda um WhatsApp pro João dizendo que chego em 10 minutos"

ATHENAS usa `trigger_webhook("athena-whatsapp", {phone: "5511999999999", text: "Chego em 10 minutos!"})`.

## Limitações

- Apenas mensagens de **texto** são processadas (imagens/áudio/vídeo são ignorados)
- Evolution API com Baileys pode desconectar se o celular ficar muito tempo offline
- WhatsApp pode banir números que enviam muitas mensagens automatizadas — use com moderação
