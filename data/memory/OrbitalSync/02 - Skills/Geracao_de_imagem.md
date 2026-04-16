# Skill: Geracao de Imagem

Gera imagens usando **GPT Image (OpenAI API)** via tool `generate_image`.

## Motor atual
- Modelo: `gpt-image-1` (OpenAI)
- Requer: `OPENAI_API_KEY` no `.env`

## Regras
- Fornecer `prompt` claro e detalhado: sujeito, estilo, iluminacao, composicao, cores
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

## Ativado por
- [[Loop_de_execucao]]
- Quando Leo pede para criar, gerar ou desenhar uma imagem
