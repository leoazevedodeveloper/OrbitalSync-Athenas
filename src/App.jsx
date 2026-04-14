import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';

import { BACKEND_ORIGIN, AI_VIS_SILENT_BANDS, MIC_VIS_SILENT_BANDS } from './constants/appConfig';
import { socket } from './lib/socket';
import {
    trimChatMessages,
    createMessageId,
    splitTranscriptionForSmoothUI,
    transcriptionChunksPerTickForSender,
    transcriptionFlushDelayForChunk,
    fixCollapsedPunctuation,
} from './utils/chatTranscription';
import { startTimerAlarm, stopTimerAlarm } from './utils/timerAlertSound';
import Visualizer from './features/orbital-ui/Visualizer';
import TopAudioBar from './features/orbital-ui/TopAudioBar';
import ChatModule from './features/chat/ChatModule';
import ToolsModule from './features/orbital-ui/ToolsModule';
import { Mic, MicOff, Settings, X, Minus, Maximize2, Power, Video, VideoOff, Layout, Hand, Clock } from 'lucide-react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
// MemoryPrompt removed - memory is now actively saved to project
import ConfirmationPopup from './shared/ConfirmationPopup';
import AuthLock from './features/auth/AuthLock';
import SettingsWindow from './features/settings/SettingsWindow';
import BootSequence from './features/orbital-ui/BootSequence';
import IntegrationHealthDock from './features/orbital-ui/IntegrationHealthDock';
import AssistantTimerDock from './features/orbital-ui/AssistantTimerDock';
import AgendaCalendarPanel from './features/orbital-ui/AgendaCalendarPanel';

const AGENDA_STORAGE_KEY = 'orbital_agenda_reminders_v1';
const AGENDA_MAX_ITEMS = 200;

/** Título normalizado para casar lembrete local com evento vindo do Google. */
function normAgendaTitle(t) {
    return String(t || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/** Evita dois cartões para o mesmo compromisso (local + Google). */
function mergeAgendaLocalsWithGoogle(locals, googleEvents) {
    const googleIds = new Set(googleEvents.map((g) => g.googleEventId).filter(Boolean));
    const localsFiltered = locals.filter((r) => {
        if (r.googleEventId && googleIds.has(r.googleEventId)) return false;
        for (const g of googleEvents) {
            if (normAgendaTitle(g.title) !== normAgendaTitle(r.title)) continue;
            if (Math.abs((g.startsAtMs || 0) - (r.startsAtMs || 0)) <= 120000) return false;
        }
        return true;
    });
    const out = [...googleEvents, ...localsFiltered];
    out.sort((a, b) => a.startsAtMs - b.startsAtMs);
    return out;
}

function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month, day);
}

function addDays(baseDate, amount) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + amount);
    return d;
}

function dateAtNine(dateLike) {
    const d = new Date(dateLike);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
}

function buildBrazilNationalHolidays(year) {
    const easter = easterSunday(year);
    return [
        { key: 'confraternizacao-universal', title: 'Feriado Nacional · Confraternização Universal', startsAtMs: new Date(year, 0, 1, 9, 0, 0, 0).getTime() },
        { key: 'paixao-de-cristo', title: 'Feriado Nacional · Paixão de Cristo', startsAtMs: dateAtNine(addDays(easter, -2)) },
        { key: 'tiradentes', title: 'Feriado Nacional · Tiradentes', startsAtMs: new Date(year, 3, 21, 9, 0, 0, 0).getTime() },
        { key: 'dia-do-trabalho', title: 'Feriado Nacional · Dia do Trabalho', startsAtMs: new Date(year, 4, 1, 9, 0, 0, 0).getTime() },
        { key: 'independencia-do-brasil', title: 'Feriado Nacional · Independência do Brasil', startsAtMs: new Date(year, 8, 7, 9, 0, 0, 0).getTime() },
        { key: 'nossa-senhora-aparecida', title: 'Feriado Nacional · Nossa Senhora Aparecida', startsAtMs: new Date(year, 9, 12, 9, 0, 0, 0).getTime() },
        { key: 'finados', title: 'Feriado Nacional · Finados', startsAtMs: new Date(year, 10, 2, 9, 0, 0, 0).getTime() },
        { key: 'proclamacao-da-republica', title: 'Feriado Nacional · Proclamação da República', startsAtMs: new Date(year, 10, 15, 9, 0, 0, 0).getTime() },
        { key: 'dia-da-consciencia-negra', title: 'Feriado Nacional · Dia da Consciência Negra', startsAtMs: new Date(year, 10, 20, 9, 0, 0, 0).getTime() },
        { key: 'natal', title: 'Feriado Nacional · Natal', startsAtMs: new Date(year, 11, 25, 9, 0, 0, 0).getTime() },
    ];
}



const { ipcRenderer } = window.require('electron');

function App() {
    const [status, setStatus] = useState('Disconnected');
    const [socketConnected, setSocketConnected] = useState(socket.connected); // Track socket connection reactively
    // Auth State
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        // Optimistically assume authenticated if face auth is NOT enabled
        return localStorage.getItem('face_auth_enabled') !== 'true';
    });

    // Initialize from LocalStorage to prevent flash of UI
    const [isLockScreenVisible, setIsLockScreenVisible] = useState(() => {
        const saved = localStorage.getItem('face_auth_enabled');
        // If saved is 'true', we MUST start locked.
        // If 'false' or null (default off), we start unlocked.
        return saved === 'true';
    });

    // Local state for tracking settings, also init from local storage
    const [faceAuthEnabled, setFaceAuthEnabled] = useState(() => {
        return localStorage.getItem('face_auth_enabled') === 'true';
    });


    const [isConnected, setIsConnected] = useState(true); // Power state DEFAULT ON
    const [isMuted, setIsMuted] = useState(true); // Mic state DEFAULT MUTED
    const [isVideoOn, setIsVideoOn] = useState(false); // Video state
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    /** Anexo de imagem no chat: enviado ao Gemini com user_input (OCR / descrição). */
    const [chatImageAttachment, setChatImageAttachment] = useState(null); // { b64, mime, preview }
    const [isImageGenerating, setIsImageGenerating] = useState(false);
    const [imageGeneratingCaption, setImageGeneratingCaption] = useState('Gerando imagem...');
    const isImageGenerationActiveRef = useRef(false);
    const pendingAssistantTextRef = useRef('');
    // showMemoryPrompt removed - memory is now actively saved to project
    const [confirmationRequest, setConfirmationRequest] = useState(null); // { id, tool, args }
    const [currentTime, setCurrentTime] = useState(new Date()); // Live clock

    /** Primeira sessão com o modelo pronta — desliga animação de “boot” na orb */
    const [hasCompletedBootstrap, setHasCompletedBootstrap] = useState(false);
    /** Tela POST/UEFI de inicialização (uma vez por abertura do app até concluir) */
    const [systemBootComplete, setSystemBootComplete] = useState(false);
    /** Gates reais para BootSequence (não pulável). */
    const [bootMediaReady, setBootMediaReady] = useState(false);
    const [bootSettingsReady, setBootSettingsReady] = useState(false);
    const [bootAuthReady, setBootAuthReady] = useState(false);
    const [bootHistoryReady, setBootHistoryReady] = useState(false);
    /** Primeiro `integration_test_result` após connect (dock sem “pending” ao abrir o workspace). */
    const [bootIntegrationsReady, setBootIntegrationsReady] = useState(false);
    /** pending | skipped | running | unavailable | standalone */
    const [cloudflaredBoot, setCloudflaredBoot] = useState('pending');

    /** Cronómetros iniciados pela tool `start_timer` (backend → assistant_timer). */
    const [assistantTimers, setAssistantTimers] = useState([]);

    /** Lembretes de agenda (`add_calendar_reminder` → assistant_calendar), persistidos em localStorage. */
    const [agendaReminders, setAgendaReminders] = useState(() => {
        try {
            const raw = localStorage.getItem(AGENDA_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter(
                    (r) =>
                        r &&
                        typeof r.id === 'string' &&
                        typeof r.title === 'string' &&
                        Number.isFinite(r.startsAtMs)
                )
                .sort((a, b) => a.startsAtMs - b.startsAtMs)
                .slice(0, AGENDA_MAX_ITEMS);
        } catch {
            return [];
        }
    });
    const [agendaPanelOpen, setAgendaPanelOpen] = useState(false);
    /** Eventos espelhados do Google Calendar (n8n list); não persistidos — só o mês pedido. */
    const [googleAgendaEvents, setGoogleAgendaEvents] = useState([]);
    const [googleAgendaLoading, setGoogleAgendaLoading] = useState(false);
    const [googleAgendaError, setGoogleAgendaError] = useState('');

    const isImageGenerationPending = confirmationRequest?.tool === 'generate_image';
    const isImageGenerationActive = isImageGenerating || isImageGenerationPending;
    useEffect(() => {
        isImageGenerationActiveRef.current = isImageGenerationActive;
    }, [isImageGenerationActive]);


    // RESTORED STATE
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const [fps, setFps] = useState(0);

    // Device states - microphones, speakers, webcams
    const [micDevices, setMicDevices] = useState([]);
    const [speakerDevices, setSpeakerDevices] = useState([]);
    const [webcamDevices, setWebcamDevices] = useState([]);

    // Selected device IDs - restored from localStorage
    const [selectedMicId, setSelectedMicId] = useState(() => localStorage.getItem('selectedMicId') || '');
    const [selectedSpeakerId, setSelectedSpeakerId] = useState(() => localStorage.getItem('selectedSpeakerId') || '');
    const [selectedWebcamId, setSelectedWebcamId] = useState(() => localStorage.getItem('selectedWebcamId') || '');
    const [showSettings, setShowSettings] = useState(false);
    /** Último resultado do teste automático de integrações (a cada 1 min). */
    const [integrationHealth, setIntegrationHealth] = useState({
        supabase: { tier: 'pending' },
        comfyui: { tier: 'pending' },
        webhooks: { tier: 'pending' },
    });
    const showSettingsRef = useRef(false);
    useEffect(() => {
        showSettingsRef.current = showSettings;
    }, [showSettings]);
    const [showChatVisualization, setShowChatVisualization] = useState(() => localStorage.getItem('showChatVisualization') !== 'false');
    const [currentProject, setCurrentProject] = useState('OrbitalSync');

    // Modular Mode State
    const [isModularMode, setIsModularMode] = useState(false);
    const [elementPositions, setElementPositions] = useState({
        video: { x: 40, y: 80 }, // Initial positions (approximate)
        visualizer: { x: window.innerWidth / 2, y: window.innerHeight / 2 - 200 },
        chat: { x: window.innerWidth / 2, y: window.innerHeight / 2 + 180 },
        tools: { x: 20, y: 28 } // Canto inferior esquerdo (left, bottom em px)
    });

    const [elementSizes, setElementSizes] = useState({
        visualizer: { w: 860, h: 700 },
        chat: { w: 600, h: 320 },
        tools: { w: 268, h: 44 }, // Faixa horizontal inferior esquerda (para inset do chat)
        video: { w: 320, h: 180 }
    });
    const [activeDragElement, setActiveDragElement] = useState(null);

    // Z-Index Stacking Order (last element = highest z-index)
    const [zIndexOrder, setZIndexOrder] = useState([
        'visualizer', 'chat', 'tools', 'video'
    ]);

    // Hand Control State
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
    const [isPinching, setIsPinching] = useState(false);
    const [isHandTrackingEnabled, setIsHandTrackingEnabled] = useState(false); // DEFAULT OFF
    const [cursorSensitivity, setCursorSensitivity] = useState(2.0);
    const micInputGainRef = useRef(1);
    /** Ganho de entrada do microfone (visualização + envio ao modelo no backend). */
    const [micInputGain, setMicInputGain] = useState(() => {
        const raw = localStorage.getItem('micInputGain');
        if (raw == null) return 1;
        const v = parseFloat(raw, 10);
        return Number.isFinite(v) ? Math.min(4, Math.max(0.25, v)) : 1;
    });
    micInputGainRef.current = micInputGain;
    /** Detecção de voz (microfone → backend): limiar RMS e tempo de silêncio antes de “fechar” a frase. */
    const [audioVadThreshold, setAudioVadThreshold] = useState(() => {
        const raw = localStorage.getItem('orbitalAudioVadThreshold');
        const v = parseInt(raw, 10);
        return Number.isFinite(v) ? Math.min(3000, Math.max(200, v)) : 900;
    });
    const [audioSilenceMs, setAudioSilenceMs] = useState(() => {
        const raw = localStorage.getItem('orbitalAudioSilenceMs');
        const v = parseInt(raw, 10);
        return Number.isFinite(v) ? Math.min(800, Math.max(100, v)) : 220;
    });
    const [isCameraFlipped, setIsCameraFlipped] = useState(false); // Gesture control camera flip

    // Refs for Loop Access (Avoiding Closure Staleness)
    const isHandTrackingEnabledRef = useRef(false); // DEFAULT OFF
    const cursorSensitivityRef = useRef(2.0);
    const isCameraFlippedRef = useRef(false);
    const handLandmarkerRef = useRef(null);
    const lastPinchRef = useRef(false);
    const cursorTrailRef = useRef([]); // Stores last N positions for trail
    const [ripples, setRipples] = useState([]); // Visual ripples on click

    // Web Audio Context for Mic Visualization
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const micGainNodeRef = useRef(null);
    const animationFrameRef = useRef(null);
    const aiSilenceTimerRef = useRef(null);
    const aiDecayAnimationRef = useRef(null);
    /** Espectro TTS da IA — mutável; o Visualizer lê por ref (sem setState a cada pacote). */
    const aiSpectrumRef = useRef(new Array(64).fill(0));
    /** Espectro do microfone sem setState (evita ~60 re-renders/s por frame do analyser). */
    const micSpectrumRef = useRef(new Array(32).fill(0));
    const pendingAiAudioRef = useRef(null);
    const aiAudioFlushRafRef = useRef(null);
    const isAiSpeakingRef = useRef(false);
    const pendingTranscriptionChunksRef = useRef([]);
    const transcriptionFlushTimerRef = useRef(null);
    // Video Refs
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const transmissionCanvasRef = useRef(null); // Dedicated canvas for resizing payload
    const videoIntervalRef = useRef(null);
    const lastFrameTimeRef = useRef(0);
    const frameCountRef = useRef(0);
    const lastVideoTimeRef = useRef(-1);

    // Throttling para evitar degradação com o tempo (CPU/GPU/render).
    const lastPredictMsRef = useRef(0);
    const lastHandDetectMsRef = useRef(0);
    const lastCursorUpdateMsRef = useRef(0);
    const snapTargetsRef = useRef([]);
    const lastSnapTargetsUpdateMsRef = useRef(0);

    // Ref to track video state for the loop (avoids closure staleness)
    const isVideoOnRef = useRef(false);
    const isModularModeRef = useRef(false);
    const elementPositionsRef = useRef(elementPositions);
    const activeDragElementRef = useRef(null);
    const lastActiveDragElementRef = useRef(null);
    const lastCursorPosRef = useRef({ x: 0, y: 0 });
    const lastWristPosRef = useRef({ x: 0, y: 0 }); // For stable fist gesture tracking

    // Smoothing and Snapping Refs
    const smoothedCursorPosRef = useRef({ x: 0, y: 0 });
    const snapStateRef = useRef({ isSnapped: false, element: null, snapPos: { x: 0, y: 0 } });

    // Mouse Drag Refs
    const dragOffsetRef = useRef({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const appliedSpeakerIdRef = useRef(null);
    /** Altifalante escolhido nas definições — usado p.ex. pelo alerta do cronómetro (Web Audio setSinkId). */
    const selectedSpeakerIdRef = useRef(selectedSpeakerId);
    selectedSpeakerIdRef.current = selectedSpeakerId;

    // Update refs when state changes
    useEffect(() => {
        isModularModeRef.current = isModularMode;
        elementPositionsRef.current = elementPositions;
        isHandTrackingEnabledRef.current = isHandTrackingEnabled;
        cursorSensitivityRef.current = cursorSensitivity;
        isCameraFlippedRef.current = isCameraFlipped;
    }, [isModularMode, elementPositions, isHandTrackingEnabled, cursorSensitivity, isCameraFlipped]);

    useEffect(() => {
        isAiSpeakingRef.current = isAiSpeaking;
    }, [isAiSpeaking]);

    useEffect(() => {
        localStorage.setItem('micInputGain', String(micInputGain));
    }, [micInputGain]);

    useEffect(() => {
        localStorage.setItem('orbitalAudioVadThreshold', String(audioVadThreshold));
    }, [audioVadThreshold]);

    useEffect(() => {
        localStorage.setItem('orbitalAudioSilenceMs', String(audioSilenceMs));
    }, [audioSilenceMs]);

    useEffect(() => {
        if (!socketConnected || !isConnected) return;
        socket.emit('set_voice_detection', {
            rms_threshold: audioVadThreshold,
            silence_sec: audioSilenceMs / 1000,
        });
    }, [audioVadThreshold, audioSilenceMs, isConnected, socketConnected]);

    const emitStartAudio = useCallback(
        (options = {}) => {
            const { muted = false } = options;
            const index = micDevices.findIndex((d) => d.deviceId === selectedMicId);
            const dev = micDevices.find((d) => d.deviceId === selectedMicId);
            const spkIdx = speakerDevices.findIndex((d) => d.deviceId === selectedSpeakerId);
            const spk = speakerDevices.find((d) => d.deviceId === selectedSpeakerId);
            socket.emit('start_audio', {
                device_index: index >= 0 ? index : null,
                device_name: dev ? dev.label : null,
                output_device_index: spkIdx >= 0 ? spkIdx : null,
                output_device_name: spk ? spk.label : null,
                input_gain: micInputGainRef.current,
                muted,
                audio_vad_threshold: audioVadThreshold,
                audio_vad_silence_sec: audioSilenceMs / 1000,
            });
            appliedSpeakerIdRef.current = selectedSpeakerId || null;
        },
        [micDevices, selectedMicId, speakerDevices, selectedSpeakerId, audioVadThreshold, audioSilenceMs]
    );

    useEffect(() => {
        if (!isConnected || !socketConnected) return;
        const desiredSpeaker = selectedSpeakerId || null;
        // Primeira sincronização da sessão atual.
        if (appliedSpeakerIdRef.current == null) {
            appliedSpeakerIdRef.current = desiredSpeaker;
            return;
        }
        // Sem mudança real.
        if (appliedSpeakerIdRef.current === desiredSpeaker) return;

        // Troca de saída exige reabrir stream de reprodução no backend.
        socket.emit('stop_audio');
        const t = setTimeout(() => {
            emitStartAudio({ muted: isMuted });
            setStatus('Reconfigurando saída de áudio...');
        }, 260);
        return () => clearTimeout(t);
    }, [selectedSpeakerId, isConnected, socketConnected, emitStartAudio, isMuted]);

    /** Ganho no Web Audio (orb / medidor) + avisa o backend se o socket estiver ativo. */
    useEffect(() => {
        const g = micGainNodeRef.current;
        const ctx = audioContextRef.current;
        if (g && ctx && ctx.state !== 'closed') {
            const gv = Math.min(4, Math.max(0.25, micInputGain));
            try {
                g.gain.setValueAtTime(gv, ctx.currentTime);
            } catch {
                g.gain.value = gv;
            }
        }
        if (socket.connected) {
            socket.emit('set_mic_input_gain', { gain: micInputGain });
        }
    }, [micInputGain]);

    // Live Clock Update
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Centering Logic (Startup & Resize)
    useEffect(() => {
        const centerElements = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            // Toolbar: canto inferior esquerdo (fixed; x = da esquerda, y = de baixo)
            const toolsLeft = Math.max(16, Math.round(width * 0.018));
            const toolsBottom = 26;

            const gap = 20;

            // Dynamic Height Calculation to fit screen
            // Standard Heights
            let vizH = 700;
            let chatH = showChatVisualization ? 260 : 0;
            const topBarHeight = 60;

            // Total needed: TopBar + Viz + Gap + Chat + Gap + Tools (140 reserved)
            const totalNeeded = topBarHeight + vizH + gap + chatH + gap + 112;

            if (height < totalNeeded) {
                // Scale down
                const available = height - topBarHeight - 140 - (gap * 2);
                // Allocate 60% to Viz, 40% to Chat
                vizH = available * 0.6;
                chatH = available * 0.4;
            }

            // Positions
            // Visualizer (Center Anchored) - Centralized vertically
            const vizY = Math.max(topBarHeight + (vizH / 2) + 10, Math.min(height * 0.3, height - (vizH / 2) - 112));

            const visualizerW = Math.min(980, width * 0.92);
            const isCompact = width < 1100;
            if (showChatVisualization) {
                chatH = Math.max(220, Math.min(320, height * (isCompact ? 0.34 : 0.3)));
            }

            const chatW = showChatVisualization
                ? (isCompact ? Math.min(960, width * 0.95) : Math.min(1040, width * 0.72))
                : 0;

            // Chat (Top Anchored): docked near the bottom for a cleaner assistant console.
            const chatX = width / 2;
            const preferredChatY = height - chatH - 28;
            const chatY = Math.max(topBarHeight + 12, Math.min(height - chatH - 24, preferredChatY));

            setElementSizes(prev => ({
                ...prev,
                visualizer: { w: visualizerW, h: vizH },
                chat: { w: chatW, h: chatH }
            }));

            setElementPositions(prev => ({
                ...prev,
                visualizer: {
                    x: width / 2,
                    y: vizY
                },
                chat: {
                    x: chatX,
                    y: chatY
                },
                tools: {
                    x: toolsLeft,
                    y: toolsBottom
                }
            }));
        };

        // Center on mount
        centerElements();

        // Center on resize
        window.addEventListener('resize', centerElements);
        return () => window.removeEventListener('resize', centerElements);
    }, [showChatVisualization]);

    useEffect(() => {
        localStorage.setItem('showChatVisualization', String(showChatVisualization));
    }, [showChatVisualization]);

    // Utility: Clamp position to viewport so component stays fully visible
    const clampToViewport = (pos, size) => {
        const margin = 10;
        const topBarHeight = 60;
        const width = window.innerWidth;
        const height = window.innerHeight;

        return {
            x: Math.max(size.w / 2 + margin, Math.min(width - size.w / 2 - margin, pos.x)),
            y: Math.max(size.h / 2 + margin + topBarHeight, Math.min(height - size.h / 2 - margin, pos.y))
        };
    };

    // Utility: Get z-index for an element based on stacking order
    const getZIndex = (id) => {
        const baseZ = 30; // Above background elements
        const index = zIndexOrder.indexOf(id);
        return baseZ + (index >= 0 ? index : 0);
    };

    // Utility: Bring element to front (highest z-index)
    const bringToFront = (id) => {
        setZIndexOrder(prev => {
            const filtered = prev.filter(el => el !== id);
            return [...filtered, id]; // Move to end = highest z-index
        });
    };

    // Ref to track if model has been auto-connected (prevents duplicate connections)
    const hasAutoConnectedRef = useRef(false);

    useEffect(() => {
        if (status === 'Model Connected') {
            setHasCompletedBootstrap(true);
        }
    }, [status]);

    useEffect(() => {
        if (!isConnected || !socketConnected) {
            setHasCompletedBootstrap(false);
        }
    }, [isConnected, socketConnected]);

    const isOrbInitializing =
        isConnected &&
        (!socketConnected ||
            !isAuthenticated ||
            micDevices.length === 0 ||
            !hasCompletedBootstrap);

    // Auto-Connect Model on Start (Only after Auth and devices loaded)
    useEffect(() => {
        // Only auto-connect once: when socket connected, authenticated, and devices loaded
        if (isConnected && isAuthenticated && socketConnected && micDevices.length > 0 && !hasAutoConnectedRef.current) {
            hasAutoConnectedRef.current = true;

            // Connect to model with small delay for socket stability
            const timer = setTimeout(() => {
                setStatus('Connecting...');
                emitStartAudio({ muted: isMuted });
            }, 500);
        }
    }, [
        isConnected,
        isAuthenticated,
        socketConnected,
        micDevices,
        selectedMicId,
        emitStartAudio,
        isMuted,
        speakerDevices,
        selectedSpeakerId,
    ]);

    useEffect(() => {
        // Socket IO Setup
        socket.on('connect', () => {
            setStatus('Connected');
            setSocketConnected(true);
            setBootIntegrationsReady(false);
            socket.emit('get_settings');
            socket.emit('get_chat_history', { limit: 120 });
            socket.emit('orbital_sync_boot');
            /* Testes de integração são disparados pelo servidor no connect; aqui só o refresh periódico. */
        });
        socket.on('disconnect', () => {
            setStatus('Disconnected');
            setSocketConnected(false);
            setBootIntegrationsReady(false);
        });
        socket.on('status', (data) => {
            const msg = data?.msg ?? '';
            // Mute/Resume: só atualiza estado — chips de sistema são centrados no chat em tela cheia
            // e ficam “grudados” por cima do orbe (confunde com overlay preso).
            const skipChatChip =
                msg === 'Audio Paused' || msg === 'Audio Resumed';
            if (!skipChatChip) {
                addMessage('System', msg);
            }
            // Update status bar based on backend messages
            if (msg === 'A.D.A Started') {
                setStatus('Model Connected');
            } else if (msg === 'A.D.A Stopped') {
                setStatus('Connected');
            } else if (msg === 'Audio Paused') {
                setIsMuted(true);
            } else if (msg === 'Audio Resumed') {
                setIsMuted(false);
            }
        });
        socket.on('audio_data', (data) => {
            const nextData = Array.isArray(data?.data) ? data.data : [];
            pendingAiAudioRef.current = nextData;

            if (aiAudioFlushRafRef.current == null) {
                aiAudioFlushRafRef.current = requestAnimationFrame(() => {
                    aiAudioFlushRafRef.current = null;
                    const latest = pendingAiAudioRef.current;
                    if (latest == null) return;

                    if (aiDecayAnimationRef.current) {
                        cancelAnimationFrame(aiDecayAnimationRef.current);
                        aiDecayAnimationRef.current = null;
                    }

                    const spec = aiSpectrumRef.current;
                    if (latest.length > 0) {
                        for (let i = 0; i < latest.length; i += 1) {
                            spec[i] = latest[i];
                        }
                        for (let i = latest.length; i < spec.length; i += 1) {
                            spec[i] = 0;
                        }
                    } else {
                        for (let i = 0; i < spec.length; i += 1) {
                            spec[i] = Math.max(0, Math.floor(spec[i] * 0.9));
                        }
                    }

                    if (!isAiSpeakingRef.current) {
                        isAiSpeakingRef.current = true;
                        setIsAiSpeaking(true);
                    }
                    if (aiSilenceTimerRef.current) clearTimeout(aiSilenceTimerRef.current);
                    aiSilenceTimerRef.current = setTimeout(() => {
                        const decayDurationMs = 320;
                        const decayStart = performance.now();
                        const startSpectrum = [...aiSpectrumRef.current];

                        const runDecay = (now) => {
                            const progress = Math.min(1, (now - decayStart) / decayDurationMs);
                            const remaining = 1 - progress;
                            const factor = remaining * remaining;
                            const buf = aiSpectrumRef.current;
                            for (let i = 0; i < buf.length; i += 1) {
                                buf[i] = Math.max(0, Math.floor(startSpectrum[i] * factor));
                            }

                            if (progress < 1) {
                                aiDecayAnimationRef.current = requestAnimationFrame(runDecay);
                            } else {
                                aiDecayAnimationRef.current = null;
                                isAiSpeakingRef.current = false;
                                setIsAiSpeaking(false);
                                buf.fill(0);
                            }
                        };

                        aiDecayAnimationRef.current = requestAnimationFrame(runDecay);
                    }, 235);
                });
            }
        });
        socket.on('auth_status', (data) => {
            console.log("Auth Status:", data);
            setBootAuthReady(true);
            setIsAuthenticated(data.authenticated);
            if (data.authenticated) {
                // If authenticated, hide lock screen with animation (handled by component if visible)
                // But simpler: just hide it
                // Actually, wait for animation if it WAS visible.
                // For now, let's just assume if authenticated -> hide
                // But we want the component to invoke onAnimationComplete.
                // If we are starting up (and face auth disabled), we want it FALSE immediately.
                if (!isLockScreenVisible) {
                    // Do nothing, already hidden
                }
            } else {
                // If NOT authenticated, show lock screen
                setIsLockScreenVisible(true);
            }
        });

        socket.on('settings', (settings) => {
            console.log("[Settings] Received:", settings);
            setBootSettingsReady(true);
            if (settings && typeof settings.face_auth_enabled !== 'undefined') {
                setFaceAuthEnabled(settings.face_auth_enabled);
                localStorage.setItem('face_auth_enabled', settings.face_auth_enabled);
            }
            if (typeof settings.camera_flipped !== 'undefined') {
                console.log("[Settings] Camera flip set to:", settings.camera_flipped);
                setIsCameraFlipped(settings.camera_flipped);
            }
        });
        socket.on('error', (data) => {
            console.error("Socket Error:", data);
            setIsImageGenerating(false);
            pendingAssistantTextRef.current = '';
            addMessage('System', `Error: ${data.msg}`);
        });

        const appendTranscriptionChunk = (prev, data) => {
            const senderStr = String(data?.sender || '');
            const isAssistant =
                senderStr.toLowerCase().includes('athenas') ||
                senderStr.toLowerCase().includes('ada') ||
                senderStr.toLowerCase().includes('jarvis');
            const chunkText = typeof data?.text === 'string' ? data.text : '';
            if (isAssistant && isImageGenerationActiveRef.current) {
                if (chunkText.trim().length > 0) {
                    pendingAssistantTextRef.current = fixCollapsedPunctuation(
                        pendingAssistantTextRef.current + chunkText
                    );
                }
                return prev;
            }

            const lastMsg = prev[prev.length - 1];

            if (lastMsg && lastMsg.sender === data.sender) {
                const raw = lastMsg.text + chunkText;
                const text = isAssistant ? fixCollapsedPunctuation(raw) : raw;
                return trimChatMessages([
                    ...prev.slice(0, -1),
                    {
                        ...lastMsg,
                        text,
                    },
                ]);
            }
            const text = isAssistant ? fixCollapsedPunctuation(chunkText) : chunkText;
            return trimChatMessages([
                ...prev,
                {
                    id: createMessageId('stream'),
                    sender: data.sender,
                    text,
                    time: new Date().toLocaleTimeString(),
                },
            ]);
        };

        const flushTranscriptionChunks = () => {
            transcriptionFlushTimerRef.current = null;
            if (!pendingTranscriptionChunksRef.current.length) return;
            const currentSender = pendingTranscriptionChunksRef.current[0]?.sender;
            const chunksPerTick = transcriptionChunksPerTickForSender(currentSender);
            const chunks = pendingTranscriptionChunksRef.current.splice(0, chunksPerTick);
            setMessages((prev) => {
                let next = prev;
                for (const chunk of chunks) {
                    next = appendTranscriptionChunk(next, chunk);
                }
                return next;
            });
            if (pendingTranscriptionChunksRef.current.length > 0) {
                const lastEmittedChunk = chunks[chunks.length - 1] || pendingTranscriptionChunksRef.current[0];
                const delay = transcriptionFlushDelayForChunk(
                    lastEmittedChunk,
                    pendingTranscriptionChunksRef.current.length
                );
                transcriptionFlushTimerRef.current = setTimeout(flushTranscriptionChunks, delay);
            }
        };

        const scheduleTranscriptionFlush = () => {
            if (transcriptionFlushTimerRef.current != null) return;
            const firstChunk = pendingTranscriptionChunksRef.current[0];
            const delay = transcriptionFlushDelayForChunk(firstChunk, pendingTranscriptionChunksRef.current.length);
            transcriptionFlushTimerRef.current = setTimeout(flushTranscriptionChunks, delay);
        };

        // Transcrição em micro-lotes temporizados: entrada mais suave no chat.
        socket.on('transcription', (data) => {
            const sender = String(data?.sender || '');
            const text = String(data?.text || '');
            const pieces = splitTranscriptionForSmoothUI(sender, text);
            if (!pieces.length) return;
            pendingTranscriptionChunksRef.current.push(...pieces);
            if (pendingTranscriptionChunksRef.current.length > 600) {
                pendingTranscriptionChunksRef.current = pendingTranscriptionChunksRef.current.slice(-400);
            }
            scheduleTranscriptionFlush();
        });

        // Handle tool confirmation requests
        socket.on('tool_confirmation_request', (data) => {
            console.log("Received Confirmation Request:", data);
            setConfirmationRequest(data);
        });

        socket.on('assistant_calendar', (payload) => {
            if (payload?.event === 'google_event_removed') {
                const gid = typeof payload?.google_event_id === 'string' ? payload.google_event_id.trim() : '';
                if (!gid) return;
                setAgendaReminders((prev) => prev.filter((r) => r.googleEventId !== gid));
                setGoogleAgendaEvents((prev) =>
                    prev.filter((r) => r.googleEventId !== gid && r.id !== `gcal-${gid}`)
                );
                return;
            }
            if (payload?.event !== 'reminder_added') return;
            const id = payload?.id;
            const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
            const ms = Number(payload?.starts_at_ms);
            if (!id || !title || !Number.isFinite(ms)) return;
            const gel =
                typeof payload?.google_event_id === 'string' && payload.google_event_id.trim()
                    ? payload.google_event_id.trim()
                    : undefined;
            setAgendaReminders((prev) => {
                const row = { id, title, startsAtMs: ms };
                if (gel) row.googleEventId = gel;
                const next = [...prev.filter((r) => r.id !== id), row].sort((a, b) => a.startsAtMs - b.startsAtMs);
                return next.length > AGENDA_MAX_ITEMS ? next.slice(0, AGENDA_MAX_ITEMS) : next;
            });
            setAgendaPanelOpen(true);
        });

        socket.on('agenda_google_sync_result', (p) => {
            setGoogleAgendaLoading(false);
            if (!p?.ok) {
                setGoogleAgendaError(String(p?.message || 'Falha ao sincronizar com Google Calendar.'));
                return;
            }
            const raw = Array.isArray(p.events) ? p.events : [];
            const cleaned = raw
                .filter(
                    (e) =>
                        e &&
                        typeof e.id === 'string' &&
                        typeof e.title === 'string' &&
                        Number.isFinite(e.startsAtMs)
                )
                .slice(0, 400);
            setGoogleAgendaEvents(cleaned);
            setGoogleAgendaError('');
        });

        socket.on('assistant_timer', (payload) => {
            const ev = payload?.event;
            if (ev === 'started') {
                stopTimerAlarm();
                const id = payload?.id;
                if (!id) return;
                const rawEnd = payload?.ends_at;
                const dur = Number(payload?.duration_seconds);
                const endsAt =
                    typeof rawEnd === 'number' && Number.isFinite(rawEnd)
                        ? rawEnd * 1000
                        : Date.now() + (Number.isFinite(dur) ? dur * 1000 : 60_000);
                const label = typeof payload?.label === 'string' ? payload.label : '';
                const totalMs =
                    Number.isFinite(dur) && dur > 0
                        ? dur * 1000
                        : Math.max(1000, endsAt - Date.now());
                setAssistantTimers((prev) => [
                    ...prev.filter((t) => !t.ringing && t.id !== id),
                    { id, label, endsAt, totalMs },
                ]);
            } else if (ev === 'finished') {
                const id = payload?.id;
                startTimerAlarm(selectedSpeakerIdRef.current || undefined);
                const label = typeof payload?.label === 'string' ? payload.label : '';
                setAssistantTimers((prev) => {
                    if (id && prev.some((x) => x.id === id)) {
                        return prev.map((x) =>
                            x.id === id
                                ? { ...x, ringing: true, endsAt: Date.now() }
                                : x
                        );
                    }
                    if (id) {
                        return [
                            ...prev,
                            {
                                id,
                                label,
                                endsAt: Date.now(),
                                totalMs: 1000,
                                ringing: true,
                            },
                        ];
                    }
                    return [
                        ...prev,
                        {
                            id: `alarm-${Date.now()}`,
                            label: '',
                            endsAt: Date.now(),
                            totalMs: 1000,
                            ringing: true,
                        },
                    ];
                });
            }
        });

        socket.on('project_update', (data) => {
            console.log("Project Update:", data.project);
            setCurrentProject(data.project);
            addMessage('System', `Switched to project: ${data.project}`);
            socket.emit('get_chat_history', { limit: 120 });
        });

        socket.on('chat_history', (data) => {
            const rawMessages = Array.isArray(data?.messages) ? data.messages : [];
            const normalized = rawMessages
                .map((entry) => {
                    const rawSender = entry?.sender || 'System';
                    const sender = rawSender === 'User' ? 'You' : rawSender;
                    const text = typeof entry?.text === 'string' ? entry.text : '';
                    const timestamp = Number(entry?.timestamp);
                    const time = Number.isFinite(timestamp)
                        ? new Date(timestamp * 1000).toLocaleTimeString()
                        : new Date().toLocaleTimeString();
                    const mimeType = entry?.mime_type || entry?.mimeType || 'image/png';
                    const rel = typeof entry?.image_relpath === 'string' ? entry.image_relpath.trim() : '';
                    let image = null;
                    if (rel) {
                        const q = encodeURIComponent(rel);
                        image = {
                            mime_type: mimeType,
                            url: `${BACKEND_ORIGIN}/api/comfyui-image?relpath=${q}`,
                        };
                    }
                    return { sender, text, time, ...(image ? { image } : {}) };
                })
                .filter((msg) => msg.text.trim().length > 0 || msg.image);

            setMessages(
                trimChatMessages(
                    normalized.map((msg) => ({ ...msg, id: createMessageId('history') }))
                )
            );
            setBootHistoryReady(true);
        });

        socket.on('image_generated', (data) => {
            console.log('[APP] image_generated', { mime_type: data?.mime_type, has_data: Boolean(data?.data) });
            const pendingAssistantText = pendingAssistantTextRef.current;
            pendingAssistantTextRef.current = '';
            setIsImageGenerating(false);
            const mimeType = data?.mime_type || data?.mimeType || 'image/png';
            const imageData = data?.data;
            const caption = data?.caption || 'Imagem gerada';

            if (!imageData) return;

            const rel = typeof data?.image_relpath === 'string' ? data.image_relpath.trim() : '';
            const imagePayload = rel
                ? {
                    mime_type: mimeType,
                    data: imageData,
                    url: `${BACKEND_ORIGIN}/api/comfyui-image?relpath=${encodeURIComponent(rel)}`,
                }
                : { mime_type: mimeType, data: imageData };

            // Mensagem com imagem como ATHENAS (não System): no chat, System + imagem usa
            // justify-center e a foto “flutua” no meio do ecrã; assistente fica à esquerda no fio.
            setMessages(prev =>
                trimChatMessages([
                    ...prev,
                    ...(pendingAssistantText && pendingAssistantText.trim().length > 0
                        ? [{
                            id: createMessageId('image-caption'),
                            sender: 'ATHENAS',
                            text: pendingAssistantText.trim(),
                            time: new Date().toLocaleTimeString()
                        }]
                        : []),
                    {
                        id: createMessageId('image'),
                        sender: 'ATHENAS',
                        text: caption,
                        time: new Date().toLocaleTimeString(),
                        image: imagePayload,
                    }
                ])
            );
        });

        socket.on('image_generation_started', (data) => {
            console.log('[APP] image_generation_started', data);
            pendingAssistantTextRef.current = '';
            setIsImageGenerating(true);
            const cap = data?.caption || 'Gerando imagem...';
            setImageGeneratingCaption(cap);
        });



        // Get All Media Devices (Microphones, Speakers, Webcams)
        navigator.mediaDevices.enumerateDevices().then(devs => {
            const audioInputs = devs.filter(d => d.kind === 'audioinput');
            const audioOutputs = devs.filter(d => d.kind === 'audiooutput');
            const videoInputs = devs.filter(d => d.kind === 'videoinput');

            setMicDevices(audioInputs);
            setSpeakerDevices(audioOutputs);
            setWebcamDevices(videoInputs);

            // Restore saved microphone or use first available
            const savedMicId = localStorage.getItem('selectedMicId');
            if (savedMicId && audioInputs.some(d => d.deviceId === savedMicId)) {
                setSelectedMicId(savedMicId);
            } else if (audioInputs.length > 0) {
                setSelectedMicId(audioInputs[0].deviceId);
            }

            // Restore saved speaker or use first available
            const savedSpeakerId = localStorage.getItem('selectedSpeakerId');
            if (savedSpeakerId && audioOutputs.some(d => d.deviceId === savedSpeakerId)) {
                setSelectedSpeakerId(savedSpeakerId);
            } else if (audioOutputs.length > 0) {
                setSelectedSpeakerId(audioOutputs[0].deviceId);
            }

            // Restore saved webcam or use first available
            const savedWebcamId = localStorage.getItem('selectedWebcamId');
            if (savedWebcamId && videoInputs.some(d => d.deviceId === savedWebcamId)) {
                setSelectedWebcamId(savedWebcamId);
            } else if (videoInputs.length > 0) {
                setSelectedWebcamId(videoInputs[0].deviceId);
            }
        }).catch(() => {
            /* permissão negada ou API indisponível — libera o boot mesmo assim */
        }).finally(() => {
            setBootMediaReady(true);
        });

        /* Socket já conectado antes dos listeners (hot reload / race): sincronizar de novo. */
        if (socket.connected) {
            setSocketConnected(true);
            setStatus('Connected');
            socket.emit('get_settings');
            socket.emit('get_chat_history', { limit: 120 });
            socket.emit('orbital_sync_boot');
            socket.emit('test_integrations');
        }

        // Initialize Hand Landmarker
        const initHandLandmarker = async () => {
            try {
                console.log("Initializing HandLandmarker...");

                // 1. Verify Model File
                console.log("Fetching model file...");
                const response = await fetch('/hand_landmarker.task');
                if (!response.ok) {
                    throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
                }
                console.log("Model file found:", response.headers.get('content-type'), response.headers.get('content-length'));

                // 2. Initialize Vision
                console.log("Initializing FilesetResolver...");
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                console.log("FilesetResolver initialized.");

                // 3. Create Landmarker
                console.log("Creating HandLandmarker (GPU)...");
                handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `/hand_landmarker.task`,
                        delegate: "GPU" // Enable GPU acceleration
                    },
                    runningMode: "VIDEO",
                    numHands: 1
                });
                console.log("HandLandmarker initialized successfully!");
                // addMessage('System', 'Hand Tracking Ready');

            } catch (error) {
                console.error("Failed to initialize HandLandmarker:", error);
                addMessage('System', `Hand Tracking Error: ${error.message}`);
            }
        };
        initHandLandmarker();

        return () => {
            stopTimerAlarm();
            socket.off('connect');
            socket.off('disconnect');
            socket.off('status');
            socket.off('audio_data');
            socket.off('auth_status');
            socket.off('settings');
            socket.off('transcription');
            socket.off('tool_confirmation_request');
            socket.off('assistant_timer');
            socket.off('assistant_calendar');
            socket.off('agenda_google_sync_result');
            socket.off('project_update');
            socket.off('chat_history');
            socket.off('image_generation_started');
            socket.off('image_generated');
            socket.off('error');

            if (aiSilenceTimerRef.current) {
                clearTimeout(aiSilenceTimerRef.current);
                aiSilenceTimerRef.current = null;
            }

            if (aiDecayAnimationRef.current) {
                cancelAnimationFrame(aiDecayAnimationRef.current);
                aiDecayAnimationRef.current = null;
            }

            if (aiAudioFlushRafRef.current) {
                cancelAnimationFrame(aiAudioFlushRafRef.current);
                aiAudioFlushRafRef.current = null;
            }
            pendingAiAudioRef.current = null;

            if (transcriptionFlushTimerRef.current) {
                clearTimeout(transcriptionFlushTimerRef.current);
                transcriptionFlushTimerRef.current = null;
            }
            pendingTranscriptionChunksRef.current = [];

            stopMicVisualizer();
            stopVideo();
        };
    }, []);

    /** Estado do Cloudflare Tunnel vindo do processo principal (Electron). */
    useEffect(() => {
        let fallbackTimer;
        const hasElectron = typeof window !== 'undefined' && typeof window.require === 'function';
        if (!hasElectron) {
            setCloudflaredBoot('standalone');
            return undefined;
        }
        try {
            const { ipcRenderer } = window.require('electron');
            if (!ipcRenderer?.on) {
                setCloudflaredBoot('standalone');
                return undefined;
            }
            const handler = (_e, payload) => {
                const st = payload?.cloudflared;
                if (st === 'skipped' || st === 'running' || st === 'unavailable') {
                    setCloudflaredBoot(st);
                }
            };
            ipcRenderer.on('orbital-boot-electron', handler);
            fallbackTimer = setTimeout(() => {
                setCloudflaredBoot((prev) => (prev === 'pending' ? 'unavailable' : prev));
            }, 5000);
            return () => {
                clearTimeout(fallbackTimer);
                ipcRenderer.removeListener('orbital-boot-electron', handler);
            };
        } catch {
            setCloudflaredBoot('standalone');
            return undefined;
        }
    }, []);

    useEffect(() => {
        const onIntegrationTestResult = (payload) => {
            if (!payload || payload.ok === false) {
                setIntegrationHealth({
                    supabase: { tier: 'down' },
                    comfyui: { tier: 'down' },
                    webhooks: { tier: 'down' },
                });
            } else {
                const r = payload.results || {};
                setIntegrationHealth({
                    supabase: { tier: r.supabase?.tier || 'down' },
                    comfyui: { tier: r.comfyui?.tier || 'down' },
                    webhooks: { tier: r.webhooks?.tier || 'down' },
                });
            }
            setBootIntegrationsReady(true);
        };
        socket.on('integration_test_result', onIntegrationTestResult);
        return () => socket.off('integration_test_result', onIntegrationTestResult);
    }, []);

    useEffect(() => {
        if (!socketConnected) {
            return undefined;
        }
        const id = window.setInterval(() => socket.emit('test_integrations'), 60_000);
        return () => window.clearInterval(id);
    }, [socketConnected]);

    // Persist device selections to localStorage when they change
    useEffect(() => {
        if (selectedMicId) {
            localStorage.setItem('selectedMicId', selectedMicId);
            console.log('[Settings] Saved microphone:', selectedMicId);
        }
    }, [selectedMicId]);

    useEffect(() => {
        if (selectedSpeakerId) {
            localStorage.setItem('selectedSpeakerId', selectedSpeakerId);
            console.log('[Settings] Saved speaker:', selectedSpeakerId);
        }
    }, [selectedSpeakerId]);

    useEffect(() => {
        if (selectedWebcamId) {
            localStorage.setItem('selectedWebcamId', selectedWebcamId);
            console.log('[Settings] Saved webcam:', selectedWebcamId);
        }
    }, [selectedWebcamId]);

    // Start/Stop Mic Visualizer
    useEffect(() => {
        if (selectedMicId) {
            startMicVisualizer(selectedMicId);
        }
    }, [selectedMicId]);

    const startMicVisualizer = async (deviceId) => {
        stopMicVisualizer();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: deviceId } }
            });

            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 64;
            analyserRef.current.smoothingTimeConstant = 0.65;

            sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
            const gainNode = audioContextRef.current.createGain();
            gainNode.gain.value = Math.min(4, Math.max(0.25, micInputGainRef.current ?? 1));
            micGainNodeRef.current = gainNode;
            sourceRef.current.connect(gainNode);
            gainNode.connect(analyserRef.current);

            const updateMicData = () => {
                if (!analyserRef.current) return;
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);
                const buf = micSpectrumRef.current;
                for (let i = 0; i < dataArray.length; i += 1) {
                    buf[i] = dataArray[i];
                }
                animationFrameRef.current = requestAnimationFrame(updateMicData);
            };

            updateMicData();
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    };

    const stopMicVisualizer = () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (sourceRef.current) {
            try {
                sourceRef.current.disconnect();
            } catch {
                /* ignore */
            }
        }
        if (micGainNodeRef.current) {
            try {
                micGainNodeRef.current.disconnect();
            } catch {
                /* ignore */
            }
            micGainNodeRef.current = null;
        }
        if (audioContextRef.current) {
            try {
                audioContextRef.current.close();
            } catch {
                /* ignore */
            }
        }
        sourceRef.current = null;
        analyserRef.current = null;
        audioContextRef.current = null;
    };

    const startVideo = async () => {
        try {
            // Request 1080p resolution with selected webcam
            const constraints = {
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    aspectRatio: 16 / 9
                }
            };

            // Use selected webcam if available
            if (selectedWebcamId) {
                constraints.video.deviceId = { exact: selectedWebcamId };
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }

            // Initialize the transmission canvas
            if (!transmissionCanvasRef.current) {
                transmissionCanvasRef.current = document.createElement('canvas');
                transmissionCanvasRef.current.width = 640;
                transmissionCanvasRef.current.height = 360;
                console.log("Initialized transmission canvas (640x360)");
            }

            setIsVideoOn(true);
            isVideoOnRef.current = true; // Update ref for loop

            console.log("Starting video loop with webcam:", selectedWebcamId || "default");
            requestAnimationFrame(predictWebcam);

        } catch (err) {
            console.error("Error accessing camera:", err);
            addMessage('System', 'Error accessing camera');
        }
    };

    const predictWebcam = () => {
        const loopNow = performance.now();
        // Hard cap: reduz custo do loop (especialmente canvas + hand detect).
        if (loopNow - lastPredictMsRef.current < 33) {
            requestAnimationFrame(predictWebcam);
            return;
        }
        lastPredictMsRef.current = loopNow;

        // Use ref for checking state to avoid closure staleness
        if (!videoRef.current || !canvasRef.current || !isVideoOnRef.current) {
            return;
        }

        // Check if video has valid dimensions to prevent MediaPipe crash
        if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
            requestAnimationFrame(predictWebcam);
            return;
        }

        // 1. Draw Video to Local Display Canvas (fixed resolution, lighter)
        const ctx = canvasRef.current.getContext('2d');
        const DISPLAY_W = 640;
        const DISPLAY_H = 360;
        if (canvasRef.current.width !== DISPLAY_W) canvasRef.current.width = DISPLAY_W;
        if (canvasRef.current.height !== DISPLAY_H) canvasRef.current.height = DISPLAY_H;
        ctx.drawImage(videoRef.current, 0, 0, DISPLAY_W, DISPLAY_H);

        // 2. Send Frame to Backend (Throttled & Resized)
        // Only send if connected
        if (isConnected) {
            // Simple throttle: every 5th frame roughly
            if (frameCountRef.current % 5 === 0) {

                // Use dedicated transmission canvas for resizing
                const transCanvas = transmissionCanvasRef.current;
                if (transCanvas) {
                    const transCtx = transCanvas.getContext('2d');
                    // Draw resized image
                    transCtx.drawImage(videoRef.current, 0, 0, transCanvas.width, transCanvas.height);

                    // Convert resized image to blob
                    transCanvas.toBlob((blob) => {
                        if (blob) {
                            socket.emit('video_frame', { image: blob });
                        }
                    }, 'image/jpeg', 0.6); // Slightly higher compression for speed
                }
            }
        }


        // 3. Hand Tracking
        let startTimeMs = loopNow;
        // Use Ref for toggle check
        if (isHandTrackingEnabledRef.current && handLandmarkerRef.current && videoRef.current.currentTime !== lastVideoTimeRef.current) {
            const HAND_DETECT_MIN_MS = 80; // ~12.5 FPS
            if (loopNow - lastHandDetectMsRef.current >= HAND_DETECT_MIN_MS) {
                lastHandDetectMsRef.current = loopNow;
                lastVideoTimeRef.current = videoRef.current.currentTime;
                const results = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

                if (results.landmarks && results.landmarks.length > 0) {
                    const landmarks = results.landmarks[0];

                    // Index Finger Tip (8)
                    const indexTip = landmarks[8];
                    // Thumb Tip (4)
                    const thumbTip = landmarks[4];

                    // Map to Screen Coords with Sensitivity Scaling
                    // Sensitivity: Map center 50% of camera to 100% of screen.
                    const SENSITIVITY = cursorSensitivityRef.current;

                    // Apply camera flip if enabled (horizontal mirror)
                    const rawX = isCameraFlippedRef.current ? (1 - indexTip.x) : indexTip.x;

                    // 1. Normalize and Scale X
                    let normX = (rawX - 0.5) * SENSITIVITY + 0.5;
                    // Clamp to [0, 1]
                    normX = Math.max(0, Math.min(1, normX));

                    // 2. Normalize and Scale Y
                    let normY = (indexTip.y - 0.5) * SENSITIVITY + 0.5;
                    normY = Math.max(0, Math.min(1, normY));

                    const targetX = normX * window.innerWidth;
                    const targetY = normY * window.innerHeight;

                    // 1. Smoothing (Lerp)
                    // Factor 0.2 = smooth but responsive. Lower = smoother/slower.
                    const lerpFactor = 0.2;
                    smoothedCursorPosRef.current.x = smoothedCursorPosRef.current.x + (targetX - smoothedCursorPosRef.current.x) * lerpFactor;
                    smoothedCursorPosRef.current.y = smoothedCursorPosRef.current.y + (targetY - smoothedCursorPosRef.current.y) * lerpFactor;

                    let finalX = smoothedCursorPosRef.current.x;
                    let finalY = smoothedCursorPosRef.current.y;

                    // 2. Snap-to-Button Logic
                    const SNAP_THRESHOLD = 50; // Pixels to snap
                    const UNSNAP_THRESHOLD = 100; // Pixels to unsnap (Hysteresis)

                    if (snapStateRef.current.isSnapped) {
                        // Check if we should unsnap
                        const dist = Math.sqrt(
                            Math.pow(finalX - snapStateRef.current.snapPos.x, 2) +
                            Math.pow(finalY - snapStateRef.current.snapPos.y, 2)
                        );

                        if (dist > UNSNAP_THRESHOLD) {
                            // REMOVE HIGHLIGHT
                            if (snapStateRef.current.element) {
                                snapStateRef.current.element.classList.remove('snap-highlight');
                                snapStateRef.current.element.style.boxShadow = '';
                                snapStateRef.current.element.style.backgroundColor = '';
                                snapStateRef.current.element.style.borderColor = '';
                            }

                            snapStateRef.current = { isSnapped: false, element: null, snapPos: { x: 0, y: 0 } };
                        } else {
                            // Stay snapped
                            finalX = snapStateRef.current.snapPos.x;
                            finalY = snapStateRef.current.snapPos.y;
                        }
                    } else {
                        // Check if we should snap
                        // Find all interactive elements
                        if (loopNow - lastSnapTargetsUpdateMsRef.current > 1000) {
                            snapTargetsRef.current = Array.from(
                                document.querySelectorAll('button, input, select, .draggable'),
                            );
                            lastSnapTargetsUpdateMsRef.current = loopNow;
                        }
                        const targets = snapTargetsRef.current;
                        let closest = null;
                        let minDist = Infinity;

                        for (const el of targets) {
                            const rect = el.getBoundingClientRect();
                            const centerX = rect.left + rect.width / 2;
                            const centerY = rect.top + rect.height / 2;
                            const dist = Math.sqrt(Math.pow(finalX - centerX, 2) + Math.pow(finalY - centerY, 2));

                            if (dist < minDist) {
                                minDist = dist;
                                closest = { el, centerX, centerY };
                            }
                        }

                        if (closest && minDist < SNAP_THRESHOLD) {
                            snapStateRef.current = {
                                isSnapped: true,
                                element: closest.el,
                                snapPos: { x: closest.centerX, y: closest.centerY }
                            };
                            finalX = closest.centerX;
                            finalY = closest.centerY;

                            // SNAP HIGHLIGHT Logic
                            closest.el.classList.add('snap-highlight');
                            // Add some inline style for the glow if class isn't enough (using imperative for speed)
                            closest.el.style.boxShadow = '0 0 20px rgba(34, 211, 238, 0.6)';
                            closest.el.style.backgroundColor = 'rgba(6, 182, 212, 0.2)';
                            closest.el.style.borderColor = 'rgba(34, 211, 238, 1)';
                        }
                    }

                    // Evita re-render pesado a cada frame.
                    const lastCursor = lastCursorPosRef.current;
                    const shouldUpdateCursor =
                        loopNow - lastCursorUpdateMsRef.current > 60 ||
                        Math.abs(finalX - lastCursor.x) > 2 ||
                        Math.abs(finalY - lastCursor.y) > 2;
                    if (shouldUpdateCursor) {
                        lastCursorUpdateMsRef.current = loopNow;
                        setCursorPos({ x: finalX, y: finalY });
                    }

                    // Trail Logic: Removed per user request

                    // Pinch Detection (Distance between Index and Thumb)
                    const distance = Math.sqrt(
                        Math.pow(indexTip.x - thumbTip.x, 2) + Math.pow(indexTip.y - thumbTip.y, 2)
                    );

                    const isPinchNow = distance < 0.05; // Threshold
                    if (isPinchNow && !isPinching) {
                        // Evita clique sintético com as configurações abertas (interfere nos switches nativos)
                        if (!showSettingsRef.current) {
                            const el = document.elementFromPoint(finalX, finalY);
                            if (el) {
                                const clickable = el.closest('button, input, a, [role="button"]');
                                if (clickable && typeof clickable.click === 'function') {
                                    clickable.click();
                                } else if (typeof el.click === 'function') {
                                    el.click();
                                }
                            }
                        }
                    }
                    if (isPinchNow !== lastPinchRef.current) {
                        lastPinchRef.current = isPinchNow;
                        setIsPinching(isPinchNow);
                    }

                    // Fist Detection for Gesture-Based Dragging (Popup Windows Only)
                    // Detects if all fingers are folded (tips closer to wrist than MCPs)
                    const isFingerFolded = (tipIdx, mcpIdx) => {
                        const tip = landmarks[tipIdx];
                        const mcp = landmarks[mcpIdx];
                        const wrist = landmarks[0];
                        const distTip = Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
                        const distMcp = Math.sqrt(Math.pow(mcp.x - wrist.x, 2) + Math.pow(mcp.y - wrist.y, 2));
                        return distTip < distMcp; // Folded if tip is closer
                    };

                    const isFist = isFingerFolded(8, 5) && isFingerFolded(12, 9) && isFingerFolded(16, 13) && isFingerFolded(20, 17);

                    // Get wrist position in screen coordinates (stable reference for fist gesture)
                    const wrist = landmarks[0];
                    const wristRawX = isCameraFlippedRef.current ? (1 - wrist.x) : wrist.x;
                    const wristNormX = Math.max(0, Math.min(1, (wristRawX - 0.5) * SENSITIVITY + 0.5));
                    const wristNormY = Math.max(0, Math.min(1, (wrist.y - 0.5) * SENSITIVITY + 0.5));
                    const wristScreenX = wristNormX * window.innerWidth;
                    const wristScreenY = wristNormY * window.innerHeight;

                    if (isFist) {
                        if (!activeDragElementRef.current) {
                            // Only check popup windows (draggable elements)
                            const draggableElements = [];

                            for (const id of draggableElements) {
                                const el = document.getElementById(id);
                                if (el) {
                                    const rect = el.getBoundingClientRect();
                                    // Use the cursor position from before fist was made for hit detection
                                    if (finalX >= rect.left && finalX <= rect.right && finalY >= rect.top && finalY <= rect.bottom) {
                                        activeDragElementRef.current = id;
                                        bringToFront(id);
                                        // Lock the initial wrist position when starting drag
                                        lastWristPosRef.current = { x: wristScreenX, y: wristScreenY };
                                        break;
                                    }
                                }
                            }
                        }

                        if (activeDragElementRef.current) {
                            // Use WRIST movement (not index finger) for stable dragging
                            // The wrist doesn't move when making a fist
                            const dx = wristScreenX - lastWristPosRef.current.x;
                            const dy = wristScreenY - lastWristPosRef.current.y;

                            // Update position only if there's actual movement
                            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                                updateElementPosition(activeDragElementRef.current, dx, dy);
                            }

                            // Update last wrist position
                            lastWristPosRef.current = { x: wristScreenX, y: wristScreenY };
                        }
                    } else {
                        activeDragElementRef.current = null;
                    }

                    // Sync state for visual feedback (only on change)
                    if (activeDragElementRef.current !== lastActiveDragElementRef.current) {
                        setActiveDragElement(activeDragElementRef.current);
                        lastActiveDragElementRef.current = activeDragElementRef.current;
                    }

                    lastCursorPosRef.current = { x: finalX, y: finalY };

                    // Draw Skeleton
                    drawSkeleton(ctx, landmarks);
                }

            }

        }

        // 4. FPS Calculation
        const now = performance.now();
        frameCountRef.current++;
        if (now - lastFrameTimeRef.current >= 1000) {
            setFps(frameCountRef.current);
            frameCountRef.current = 0;
            lastFrameTimeRef.current = now;
        }

        if (isVideoOnRef.current) {
            requestAnimationFrame(predictWebcam);
        }
    };

    const drawSkeleton = (ctx, landmarks) => {
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 2;

        // Connections
        const connections = HandLandmarker.HAND_CONNECTIONS;
        for (const connection of connections) {
            const start = landmarks[connection.start];
            const end = landmarks[connection.end];
            ctx.beginPath();
            ctx.moveTo(start.x * canvasRef.current.width, start.y * canvasRef.current.height);
            ctx.lineTo(end.x * canvasRef.current.width, end.y * canvasRef.current.height);
            ctx.stroke();
        }
    };

    const stopVideo = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsVideoOn(false);
        isVideoOnRef.current = false; // Update ref
        setFps(0);
    };

    const toggleVideo = () => {
        if (isVideoOn) {
            stopVideo();
        } else {
            startVideo();
        }
    };

    const addMessage = (sender, text, extra = {}) => {
        setMessages((prev) =>
            trimChatMessages([
                ...prev,
                { id: createMessageId('message'), sender, text, time: new Date().toLocaleTimeString(), ...extra },
            ])
        );
    };

    const dismissTimerAlarm = useCallback(() => {
        stopTimerAlarm();
        setAssistantTimers((prev) => prev.filter((t) => !t.ringing));
    }, []);

    const requestGoogleAgendaMonth = useCallback((year, month) => {
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return;
        setGoogleAgendaLoading(true);
        setGoogleAgendaError('');
        socket.emit('agenda_google_sync', { year, month });
    }, []);

    const agendaDisplayReminders = useMemo(
        () => mergeAgendaLocalsWithGoogle(agendaReminders, googleAgendaEvents),
        [agendaReminders, googleAgendaEvents],
    );

    const removeAgendaReminder = useCallback(
        (id) => {
            const row =
                agendaDisplayReminders.find((r) => r.id === id) ||
                googleAgendaEvents.find((r) => r.id === id) ||
                agendaReminders.find((r) => r.id === id);
            let gvid = row?.googleEventId;
            if (!gvid && typeof id === 'string' && id.startsWith('gcal-')) {
                gvid = id.slice(5);
            }
            if (gvid) {
                socket.emit('agenda_google_delete_event', { event_id: gvid });
            }
            if (typeof id === 'string' && id.startsWith('gcal-')) {
                setGoogleAgendaEvents((prev) => prev.filter((r) => r.id !== id));
                return;
            }
            setAgendaReminders((prev) => prev.filter((r) => r.id !== id));
        },
        [agendaDisplayReminders, googleAgendaEvents, agendaReminders],
    );

    const addBrazilNationalHolidays = useCallback((year) => {
        const y = Number(year);
        if (!Number.isInteger(y) || y < 1900 || y > 2400) return;
        const holidays = buildBrazilNationalHolidays(y).map((h) => ({
            id: `holiday-br-${y}-${h.key}`,
            title: h.title,
            startsAtMs: h.startsAtMs,
        }));
        setAgendaReminders((prev) => {
            const merged = [...prev];
            for (const h of holidays) {
                const idx = merged.findIndex((x) => x.id === h.id);
                if (idx >= 0) merged[idx] = h;
                else merged.push(h);
            }
            merged.sort((a, b) => a.startsAtMs - b.startsAtMs);
            return merged.length > AGENDA_MAX_ITEMS ? merged.slice(0, AGENDA_MAX_ITEMS) : merged;
        });
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(AGENDA_STORAGE_KEY, JSON.stringify(agendaReminders));
        } catch (e) {
            console.warn('[agenda] persist failed', e);
        }
    }, [agendaReminders]);


    const togglePower = () => {
        if (isConnected) {
            socket.emit('stop_audio');
            setIsConnected(false);
            setIsMuted(false); // Reset mute state
        } else {
            emitStartAudio({ muted: false });
            setIsConnected(true);
            setIsMuted(false); // Start unmuted
        }
    };

    const toggleMute = () => {
        if (!isConnected) return; // Can't mute if not connected

        if (isMuted) {
            socket.emit('resume_audio');
            setIsMuted(false);
        } else {
            socket.emit('pause_audio');
            setIsMuted(true);
        }
    };

    const handleSend = (e) => {
        if (e.key !== 'Enter') return;
        if (e.shiftKey) return;
        e.preventDefault?.();
        const text = inputValue.trim();
        if (!text && !chatImageAttachment) return;
        if (!socket.connected) {
            addMessage('System', 'Sem conexão com o servidor (backend).');
            return;
        }
        const payload = { text: text || '' };
        if (chatImageAttachment) {
            payload.image_b64 = chatImageAttachment.b64;
            payload.mime_type = chatImageAttachment.mime;
        }
        socket.emit('user_input', payload);
        if (chatImageAttachment) {
            addMessage('You', text || '📷 Imagem anexada', {
                image: {
                    mime_type: chatImageAttachment.mime,
                    data: chatImageAttachment.b64,
                },
            });
        } else {
            addMessage('You', text);
        }
        setInputValue('');
        setChatImageAttachment(null);
    };

    const handleMinimize = () => ipcRenderer.send('window-minimize');
    const handleMaximize = () => ipcRenderer.send('window-maximize');

    // Close Application - memory is now actively saved to project, no prompt needed
    const handleCloseRequest = () => {
        // Emit shutdown signal to backend for graceful shutdown
        // Use volatile emit with timeout fallback to ensure window closes even if server is unresponsive
        const closeWindow = () => ipcRenderer.send('window-close');

        if (socket.connected) {
            console.log('[APP] Sending shutdown signal to backend...');
            socket.emit('shutdown', {}, (ack) => {
                // This callback may not be called if server uses os._exit
                console.log('[APP] Shutdown acknowledged');
                closeWindow();
            });
            // Fallback: close after 500ms if ack doesn't come back
            setTimeout(closeWindow, 500);
        } else {
            // Socket not connected, just close
            closeWindow();
        }
    };

    // Memory upload removed (memory subsystem disabled).

    const handleConfirmTool = () => {
        if (confirmationRequest) {
            if (confirmationRequest.tool === 'generate_image') {
                setIsImageGenerating(true);
                pendingAssistantTextRef.current = '';
                const prompt = confirmationRequest?.args?.prompt;
                // Mostra o texto completo ou só um fallback curto (evita texto gigante no overlay)
                const shortCaption = typeof prompt === 'string' && prompt.trim().length > 0
                    ? 'Gerando imagem...'
                    : 'Gerando imagem...';
                setImageGeneratingCaption(shortCaption);
            }
            socket.emit('confirm_tool', { id: confirmationRequest.id, confirmed: true });
            setConfirmationRequest(null);
        }
    };

    const handleDenyTool = () => {
        if (confirmationRequest) {
            if (confirmationRequest.tool === 'generate_image') {
                setIsImageGenerating(false);
                pendingAssistantTextRef.current = '';
            }
            socket.emit('confirm_tool', { id: confirmationRequest.id, confirmed: false });
            setConfirmationRequest(null);
        }
    };

    // Updated Bounds Checking Logic
    const updateElementPosition = (id, dx, dy) => {
        setElementPositions(prev => {
            const currentPos = prev[id];
            const size = elementSizes[id] || { w: 100, h: 100 }; // Fallback
            let newX = currentPos.x + dx;
            let newY = currentPos.y + dy;

            // Bounds Logic
            // Depends on anchor point.
            // Most floating panels use translate(-50%, -50%) (center anchor)
            // Chat: translate(-50%, 0) -> Top-Center Anchor
            // Video: Top-Left Anchor (default div)

            const width = window.innerWidth;
            const height = window.innerHeight;
            const margin = 0; // Strict bounds

            if (id === 'chat') {
                // Anchor: Top-Center (x is center, y is top)
                // X Bounds: size.w/2 <= x <= width - size.w/2
                newX = Math.max(size.w / 2 + margin, Math.min(width - size.w / 2 - margin, newX));
                // Y Bounds: 0 <= y <= height - size.h
                newY = Math.max(margin, Math.min(height - size.h - margin, newY));

            } else if (id === 'video') {
                // Anchor: Top-Left
                newX = Math.max(margin, Math.min(width - size.w - margin, newX));
                newY = Math.max(margin, Math.min(height - size.h - margin, newY));

            } else {
                // Anchor: Center
                newX = Math.max(size.w / 2 + margin, Math.min(width - size.w / 2 - margin, newX));
                newY = Math.max(size.h / 2 + margin, Math.min(height - size.h / 2 - margin, newY));
            }

            return {
                ...prev,
                [id]: {
                    x: newX,
                    y: newY
                }
            };
        });
    };

    // --- MOUSE DRAG HANDLERS ---
    const handleMouseDown = (e, id) => {
        console.log(`[MouseDrag] MouseDown on ${id}`, { target: e.target.tagName });

        // Fixed elements that should never be draggable (even in modular mode)
        const fixedElements = ['visualizer', 'chat', 'video', 'tools'];
        if (fixedElements.includes(id)) {
            console.log(`[MouseDrag] ${id} is a fixed element, not draggable`);
            return;
        }

        // Bring clicked element to front (z-index)
        bringToFront(id);

        // Prevent dragging when interacting with controls (inputs/buttons/canvas)
        const tagName = e.target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'button' || tagName === 'textarea' || tagName === 'canvas' || e.target.closest('button')) {
            console.log("[MouseDrag] Interaction blocked by interactive element");
            return;
        }

        // Check if clicking on a drag handle section (data-drag-handle attribute)
        const isDragHandle = e.target.closest('[data-drag-handle]');
        if (!isDragHandle && !isModularModeRef.current) {
            // If not clicking a drag handle and modular mode is off, don't drag
            // This allows popup windows to have dedicated drag areas
            console.log("[MouseDrag] Not a drag handle and modular mode off");
            return;
        }

        const elPos = elementPositions[id];
        if (!elPos) return;

        // Calculate offset based on anchor point
        // Most are Center Anchored (x, y is center)
        // Chat is Top-Center Anchored (x is center, y is top)
        // Video is Top-Left Anchored (x is left, y is top)

        // We want: MousePos = ElementPos + Offset
        // So: Offset = MousePos - ElementPos
        dragOffsetRef.current = {
            x: e.clientX - elPos.x,
            y: e.clientY - elPos.y
        };

        setActiveDragElement(id);
        activeDragElementRef.current = id;
        isDraggingRef.current = true;

        window.addEventListener('mousemove', handleMouseDrag);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseDrag = (e) => {
        if (!isDraggingRef.current || !activeDragElementRef.current) return;

        const id = activeDragElementRef.current;
        const currentPos = elementPositionsRef.current[id];
        if (!currentPos) return;

        // Target Position = MousePos - Offset
        // But we want delta for updateElementPosition??
        // actually updateElementPosition takes dx, dy.
        // Let's just set the position directly or calculate delta.
        // Since updateElementPosition has bounds logic, let's use it, but we need delta from PREVIOUS position?
        // OR we can refactor updateElementPosition to take absolute.
        // Let's stick to calculating new position and manually updating state with bounds logic inside a setter.

        // Actually, updateElementPosition uses setElementPositions(prev => ...).
        // Let's duplicate bounds logic for mouse drag to be precise or reuse.
        // reusing updateElementPosition requires calculating dx/dy from *current state* which might be lagging in the closure?
        // No, functional update is fine.

        // But for smooth mouse drag, absolute position is better.
        const rawNewX = e.clientX - dragOffsetRef.current.x;
        const rawNewY = e.clientY - dragOffsetRef.current.y;

        setElementPositions(prev => {
            const size = elementSizes[id] || { w: 100, h: 100 }; // Fallback
            let newX = rawNewX;
            let newY = rawNewY;

            const width = window.innerWidth;
            const height = window.innerHeight;
            const margin = 0;

            if (id === 'chat') {
                newX = Math.max(size.w / 2 + margin, Math.min(width - size.w / 2 - margin, newX));
                newY = Math.max(margin, Math.min(height - size.h - margin, newY));
            } else if (id === 'video') {
                newX = Math.max(margin, Math.min(width - size.w - margin, newX));
                newY = Math.max(margin, Math.min(height - size.h - margin, newY));
            } else {
                newX = Math.max(size.w / 2 + margin, Math.min(width - size.w / 2 - margin, newX));
                newY = Math.max(size.h / 2 + margin, Math.min(height - size.h / 2 - margin, newY));
            }

            return {
                ...prev,
                [id]: { x: newX, y: newY }
            };
        });
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
        setActiveDragElement(null);
        activeDragElementRef.current = null;
        window.removeEventListener('mousemove', handleMouseDrag);
        window.removeEventListener('mouseup', handleMouseUp);
    };

    const formattedClock = currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const bootReadyGates = useMemo(
        () => ({
            media: bootMediaReady,
            socket: socketConnected,
            settings: bootSettingsReady,
            auth: bootAuthReady,
            history: bootHistoryReady,
            integrations: bootIntegrationsReady,
            cloudflared: cloudflaredBoot,
        }),
        [
            bootMediaReady,
            socketConnected,
            bootSettingsReady,
            bootAuthReady,
            bootHistoryReady,
            bootIntegrationsReady,
            cloudflaredBoot,
        ]
    );

    return (
        <div className="h-screen w-screen bg-black text-zinc-100 font-sans overflow-hidden flex flex-col relative selection:bg-zinc-800 selection:text-white">

            {/* --- PREMIUM UI LAYER --- */}

            {/* --- PREMIUM UI LAYER --- */}

            {/* --- PREMIUM UI LAYER --- */}

            {/* Logic: Show AuthLock if we are NOT authenticated AND (Lock Screen is visible OR Auth is Enabled) 
                Actually, simpler: isLockScreenVisible is the source of truth for visibility.
                We set isLockScreenVisible = true via socket if auth is required.
             */}

            {isLockScreenVisible && (
                <AuthLock
                    socket={socket}
                    onAuthenticated={() => setIsAuthenticated(true)}
                    onAnimationComplete={() => setIsLockScreenVisible(false)}
                />
            )}

            {/* --- PREMIUM UI LAYER --- */}

            {/* Hand Cursor - Only show if tracking is enabled */}
            {isVideoOn && isHandTrackingEnabled && (
                <div
                    className={`fixed w-6 h-6 border-2 rounded-full pointer-events-none z-[100] transition-transform duration-75 ${isPinching ? 'bg-white border-white scale-75 shadow-[0_0_15px_rgba(255,255,255,0.8)]' : 'border-white/50 shadow-[0_0_10px_rgba(255,255,255,0.3)]'}`}
                    style={{
                        left: cursorPos.x,
                        top: cursorPos.y,
                        transform: 'translate(-50%, -50%)'
                    }}
                >
                    {/* Center Dot for precision */}
                    <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
                </div>
            )}

            {/* Orb 3D em tela cheia (modo normal): atrás da UI; no modo modular fica num painel redimensionável. */}

            {/* Top Bar (Draggable) — oculto nas configurações para não competir com o painel (z-index + um único fluxo de fechar) */}
            {!showSettings && (
                <div
                    className="z-50 relative flex min-h-[42px] items-center justify-between gap-4 px-3 py-1.5 border-b border-white/[0.05] bg-gradient-to-r from-black/50 via-zinc-950/50 to-black/50 backdrop-blur-2xl select-none sticky top-0"
                    style={{ WebkitAppRegion: 'drag' }}
                >
                    {/* Top accent line */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/15 to-transparent" />
                    {/* Bottom subtle glow */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

                    {/* Esquerda: status + marca + relógio */}
                    <div
                        className="relative z-10 flex items-center gap-2.5 rounded-full border border-white/[0.07] bg-white/[0.03] pl-2.5 pr-3.5 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.05]"
                        style={{ WebkitAppRegion: 'no-drag' }}
                    >
                        {/* Animated status indicator */}
                        <div className="relative flex items-center justify-center">
                            <div className={`h-2 w-2 shrink-0 rounded-full transition-colors duration-500 ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            {isConnected && (
                                <div className="absolute inset-0 h-2 w-2 animate-ping rounded-full bg-emerald-400/40" style={{ animationDuration: '2s' }} />
                            )}
                        </div>

                        {/* Divider */}
                        <div className="h-4 w-px shrink-0 bg-gradient-to-b from-transparent via-white/[0.1] to-transparent" />

                        {/* Brand name */}
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-[11px] font-bold leading-none tracking-[0.2em] uppercase bg-gradient-to-r from-zinc-100 to-zinc-300 bg-clip-text text-transparent">
                                ATHENAS
                            </span>
                            <span className="text-[9px] font-semibold leading-none tracking-[0.18em] uppercase text-zinc-600">
                                OrbitalSync
                            </span>
                        </div>

                        {/* Divider */}
                        <div className="h-4 w-px shrink-0 bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />

                        {/* Clock */}
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold leading-none tracking-[0.12em] text-zinc-500 tabular-nums">
                            <Clock size={10} className="text-zinc-600" strokeWidth={2.5} />
                            {formattedClock}
                        </div>
                    </div>

                    {/* Direita: minimizar / maximizar / fechar */}
                    <div className="relative z-10 pr-0.5" style={{ WebkitAppRegion: 'no-drag' }}>
                        <div className="flex items-center gap-0.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-1 py-1 shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-md">
                            <button
                                type="button"
                                onClick={handleMinimize}
                                title="Minimizar"
                                className="group flex h-6 w-7 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-all duration-200 hover:bg-amber-400/15 hover:text-amber-200"
                            >
                                <Minus size={12} strokeWidth={2.5} className="transition-transform group-hover:scale-110" />
                            </button>
                            <button
                                type="button"
                                onClick={handleMaximize}
                                title="Maximizar / restaurar"
                                className="group flex h-6 w-7 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-all duration-200 hover:bg-emerald-400/15 hover:text-emerald-200"
                            >
                                <Maximize2 size={10} strokeWidth={2.5} className="transition-transform group-hover:scale-110" />
                            </button>
                            <button
                                type="button"
                                onClick={handleCloseRequest}
                                title="Fechar"
                                className="group flex h-6 w-7 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-all duration-200 hover:bg-rose-500/20 hover:text-rose-300"
                            >
                                <X size={12} strokeWidth={2.5} className="transition-transform group-hover:scale-110 group-hover:rotate-90" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!isModularMode && (
                <div
                    id="visualizer"
                    className="fixed inset-0 z-[1] pointer-events-none"
                    aria-hidden
                >
                    <Visualizer
                        fillScreen
                        audioData={AI_VIS_SILENT_BANDS}
                        aiAudioSpectrumRef={aiSpectrumRef}
                        userAudioData={MIC_VIS_SILENT_BANDS}
                        userAudioSpectrumRef={micSpectrumRef}
                        isListening={isConnected && (!isMuted || isAiSpeaking)}
                        isInitializing={isOrbInitializing}
                        intensity={isImageGenerating ? 1 : (isImageGenerationPending ? 0.65 : 0)}
                        micMuted={isConnected && isMuted}
                        isAiSpeaking={isAiSpeaking}
                    />
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 relative z-10 flex flex-col items-center justify-center">
                {/* Visualizer em painel (modo modular arrastável) */}
                {isModularMode && (
                    <div
                        id="visualizer"
                        className={`absolute flex items-center justify-center overflow-hidden border-0 bg-transparent transition-all duration-500 outline-none focus:outline-none focus-visible:outline-none
                            ${activeDragElement === 'visualizer' ? 'ring-1 ring-white/10 bg-white/5' : ''} rounded-2xl pointer-events-auto
                        `}
                        style={{
                            left: elementPositions.visualizer.x,
                            top: elementPositions.visualizer.y,
                            transform: 'translate(-50%, -50%)',
                            width: elementSizes.visualizer.w,
                            height: elementSizes.visualizer.h
                        }}
                        onMouseDown={(e) => handleMouseDown(e, 'visualizer')}
                    >
                        <div className="relative z-20 h-full w-full">
                            <Visualizer
                                audioData={AI_VIS_SILENT_BANDS}
                                aiAudioSpectrumRef={aiSpectrumRef}
                                userAudioData={MIC_VIS_SILENT_BANDS}
                                userAudioSpectrumRef={micSpectrumRef}
                                isListening={isConnected && (!isMuted || isAiSpeaking)}
                                isInitializing={isOrbInitializing}
                                intensity={isImageGenerating ? 1 : (isImageGenerationPending ? 0.65 : 0)}
                                micMuted={isConnected && isMuted}
                                isAiSpeaking={isAiSpeaking}
                                width={elementSizes.visualizer.w}
                                height={elementSizes.visualizer.h}
                            />
                        </div>
                        <div className={`absolute top-2 right-2 text-xs font-bold tracking-widest z-20 ${activeDragElement === 'visualizer' ? 'text-green-500' : 'text-yellow-500/50'}`}>VISUALIZER</div>
                    </div>
                )}

                <AssistantTimerDock timers={assistantTimers} onDismissAlarm={dismissTimerAlarm} />

                <AgendaCalendarPanel
                    open={agendaPanelOpen}
                    onClose={() => {
                        setAgendaPanelOpen(false);
                        setGoogleAgendaLoading(false);
                        setGoogleAgendaError('');
                    }}
                    reminders={agendaDisplayReminders}
                    onRemove={removeAgendaReminder}
                    onAddBrazilNationalHolidays={addBrazilNationalHolidays}
                    onVisibleMonthChange={requestGoogleAgendaMonth}
                    googleLoading={googleAgendaLoading}
                    googleError={googleAgendaError}
                />


                {/* Video Feed Overlay */}
                {/* Floating Project Label */}
                {/* <div className="absolute top-[70px] left-1/2 -translate-x-1/2 text-zinc-400 text-xs font-mono tracking-widest pointer-events-none z-50 bg-black/50 px-2 py-1 rounded backdrop-blur-sm border border-white/5">
                    PROJECT: {currentProject?.toUpperCase()}
                </div> */}

                <div
                    id="video"
                    className={`fixed bottom-4 right-4 transition-all duration-200 
                        ${isVideoOn ? 'opacity-100' : 'opacity-0 pointer-events-none'} 
                        backdrop-blur-md bg-black/40 border border-white/10 shadow-xl rounded-xl
                    `}
                    style={{ zIndex: 20 }}
                >
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 pointer-events-none mix-blend-overlay"></div>
                    {/* Compact Display Container (1080p Source) */}
                    <div className="relative border border-zinc-500/30 rounded-lg overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.05)] w-80 aspect-video bg-black/80">
                        {/* Hidden Video Element (Source) */}
                        <video ref={videoRef} autoPlay muted className="absolute inset-0 w-full h-full object-cover opacity-0" />

                        <div className="absolute top-2 left-2 text-[10px] text-zinc-400 bg-black/60 backdrop-blur px-2 py-0.5 rounded border border-white/10 z-10 font-bold tracking-wider">CAM_01</div>

                        {/* Canvas for Displaying Video + Skeleton (Ensures overlap) */}
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 w-full h-full opacity-80"
                            style={{ transform: isCameraFlipped ? 'scaleX(-1)' : 'none' }}
                        />
                    </div>
                </div>

                {/* Settings Modal - Moved outside Video so it shows independently */}
                {showSettings && (
                    <SettingsWindow
                        socket={socket}
                        micDevices={micDevices}
                        speakerDevices={speakerDevices}
                        webcamDevices={webcamDevices}
                        selectedMicId={selectedMicId}
                        setSelectedMicId={setSelectedMicId}
                        selectedSpeakerId={selectedSpeakerId}
                        setSelectedSpeakerId={setSelectedSpeakerId}
                        selectedWebcamId={selectedWebcamId}
                        setSelectedWebcamId={setSelectedWebcamId}
                        cursorSensitivity={cursorSensitivity}
                        setCursorSensitivity={setCursorSensitivity}
                        micInputGain={micInputGain}
                        setMicInputGain={setMicInputGain}
                        audioVadThreshold={audioVadThreshold}
                        setAudioVadThreshold={setAudioVadThreshold}
                        audioSilenceMs={audioSilenceMs}
                        setAudioSilenceMs={setAudioSilenceMs}
                        isCameraFlipped={isCameraFlipped}
                        setIsCameraFlipped={setIsCameraFlipped}
                        showChatVisualization={showChatVisualization}
                        setShowChatVisualization={setShowChatVisualization}
                        onClose={() => setShowSettings(false)}
                        pickExecutable={async () => {
                            try {
                                return await ipcRenderer.invoke('pick-executable');
                            } catch {
                                return null;
                            }
                        }}
                    />
                )}

                {/* Chat: histórico opcional (config); barra de digitar sempre visível */}
                {!isImageGenerationActive && (
                    <ChatModule
                        messages={messages}
                        inputValue={inputValue}
                        setInputValue={setInputValue}
                        handleSend={handleSend}
                        chatImageAttachment={chatImageAttachment}
                        onChatImageAttachmentChange={setChatImageAttachment}
                        status={status}
                        isConnected={isConnected}
                        isMuted={isMuted}
                        currentProject={currentProject}
                        isModularMode={isModularMode}
                        isImageGenerating={isImageGenerating}
                        imageGeneratingCaption={imageGeneratingCaption}
                        activeDragElement={activeDragElement}
                        position={elementPositions.chat}
                        width={elementSizes.chat.w}
                        height={elementSizes.chat.h}
                        messagesLeftInset={14}
                        messagesRightInset={14}
                        showMessageTranscript={showChatVisualization}
                        onMouseDown={(e) => handleMouseDown(e, 'chat')}
                    />
                )}

                {showChatVisualization && isImageGenerationActive && (
                    <div
                        id="chat"
                        className="absolute px-4 transition-all duration-300"
                        style={{
                            left: elementPositions.chat.x,
                            top: elementPositions.chat.y,
                            transform: 'translate(-50%, 0)',
                            width: elementSizes.chat.w,
                            height: elementSizes.chat.h || 'unset'
                        }}
                    >
                        <div className="relative h-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/45 backdrop-blur-2xl shadow-[0_20px_70px_rgba(0,0,0,0.55)]">
                            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_24%)]" />

                            <div className="relative z-10 h-full flex flex-col items-center justify-center gap-4 px-4">
                                <div className="relative w-20 h-20 rounded-full bg-white/5 border border-white/10 shadow-[0_0_70px_rgba(255,255,255,0.10)] flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.18),transparent_60%)] animate-pulse" />
                                    <div className="absolute inset-0 rounded-full border border-white/20 animate-ping" />
                                    <div className="relative w-14 h-14 rounded-full border border-white/30 border-t-white/80 animate-spin" />
                                </div>

                                <div className="text-center">
                                    <div className="text-xs font-bold uppercase tracking-widest text-zinc-200/90">
                                        GERANDO IMAGEM...
                                    </div>
                                    <div className="text-[10px] text-zinc-500 mt-2 max-w-[260px]">
                                        {imageGeneratingCaption || 'Aguarde um instante.'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Toolbar minimalista — fixed canto inferior esquerdo (ver ToolsModule) */}
                <ToolsModule
                    isConnected={isConnected}
                    isMuted={isMuted}
                    isVideoOn={isVideoOn}
                    isHandTrackingEnabled={isHandTrackingEnabled}
                    showSettings={showSettings}
                    agendaOpen={agendaPanelOpen}
                    onToggleAgenda={() => setAgendaPanelOpen((v) => !v)}
                    onTogglePower={togglePower}
                    onToggleMute={toggleMute}
                    onToggleVideo={toggleVideo}
                    onToggleSettings={() => setShowSettings(!showSettings)}
                    onToggleHand={() => setIsHandTrackingEnabled(!isHandTrackingEnabled)}
                    activeDragElement={activeDragElement}
                    position={elementPositions.tools}
                    onMouseDown={(e) => handleMouseDown(e, 'tools')}
                />

                {!showSettings && (
                    <IntegrationHealthDock
                        health={integrationHealth}
                        onOpenSettings={() => setShowSettings(true)}
                    />
                )}

                {/* Memory Prompt removed - memory is now actively saved to project */}

                {/* Tool Confirmation Modal */}
                <ConfirmationPopup
                    request={confirmationRequest}
                    onConfirm={handleConfirmTool}
                    onDeny={handleDenyTool}
                />
            </div>

            {!systemBootComplete && (
                <BootSequence
                    onComplete={() => setSystemBootComplete(true)}
                    ready={bootReadyGates}
                />
            )}
        </div>
    );
}

export default App;
