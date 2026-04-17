# OrbitalSync Mobile

Interface mobile para o assistente de IA **ATHENAS · OrbitalSync**, construída com React Native + Expo.

## Pré-requisitos

- Node.js 18+
- [Expo Go](https://apps.apple.com/br/app/expo-go/id982107779) instalado no iPhone
- Backend OrbitalSync rodando no seu computador (`python server.py` ou equivalente)
- Computador e iPhone **na mesma rede Wi-Fi**

## Setup

### 1. Descubra o IP do seu computador

No Windows, abra o terminal e execute:
```
ipconfig
```
Procure o "Endereço IPv4" da sua rede Wi-Fi (ex.: `192.168.1.100`).

### 2. Configure o IP no app

Edite o arquivo `src/constants/config.ts`:
```ts
export const BACKEND_IP = '192.168.1.100'; // ← seu IP aqui
```

### 3. Instale as dependências

```bash
npm install
```

### 4. Inicie o app

```bash
npm start
```

Vai abrir um QR Code no terminal. Escaneie com o app **Expo Go** no iPhone.

## Funcionalidades

- **Boot screen** animada com verificação de conexão ao backend
- **Orb 3D** animado que reage ao estado do assistente (ouvindo, falando, pensando)
- **Chat** com histórico completo e suporte a imagens geradas
- **Voz** — controle de sessão de áudio, mute/unmute
- **Transcrição** em tempo real durante o reconhecimento de voz
- **Confirmação de tools** — modal para aprovar ações da IA
- **Configurações** — ajuste de VAD, TTS e outras opções via Socket.IO

## Estrutura

```
src/
├── constants/
│   └── config.ts         ← IP do backend e constantes de UI
├── lib/
│   └── socket.ts         ← Cliente Socket.IO singleton
├── screens/
│   ├── BootScreen.tsx    ← Tela de boot animada
│   └── MainScreen.tsx    ← Tela principal (orb + chat + tools)
└── components/
    ├── OrbVisualizer.tsx     ← Orb animado
    ├── ChatModule.tsx        ← Chat completo
    ├── ToolsBar.tsx          ← Barra de ferramentas inferior
    ├── SettingsModal.tsx     ← Modal de configurações
    └── ConfirmationModal.tsx ← Modal de confirmação de tool
```

## Comunicação com o Backend

O app usa **Socket.IO** para comunicação em tempo real, exatamente como a versão desktop.

### Emits enviados
| Evento | Quando |
|--------|--------|
| `orbital_sync_boot` | Ao conectar |
| `get_settings` | Ao conectar |
| `get_chat_history` | Ao conectar |
| `start_audio` | Ao ligar sessão |
| `stop_audio` | Ao desligar sessão |
| `set_voice_detection` | Ao mutar/desmutar |
| `user_input` | Ao enviar mensagem de texto |
| `update_settings` | Ao alterar configuração |
| `confirm_tool` | Ao confirmar/negar tool |

### Listeners
| Evento | Ação |
|--------|------|
| `status` | Atualiza estado do orb |
| `audio_data` | Nível de áudio para animação |
| `transcription` | Texto em tempo real |
| `settings` | Carrega configurações |
| `chat_history` | Carrega histórico |
| `tool_confirmation_request` | Abre modal de confirmação |
| `error` | Exibe mensagem de erro no chat |
