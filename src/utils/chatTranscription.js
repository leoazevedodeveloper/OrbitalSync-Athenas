import {
    MAX_CHAT_MESSAGES_STORED,
    TRANSCRIPTION_ASSISTANT_CHUNK_TARGET,
    TRANSCRIPTION_ASSISTANT_CHUNKS_PER_TICK,
    TRANSCRIPTION_ASSISTANT_FLUSH_MS,
    TRANSCRIPTION_ASSISTANT_SOFT_PAUSE_MS,
    TRANSCRIPTION_ASSISTANT_STRONG_PAUSE_MS,
    TRANSCRIPTION_USER_CHUNK_TARGET,
    TRANSCRIPTION_USER_CHUNKS_PER_TICK,
    TRANSCRIPTION_USER_FLUSH_MS,
} from '../constants/appConfig';

export function trimChatMessages(msgs) {
    if (!Array.isArray(msgs) || msgs.length <= MAX_CHAT_MESSAGES_STORED) return msgs;
    return msgs.slice(-MAX_CHAT_MESSAGES_STORED);
}

export function createMessageId(prefix = 'msg') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isAssistantSender(sender) {
    const s = String(sender || '').toLowerCase();
    return s.includes('athenas') || s.includes('ada') || s.includes('jarvis');
}

/**
 * Corrige transcrições coladas pelo ASR/streaming (ex.: "Leo.Temporizador", "iniciado.Leo").
 */
export function fixCollapsedPunctuation(text) {
    let s = String(text || '');
    let prev = '';
    while (s !== prev) {
        prev = s;
        s = s.replace(/([.!?…])([A-Za-zÀ-ÿ])/g, '$1 $2');
        s = s.replace(/([,;:])([A-Za-zÀ-ÿ])/g, '$1 $2');
    }
    return s;
}

export function splitTranscriptionForSmoothUI(sender, text) {
    const raw = String(text || '');
    if (!raw) return [];
    const chunkTarget = isAssistantSender(sender)
        ? TRANSCRIPTION_ASSISTANT_CHUNK_TARGET
        : TRANSCRIPTION_USER_CHUNK_TARGET;
    if (raw.length <= chunkTarget + 6) {
        return [{ sender, text: raw }];
    }

    const pieces = [];
    let cursor = 0;
    while (cursor < raw.length) {
        let end = Math.min(cursor + chunkTarget, raw.length);
        if (end < raw.length) {
            const lookahead = raw.slice(end, Math.min(end + 8, raw.length));
            const breakMatch = lookahead.match(/[\s,.;:!?]/);
            if (breakMatch) {
                end += breakMatch.index + 1;
            }
        }
        pieces.push({ sender, text: raw.slice(cursor, end) });
        cursor = end;
    }
    return pieces;
}

export function transcriptionChunksPerTickForSender(sender) {
    return isAssistantSender(sender)
        ? TRANSCRIPTION_ASSISTANT_CHUNKS_PER_TICK
        : TRANSCRIPTION_USER_CHUNKS_PER_TICK;
}

export function transcriptionFlushDelayForChunk(chunk, pendingQueueSize = 0) {
    const sender = chunk?.sender;
    if (!isAssistantSender(sender)) {
        return TRANSCRIPTION_USER_FLUSH_MS;
    }

    const text = String(chunk?.text || '');
    let delay = TRANSCRIPTION_ASSISTANT_FLUSH_MS;
    if (/[.!?]\s*$/.test(text)) {
        delay += TRANSCRIPTION_ASSISTANT_STRONG_PAUSE_MS;
    } else if (/[,;:]\s*$/.test(text)) {
        delay += TRANSCRIPTION_ASSISTANT_SOFT_PAUSE_MS;
    }

    const backlogBoost = Math.min(24, Math.floor(pendingQueueSize / 12));
    return Math.max(18, delay - backlogBoost);
}
