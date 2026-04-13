import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Visualizer from './Visualizer';

/**
 * Boot OrbitalSync — versão minimalista.
 * Orb centralizado + status compacto abaixo + barra de progresso fina.
 *
 * `ready.cloudflared`: 'pending' | 'skipped' | 'running' | 'unavailable' | 'standalone'
 */

const GATE_DEFS = [
    { key: 'media',        label: 'Áudio' },
    { key: 'socket',       label: 'Núcleo' },
    { key: 'settings',     label: 'Config' },
    { key: 'auth',         label: 'Auth' },
    { key: 'history',      label: 'Histórico' },
    { key: 'integrations', label: 'Links' },
];

export default function BootSequence({
    onComplete,
    ready,
    minVisibleMs = 1600,
}) {
    const [progress, setProgress] = useState(0);
    const [show, setShow] = useState(true);
    const [synthAi, setSynthAi] = useState(() => new Array(64).fill(55));
    const [orbSize, setOrbSize] = useState({ w: 420, h: 420 });
    const [statusText, setStatusText] = useState('Inicializando subsistemas...');

    const exitedRef = useRef(false);
    const progressRef = useRef(0);
    const bootStartRef = useRef(Date.now());
    const mountAtRef = useRef(Date.now());
    const finishTimerRef = useRef(null);
    const postFinishTimerRef = useRef(null);

    const closeWithFade = useCallback(() => {
        if (exitedRef.current) return;
        exitedRef.current = true;
        setShow(false);
    }, []);

    useEffect(() => {
        progressRef.current = progress;
    }, [progress]);

    /* Animação sintética do orb */
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
        const ro = () => {
            const s = Math.min(560, Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.52));
            setOrbSize({ w: Math.max(340, s), h: Math.max(340, s) });
        };
        ro();
        window.addEventListener('resize', ro);
        return () => window.removeEventListener('resize', ro);
    }, []);

    /* Texto de status baseado no último gate concluído */
    useEffect(() => {
        if (ready.integrations) setStatusText('Integrações conectadas');
        else if (ready.history) setStatusText('Carregando integrações...');
        else if (ready.auth) setStatusText('Restaurando histórico...');
        else if (ready.settings) setStatusText('Verificando acesso...');
        else if (ready.socket) setStatusText('Carregando configuração...');
        else if (ready.media) setStatusText('Conectando ao núcleo...');
        else setStatusText('Inicializando subsistemas...');
    }, [ready]);

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
            setStatusText('Pronto');
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
    }, [ready, show, minVisibleMs, closeWithFade]);

    const micZeros = useMemo(() => new Array(32).fill(0), []);
    const doneCount = GATE_DEFS.filter(g => ready[g.key]).length;
    const allDone = doneCount === GATE_DEFS.length;

    return (
        <AnimatePresence mode="wait" onExitComplete={() => onComplete?.()}>
            {show && (
                <motion.div
                    key="boot"
                    className="fixed inset-0 z-[20000] flex flex-col items-center justify-center overflow-hidden select-none"
                    style={{
                        backgroundColor: '#000',
                        fontFamily: '"Quicksand", system-ui, sans-serif',
                    }}
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    role="dialog"
                    aria-label="Inicialização do sistema"
                >

                    {/* ── Conteúdo centralizado ── */}
                    <div className="relative z-10 flex flex-col items-center gap-6">

                        {/* Orb */}
                        <motion.div
                            className="relative flex items-center justify-center"
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {/* Anel único sutil */}
                            <motion.div
                                className="absolute rounded-full"
                                style={{
                                    width: orbSize.w * 0.92,
                                    height: orbSize.w * 0.92,
                                    border: '1px solid rgba(255,255,255,0.04)',
                                }}
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 30, ease: 'linear' }}
                            />

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

                        {/* Nome do sistema */}
                        <motion.div
                            className="flex flex-col items-center gap-1"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3, duration: 0.6 }}
                        >
                            <h1 className="text-[13px] font-medium uppercase tracking-[0.35em] text-white/70">
                                OrbitalSync
                            </h1>
                            <div className="h-px w-8 bg-white/10" />
                        </motion.div>

                        {/* Gates como dots inline */}
                        <motion.div
                            className="flex items-center gap-3"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.5 }}
                        >
                            {GATE_DEFS.map((g) => {
                                const done = ready[g.key] === true;
                                return (
                                    <div key={g.key} className="group relative flex flex-col items-center gap-1.5">
                                        <div className="relative">
                                            {done ? (
                                                <motion.div
                                                    initial={{ scale: 0.5, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                                >
                                                    <CheckCircle2
                                                        size={14}
                                                        className="text-emerald-400/80"
                                                    />
                                                </motion.div>
                                            ) : (
                                                <motion.div
                                                    animate={{ rotate: 360 }}
                                                    transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
                                                >
                                                    <Loader2 size={14} className="text-white/15" />
                                                </motion.div>
                                            )}
                                        </div>
                                        <span className={`text-[8px] uppercase tracking-[0.15em] transition-colors duration-500 ${
                                            done ? 'text-white/40' : 'text-white/10'
                                        }`}>
                                            {g.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </motion.div>

                        {/* Status text */}
                        <motion.p
                            key={statusText}
                            className="text-[11px] tracking-[0.12em] text-white/25"
                            style={{ fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace' }}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                        >
                            {statusText}
                        </motion.p>

                        {/* Barra de progresso minimalista */}
                        <motion.div
                            className="w-48"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.6, duration: 0.5 }}
                        >
                            <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-white/[0.04]">
                                <motion.div
                                    className="h-full rounded-full"
                                    style={{
                                        background: allDone
                                            ? 'rgba(74,222,128,0.6)'
                                            : 'rgba(255,255,255,0.2)',
                                    }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ type: 'tween', ease: 'easeOut', duration: 0.3 }}
                                />
                            </div>
                        </motion.div>
                    </div>

                    {/* Drag region invisível para mover a janela */}
                    <div
                        className="pointer-events-auto absolute inset-x-0 top-0 z-50 h-8"
                        style={{ WebkitAppRegion: 'drag' }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
