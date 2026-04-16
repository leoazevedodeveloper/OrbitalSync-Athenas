# Integracao: Geracao de Imagem (OpenAI)

Pipeline 100% OpenAI.

## Configuracao
- Variavel: `OPENAI_API_KEY` no `.env`
- Modulo: `backend/orbital/services/integrations/image_client.py`
- Imagens salvas em: `data/generated-images/`
- Servidas via: `GET /api/generated-image?relpath=...`

## Pipeline
1. **GPT-4o-mini** — turbina e traduz o prompt para ingles profissional
2. **GPT Image 1.5** — gera a imagem (fallback: gpt-image-1)

## Capacidades
- Qualidades: low (512), medium (1K), high (2K/4K)
- Tamanhos: 1024x1024, 1536x1024, 1024x1536
- Output: PNG

## Tool
- Nome: `generate_image`
- Parametros: `prompt` (obrigatorio), `aspect_ratio`, `image_size`
- Ver skill: [[Geracao_de_imagem]]
