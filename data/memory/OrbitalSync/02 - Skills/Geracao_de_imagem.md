# Skill: Geração de Imagem

Gera imagens usando ComfyUI local via tool `generate_image`.

## Regras
- SEMPRE fornecer `prompt` (positivo) e `negative_prompt` (o que evitar: artefatos, blur, watermark, etc.)
- Usar string vazia em negative_prompt apenas se realmente nada deve ser excluído
- Definir `aspect_ratio` e `image_size` quando relevante

## Ativado por
- [[Loop_de_execucao]]
- Quando Leo pede para criar, gerar ou desenhar uma imagem
