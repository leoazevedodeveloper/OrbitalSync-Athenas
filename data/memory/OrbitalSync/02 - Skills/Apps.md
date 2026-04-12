# Skill: Apps Locais

Abre programas no PC do Leo usando whitelist local.

## Processo
1. Chamar `list_launch_apps` para ver apps disponíveis (whitelist em config/launch_apps.json)
2. Chamar `launch_app` com um `app_id` da lista retornada
3. NUNCA inventar caminhos — usar apenas IDs da whitelist

## Ativado por
- [[Loop_de_execucao]]
- Quando Leo pede para abrir um programa, aplicativo ou software
