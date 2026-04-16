/** Origem do backend (Socket.IO + `/api/generated-image` no histórico). */
export const BACKEND_ORIGIN = 'http://localhost:8000';

/** Evita crescimento ilimitado do estado após muitas horas (lag de render/memória). */
export const MAX_CHAT_MESSAGES_STORED = 450;

export const TRANSCRIPTION_USER_CHUNK_TARGET = 18;
export const TRANSCRIPTION_ASSISTANT_CHUNK_TARGET = 11;
export const TRANSCRIPTION_USER_CHUNKS_PER_TICK = 2;
export const TRANSCRIPTION_ASSISTANT_CHUNKS_PER_TICK = 1;
export const TRANSCRIPTION_USER_FLUSH_MS = 14;
export const TRANSCRIPTION_ASSISTANT_FLUSH_MS = 36;
export const TRANSCRIPTION_ASSISTANT_SOFT_PAUSE_MS = 58;
export const TRANSCRIPTION_ASSISTANT_STRONG_PAUSE_MS = 112;

/** Fallback estável para props do Visualizer quando o espectro vem só por ref (sem setState por frame). */
export const MIC_VIS_SILENT_BANDS = Object.freeze(new Array(32).fill(0));
export const AI_VIS_SILENT_BANDS = Object.freeze(new Array(64).fill(0));
