// ⚠️  IMPORTANTE: Troque pelo IP local do seu computador na rede Wi-Fi
// Para descobrir, rode `ipconfig` no Windows e use o IPv4 da sua rede
// Ex.: 192.168.1.10
export const BACKEND_IP = '192.168.3.127';
export const BACKEND_PORT = 8000;
export const BACKEND_ORIGIN = `http://${BACKEND_IP}:${BACKEND_PORT}`;

export const EVOLUTION_ORIGIN = `http://${BACKEND_IP}:8085`;

export const DEBUG_MOBILE_LOGS = true;

export const SOCKET_OPTIONS = {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  timeout: 10000,
  query: { client_type: 'mobile' },
};

export const COLORS = {
  bg: '#000000',
  bgCard: '#09090b',
  bgPanel: '#050505',
  border: 'rgba(255,255,255,0.1)',
  orbPrimary: '#06b6d4',
  orbSecondary: '#0ea5e9',
  orbGlow: '#67e8f9',
  accent: '#34d399',
  accentDim: '#064e3b',
  danger: '#ef4444',
  warn: '#f59e0b',
  textPrimary: '#f4f4f5',
  textSecondary: '#a1a1aa',
  textDim: '#52525b',
  userBubble: 'rgba(16,185,129,0.16)',
  aiBubble: 'rgba(255,255,255,0.06)',
  inputBg: 'rgba(0,0,0,0.55)',
};

export const TYPOGRAPHY = {
  sans: 'Quicksand_700Bold',
  sansMedium: 'Quicksand_500Medium',
  mono: 'IBMPlexMono_600SemiBold',
  monoMedium: 'IBMPlexMono_500Medium',
};

export const BOOT_GATES = [
  { id: 'socket',       label: 'SOCKET  · IO' },
  { id: 'settings',     label: 'SETTINGS SYNC' },
  { id: 'history',      label: 'CHAT HISTORY' },
  { id: 'integrations', label: 'INTEGRATIONS' },
];
