# ComfyUI (imagens locais)

O assistente pode gerar imagens via **ComfyUI** desde que exista um workflow exportado em formato **API (JSON)**.

## 1. Ficheiro do workflow

- Guarde o export como **`workflow_api.json`** nesta pasta (`integrations/comfyui/`), **ou**
- Defina `COMFYUI_WORKFLOW_FILE` com o caminho absoluto para o seu JSON.

## 2. Prompt no workflow

- **Positivo:** use **`{{PROMPT}}`** no nó `CLIPTextEncode` do prompt positivo.
- **Negativo:** use **`{{NEGATIVE_PROMPT}}`** no nó do prompt negativo.
- Sem placeholders: o app preenche o **primeiro** `CLIPTextEncode` (por id de nó) com o positivo e o **segundo** com o negativo.

## 3. Tamanho / aspect ratio

O app ajusta **`EmptyLatentImage`** e **`EmptySD3LatentImage`** (`width` / `height`) conforme `aspect_ratio` da tool (`1:1`, `16:9`, etc.).

## 4. Variáveis de ambiente (`.env`)

```env
COMFYUI_BASE_URL=http://127.0.0.1:2000

# Opcional — padrão: integrations/comfyui/workflow_api.json
# COMFYUI_WORKFLOW_FILE=C:/caminho/para/meu_workflow_api.json
```

## 5. Cópia local das imagens

As imagens são gravadas em **`integrations/comfyui/imagens/`** (pasta no `.gitignore`).

## 6. Exportar o JSON no ComfyUI

Use **Save (API Format)** — um único objeto JSON cujas chaves são IDs de nó.
