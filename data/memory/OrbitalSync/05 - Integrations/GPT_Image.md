# Integracao: Geracao e Edicao de Imagem (OpenAI)

Pipeline OpenAI + Gemini.

## Configuracao
- Variaveis: `OPENAI_API_KEY` e `GEMINI_API_KEY` no `.env`
- Modulo: `backend/orbital/services/integrations/image_client.py`
- Imagens salvas em: `data/generated-images/`
- Servidas via: `GET /api/generated-image?relpath=...`

## Pipeline
1. **Gemini Flash** (`gemini-2.0-flash`) — turbina e traduz o prompt para ingles profissional (sem custo OpenAI)
2. **GPT Image 1.5** — gera ou edita a imagem (fallback: gpt-image-1)

## Modos
- **Geracao** (`images.generate`) — quando nenhuma imagem foi enviada no chat
- **Edicao** (`images.edit`) — quando o usuario anexou uma imagem no chat; essa imagem e enviada como base para a edicao

## Capacidades
- Qualidades: low (512), medium (1K), high (2K/4K)
- Tamanhos: 1024x1024, 1536x1024, 1024x1536
- Output: PNG

## Tool
- Nome: `generate_image`
- Parametros: `prompt` (obrigatorio), `aspect_ratio`, `image_size`
- A imagem do chat e capturada automaticamente — nao precisa de parametro extra
- Ver skill: [[Geracao_de_imagem]]
