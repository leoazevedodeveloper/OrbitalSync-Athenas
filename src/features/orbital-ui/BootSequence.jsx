import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';
import Visualizer from './Visualizer';

/**
 * Boot OrbitalSync: log e progresso ligados a eventos reais (socket, settings/Supabase, histórico, áudio, Cloudflare).
 * Não pode ser pulado — fecha só quando os gates estão OK (e tempo mínimo de exibição).
 *
 * `ready.cloudflared`: 'pending' | 'skipped' | 'running' | 'unavailable' | 'standalone'
 */
export default function BootSequence({
    onComplete,
    ready,
    minVisibleMs = 1600,
}) {
    const [log, setLog] = useState([]);
    const [progress, setProgress] = useState(0);
    const [show, setShow] = useState(true);
    const [synthAi, setSynthAi] = useState(() => new Array(64).fill(55));
    const [orbSize, setOrbSize] = useState({ w: 480, h: 400 });
    const [bootClock, setBootClock] = useState(() => new Date());

    const exitedRef = useRef(false);
    const progressRef = useRef(0);
    const bootStartRef = useRef(Date.now());
    const mountAtRef = useRef(Date.now());
    const loggedRef = useRef(new Set());
    const finishTimerRef = useRef(null);
    const postFinishTimerRef = useRef(null);

    const append = useCallback((line) => {
        setLog((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, text: line }]);
    }, []);

    const closeWithFade = useCallback(() => {
        if (exitedRef.current) return;
        exitedRef.current = true;
        setShow(false);
    }, []);

    const markLine = useCallback(
        (key, line) => {
            if (loggedRef.current.has(key)) return;
            loggedRef.current.add(key);
            append(line);
        },
        [append]
    );

    useEffect(() => {
        progressRef.current = progress;
    }, [progress]);

    useEffect(() => {
        if (!show) return undefined;
        bootStartRef.current = Date.now();
        let frame;
        const loop = () => {
            const t = (Date.now() - bootStartRef.current) * 0.001;
            const pr = progressRef.current / 100;
            const boost = 0.28 + pr * 0.55;
            const arr = new Array(64);
            for (let i = 0; i < 64; i += 1) {
                const f = (i / 64) * Math.PI * 2;
                const wobble =
                    Math.sin(t * 2.1 + f * 2.8) * 95 * boost +
                    Math.sin(t * 3.6 + i * 0.12) * 48 * boost +
                    Math.sin(t * 5.2 + i * 0.08) * 22 * boost;
                arr[i] = Math.min(255, Math.max(28, 62 + wobble));
            }
            setSynthAi(arr);
            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frame);
    }, [show]);

    useEffect(() => {
        const t = setInterval(() => setBootClock(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        const ro = () => {
            const w = Math.min(560, Math.floor(window.innerWidth * 0.88));
            const h = Math.min(480, Math.floor(window.innerHeight * 0.52));
            setOrbSize({ w: Math.max(320, w), h: Math.max(280, h) });
        };
        ro();
        window.addEventListener('resize', ro);
        return () => window.removeEventListener('resize', ro);
    }, []);

    /* Cabeçalho do log (uma vez) */
    useEffect(() => {
        markLine('banner1', '══════════════════════════════════════════════════════════════');
        markLine('banner2', '  ORBITALSYNC  A.D.A.  —  KERNEL v2.5.0');
        markLine('banner3', '  Inicialização — subsistemas reais (rede, config, armazenamento)');
        markLine('banner4', '══════════════════════════════════════════════════════════════');
        markLine('shell', '[ OK ] Interface carregada (renderer / Electron)');
    }, [markLine]);

    /* Linhas conforme cada gate conclui */
    useEffect(() => {
        if (ready.cloudflared === 'skipped') {
            markLine(
                'cf',
                '[ OK ] Cloudflare Tunnel: ignorado (ORBITAL_SKIP_CLOUDFLARED=1)'
            );
        } else if (ready.cloudflared === 'running') {
            markLine('cf', '[ OK ] Cloudflare Tunnel: processo cloudflared iniciado');
        } else if (ready.cloudflared === 'unavailable') {
            markLine(
                'cf',
                '[ OK ] Cloudflare Tunnel: não aplicável (binário ausente ou não iniciado)'
            );
        } else if (ready.cloudflared === 'standalone') {
            markLine(
                'cf',
                '[ — ] Cloudflare Tunnel: modo navegador / Vite (fora do pacote Electron)'
            );
        }
    }, [ready.cloudflared, markLine]);

    useEffect(() => {
        if (ready.media) {
            markLine(
                'media',
                '[ OK ] Motor de áudio e vídeo — dispositivos enumerados (Web API)'
            );
        }
    }, [ready.media, markLine]);

    useEffect(() => {
        if (ready.socket) {
            markLine(
                'socket',
                '[ OK ] Núcleo A.D.A — Socket.IO em 127.0.0.1:8000 (backend ativo)'
            );
        }
    }, [ready.socket, markLine]);

    useEffect(() => {
        if (ready.settings) {
            markLine(
                'settings',
                '[ OK ] Configuração remota — settings, Supabase (se ativo), ComfyUI, webhooks'
            );
        }
    }, [ready.settings, markLine]);

    useEffect(() => {
        if (ready.auth) {
            markLine(
                'auth',
                '[ OK ] Política de acesso — auth_status sincronizado com o servidor'
            );
        }
    }, [ready.auth, markLine]);

    useEffect(() => {
        if (ready.history) {
            markLine('history', '[ OK ] Histórico do projeto — chat_history.jsonl carregado');
        }
    }, [ready.history, markLine]);

    useEffect(() => {
        if (ready.integrations) {
            markLine(
                'integrations',
                '[ OK ] Ligações remotas — Supabase, ComfyUI, webhooks e Ollama testados'
            );
        }
    }, [ready.integrations, markLine]);

    /* Progresso derivado dos gates */
    useEffect(() => {
        const parts = [
            true,
            ready.cloudflared !== 'pending',
            ready.media,
            ready.socket,
            ready.settings,
            ready.auth,
            ready.history,
            ready.integrations,
        ];
        const done = parts.filter(Boolean).length;
        const pct = (done / parts.length) * 100;
        setProgress(Math.min(99, Math.round(pct)));
    }, [ready]);

    /* Conclusão: todos os gates + tempo mínimo visível */
    useEffect(() => {
        if (!show || exitedRef.current) return undefined;

        const cfDone = ready.cloudflared !== 'pending';
        const all =
            ready.media &&
            ready.socket &&
            ready.settings &&
            ready.auth &&
            ready.history &&
            ready.integrations &&
            cfDone;

        if (!all) return undefined;

        if (finishTimerRef.current) {
            clearTimeout(finishTimerRef.current);
            finishTimerRef.current = null;
        }

        const elapsed = Date.now() - mountAtRef.current;
        const waitExtra = Math.max(0, minVisibleMs - elapsed);

        finishTimerRef.current = setTimeout(() => {
            finishTimerRef.current = null;
            if (exitedRef.current) return;
            markLine('done1', '---');
            markLine('done2', 'PRONTO — ativando workspace principal...');
            setProgress(100);
            postFinishTimerRef.current = setTimeout(() => {
                postFinishTimerRef.current = null;
                closeWithFade();
            }, 520);
        }, waitExtra);

        return () => {
            if (finishTimerRef.current) {
                clearTimeout(finishTimerRef.current);
                finishTimerRef.current = null;
            }
            if (postFinishTimerRef.current) {
                clearTimeout(postFinishTimerRef.current);
                postFinishTimerRef.current = null;
            }
        };
    }, [ready, show, minVisibleMs, markLine, closeWithFade]);

    const micZeros = useMemo(() => new Array(32).fill(0), []);
    const formattedClock = bootClock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return (
        <AnimatePresence mode="wait" onExitComplete={() => onComplete?.()}>
            {show && (
                <motion.div
                    key="boot"
                    className="fixed inset-0 z-[20000] flex flex-col overflow-hidden select-none bg-black text-zinc-200 font-mono text-[11px] sm:text-[12px] leading-relaxed"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    role="dialog"
                    aria-label="Inicialização do sistema"
                >
                    <div
                        className="relative z-10 flex min-h-[38px] shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-black/40 px-3 py-1 backdrop-blur-xl select-none"
                        style={{ WebkitAppRegion: 'drag' }}
                    >
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                        <div
                            className="relative z-10 flex min-w-0 max-w-[min(100%,32rem)] items-center gap-2.5 rounded-full border border-white/10 bg-black/35 px-3 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)] sm:gap-3 sm:px-3.5"
                            style={{ WebkitAppRegion: 'no-drag' }}
                        >
                            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.65)]" />
                            <div className="min-w-0 truncate font-sans text-[11px] font-semibold leading-none tracking-[0.22em] text-zinc-100 uppercase">
                                ATHENAS · OrbitalSync
                            </div>
                            <div className="h-3 w-px shrink-0 bg-white/12" />
                            <span className="hidden shrink-0 text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-500 sm:inline">
                                Inicialização
                            </span>
                            <div className="hidden h-3 w-px shrink-0 bg-white/12 sm:block" />
                            <div className="flex shrink-0 items-center gap-1 text-[10px] font-medium leading-none tracking-[0.14em] text-zinc-400 tabular-nums">
                                <Clock size={11} className="text-zinc-500 opacity-80" strokeWidth={2} />
                                {formattedClock}
                            </div>
                        </div>

                        <div className="relative z-10 shrink-0 pr-0.5 font-sans text-[9px] uppercase tracking-[0.2em] text-zinc-600">
                            Aguarde
                        </div>
                    </div>

                    <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 pb-6 pt-2 sm:px-8">
                        <div className="relative flex shrink-0 items-center justify-center">
                            <motion.div
                                className="relative"
                                initial={{ opacity: 0.6, scale: 0.92 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <Visualizer
                                    audioData={synthAi}
                                    userAudioData={micZeros}
                                    isListening
                                    isInitializing
                                    intensity={0}
                                    width={orbSize.w}
                                    height={orbSize.h}
                                />
                            </motion.div>
                        </div>

                        <div className="custom-scrollbar mt-4 w-full max-w-2xl flex-1 space-y-0.5 overflow-y-auto pr-1 text-left min-h-0 max-h-[28vh] sm:max-h-[32vh]">
                            {log.map((entry) => (
                                <motion.div
                                    key={entry.id}
                                    initial={{ opacity: 0, x: -4 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className={
                                        entry.text.includes('[ OK ]')
                                            ? 'text-emerald-400/95'
                                            : entry.text.includes('═')
                                              ? 'text-zinc-500'
                                              : entry.text.includes('[ — ]')
                                                ? 'text-zinc-500'
                                                : 'text-zinc-400'
                                    }
                                >
                                    {entry.text}
                                </motion.div>
                            ))}

                            <motion.span
                                className="ml-0.5 inline-block h-3 w-2 bg-zinc-300 align-middle"
                                animate={{ opacity: [1, 0.25, 1] }}
                                transition={{ repeat: Infinity, duration: 0.85 }}
                            />
                        </div>

                        <div className="mt-4 w-full max-w-2xl space-y-2">
                            <div className="flex justify-between font-sans text-[10px] uppercase tracking-wider text-zinc-500">
                                <span>Progresso</span>
                                <span className="text-zinc-400">{Math.round(progress)}%</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-zinc-900/90">
                                <motion.div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-white/90"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ type: 'tween', ease: 'easeOut', duration: 0.12 }}
                                />
                            </div>
                            <p className="text-center font-sans text-[9px] uppercase tracking-[0.18em] text-zinc-600">
                                Sincronização real — não é possível pular esta etapa
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
