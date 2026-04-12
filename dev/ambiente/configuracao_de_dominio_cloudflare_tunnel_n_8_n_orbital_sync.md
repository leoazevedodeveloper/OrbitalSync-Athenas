# 🚀 Guia Completo — Domínio + Cloudflare Tunnel + n8n (OrbitalSync)

Este guia mostra passo a passo como:
- Comprar um domínio
- Configurar na Cloudflare
- Criar túnel (Cloudflare Tunnel)
- Expor o n8n com HTTPS
- Resolver problema de OAuth (Spotify)

---

# 🧠 Visão Geral

Objetivo final:

```
https://n8n.orbitalsync.site
```

---

# 🌐 1. Comprar domínio

Você pode usar:
- Namecheap
- GoDaddy

Exemplo usado:
```
orbitalsync.site
```

---

# ☁️ 2. Configurar Cloudflare

## Passos:

1. Acesse: https://dash.cloudflare.com
2. Clique em **Add Site**
3. Digite seu domínio
4. Escolha plano **Free**

---

# 🔁 3. Trocar Nameservers (Namecheap)

No painel do domínio:

1. Domain List
2. Manage
3. Nameservers
4. Selecionar **Custom DNS**

Colocar:

```
alex.ns.cloudflare.com
anita.ns.cloudflare.com
```

⚠️ Remover outros nameservers

---

# ⏳ 4. Aguardar ativação

Na Cloudflare aparecerá:

```
Status: Active
```

---

# 🚇 5. Instalar Cloudflared

Baixar:
https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/

---

# 🔐 6. Login

```bash
cloudflared tunnel login
```

---

# 🚇 7. Criar túnel

```bash
cloudflared tunnel create n8n
```

---

# 🌐 8. Criar domínio fixo

```bash
cloudflared tunnel route dns n8n n8n.orbitalsync.site
```

---

# ⚙️ 9. Criar config.yml

```yaml
tunnel: SEU_TUNNEL_ID
credentials-file: C:\Users\SEU_USER\.cloudflared\SEU_ID.json

ingress:
  - hostname: n8n.orbitalsync.site
    service: http://localhost:5678
  - service: http_status:404
```

---

# ▶️ 10. Rodar túnel

```bash
cloudflared tunnel --config config.yml run n8n
```

---

# 🐳 11. Rodar n8n com Docker

```bash
docker run -d \
--name n8n \
-p 5678:5678 \
-e WEBHOOK_URL=https://n8n.orbitalsync.site \
-e N8N_HOST=n8n.orbitalsync.site \
-e N8N_PROTOCOL=https \
-e N8N_PORT=5678 \
n8nio/n8n
```

---

# 🧪 12. Testar

Abrir no navegador:

```
https://n8n.orbitalsync.site
```

---

# 🔗 13. Configurar Spotify OAuth

Redirect URI:

```
https://n8n.orbitalsync.site/rest/oauth2-credential/callback
```

---

# ⚠️ Problemas comuns

## ❌ redirect_uri mismatch
➡️ Solução: configurar WEBHOOK_URL no Docker

## ❌ localhost aparecendo
➡️ Solução: recriar container

## ❌ erro 503
➡️ Solução: config.yml não carregado

---

# 😈 Resultado final

Você terá:

- URL fixa
- HTTPS
- Backend local acessível globalmente
- Integração com APIs

---

# 🚀 Próximos passos

- Integrar IA
- Automações com n8n
- Comandos por voz
- Controle de apps (Spotify, etc)

---

# 🔥 Projeto: OrbitalSync

Base de um assistente estilo JARVIS.

