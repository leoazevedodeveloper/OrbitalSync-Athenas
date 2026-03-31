# ComfyUI (imagens locais)

O assistente pode gerar imagens via **ComfyUI** em vez da API Gemini, desde que exista um workflow exportado em formato **API (JSON)**.

## 1. Coloque o arquivo do workflow

- Salve o export como **`workflow_api.json`** nesta pasta (`data/comfyui/`), **ou**
- Defina `COMFYUI_WORKFLOW_FILE` com o caminho absoluto para o seu JSON.

## 2. Prompt no workflow

- **Positivo:** use **`{{PROMPT}}`** no nó `CLIPTextEncode` do prompt positivo (a ATHENAS envia `prompt` na tool).
- **Negativo:** use **`{{NEGATIVE_PROMPT}}`** no nó do prompt negativo (a ATHENAS envia `negative_prompt` na mesma tool).
- Sem placeholders: o app preenche o **primeiro** `CLIPTextEncode` (por id de nó) com o positivo e o **segundo** com o negativo.

## 3. Tamanho / aspect ratio

O app ajusta **`EmptyLatentImage`** e **`EmptySD3LatentImage`** (`width` / `height`) conforme `aspect_ratio` da tool (`1:1`, `16:9`, etc.).

## 4. Variáveis de ambiente (`.env`)

```env
# URL base da API do ComfyUI (sem barra no final)
COMFYUI_BASE_URL=http://127.0.0.1:2000

# Opcional — padrão: data/comfyui/workflow_api.json na raiz do projeto
# COMFYUI_WORKFLOW_FILE=C:/caminho/para/meu_workflow_api.json
```

Se `workflow_api.json` não existir (e `COMFYUI_WORKFLOW_FILE` não apontar para um arquivo válido), a geração de imagem falha (ComfyUI não configurado).

## 5. Cópia local das imagens geradas

Cada imagem retornada pelo ComfyUI é também gravada em **`data/comfyui/imagens/`** (criada automaticamente), com nome do tipo `athenas_YYYYMMDD_HHMMSS_<hex>.png` (ou `.jpg` / `.webp` conforme o ficheiro). Esta pasta está no `.gitignore` para não versionar binários.

## 6. Exportar o JSON no ComfyUI

No ComfyUI: use **Save (API Format)** / exportação em formato API — deve ser um único objeto JSON cujas chaves são IDs de nó (não o formato “graph” da UI apenas).
