# Skill: Geracao de Imagem

Gera ou **edita** imagens usando **GPT Image (OpenAI API)** via tool `generate_image`.

## Motor atual
- Modelos: `gpt-image-1.5` (primario), `gpt-image-1` (fallback)
- Requer: `OPENAI_API_KEY` e `GEMINI_API_KEY` no `.env`

## Modos de operacao
- **Gerar do zero** — nenhuma imagem anexada no chat
- **Editar imagem** — usuario anexou uma imagem no chat antes de pedir a geracao; a imagem sera usada como base para a edicao

## Regras
- Fornecer `prompt` claro e detalhado: sujeito, estilo, iluminacao, composicao, cores
- Se estiver editando, descrever **o que mudar** na imagem existente
- Definir `aspect_ratio`:
  - `1:1` — feed Instagram, quadrado (padrao)
  - `9:16` — stories e reels
  - `16:9` — capas e thumbnails landscape
  - `3:4` / `4:3` — outros formatos
- Definir `image_size`:
  - `1K` — qualidade media (padrao)
  - `2K` ou `4K` — alta qualidade
  - `512` — rapido / baixa qualidade
- Nao e necessario `negative_prompt`
- O prompt sera automaticamente melhorado e traduzido para ingles pelo **Gemini Flash** antes de enviar para a API

## Ativado por
- [[Loop_de_execucao]]
- Quando Leo pede para criar, gerar, desenhar ou editar uma imagem
- Quando Leo envia uma imagem no chat e pede uma modificacao
