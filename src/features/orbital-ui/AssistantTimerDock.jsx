import React, { useEffect, useState } from 'react';
import { Orbit } from 'lucide-react';

function formatRemaining(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0:00';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

const RING_R = 34;
const RING_STROKE = 2.5;
const RING_C = 2 * Math.PI * RING_R;

/**
 * HUD de cronómetro (OrbitalSync). Com `ringing`, o alarme soa até `onDismissAlarm` (clique).
 * @param {{ id: string, label?: string, endsAt: number, totalMs?: number, ringing?: boolean }[]} timers
 * @param {() => void} [onDismissAlarm]
 */
export default function AssistantTimerDock({ timers, onDismissAlarm }) {
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!timers.length) return undefined;
        const id = setInterval(() => setTick((n) => n + 1), 200);
        return () => clearInterval(id);
    }, [timers.length]);

    if (!timers.length) return null;

    const hasRinging = timers.some((t) => t.ringing);
    const size = 2 * (RING_R + RING_STROKE) + 8;

    const handleDockClick = (e) => {
        if (!hasRinging) return;
        e.preventDefault();
        e.stopPropagation();
        onDismissAlarm?.();
    };

    const handleKeyDown = (e) => {
        if (!hasRinging) return;
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
            e.preventDefault();
            onDismissAlarm?.();
        }
    };

    return (
        <div
            className={`fixed left-1/2 top-[4.5rem] z-[60] flex -translate-x-1/2 flex-col items-center gap-3 ${hasRinging ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
            aria-live="polite"
            role={hasRinging ? 'button' : undefined}
            tabIndex={hasRinging ? 0 : undefined}
            onClick={handleDockClick}
            onKeyDown={handleKeyDown}
            title={hasRinging ? 'Clique para silenciar o alarme' : undefined}
        >
            {timers.map((t, idx) => {
                const alarming = Boolean(t.ringing);
                const remaining = t.endsAt - Date.now();
                const done = remaining <= 0 || alarming;
                const total = Math.max(1, t.totalMs || Math.max(1000, t.endsAt - Date.now()));
                const progress = done ? 0 : Math.min(1, Math.max(0, remaining / total));
                const dashOffset = RING_C * (1 - progress);
                const display = done ? '0:00' : formatRemaining(remaining);
                const gradId = `orbital-chrono-grad-${idx}`;

                return (
                    <div
                        key={t.id}
                        className={`relative min-w-[min(92vw,17.5rem)] max-w-[20rem] overflow-hidden rounded-[1.15rem] border backdrop-blur-2xl transition-shadow duration-300 ${
                            alarming
                                ? 'border-amber-400/45 bg-black/65 shadow-[0_0_48px_rgba(251,191,36,0.22),0_16px_56px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)] ring-2 ring-amber-400/30'
                                : 'border-cyan-500/20 bg-black/55 shadow-[0_16px_56px_rgba(0,0,0,0.6),0_0_0_1px_rgba(34,211,238,0.08),inset_0_1px_0_rgba(255,255,255,0.07)]'
                        }`}
                    >
                        <div
                            className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay"
                            style={{
                                backgroundImage: `url("https://grainy-gradients.vercel.app/noise.svg")`,
                            }}
                        />
                        <div
                            className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${alarming ? 'via-amber-400/50' : 'via-cyan-400/35'} to-transparent`}
                        />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                        <div className="relative flex items-stretch gap-3 px-3.5 py-3">
                            <span
                                className={`pointer-events-none absolute left-2 top-2 h-2 w-2 border-l border-t ${alarming ? 'border-amber-400/60' : 'border-cyan-400/40'}`}
                                aria-hidden
                            />
                            <span
                                className={`pointer-events-none absolute right-2 top-2 h-2 w-2 border-r border-t ${alarming ? 'border-amber-400/60' : 'border-cyan-400/40'}`}
                                aria-hidden
                            />
                            <span
                                className={`pointer-events-none absolute bottom-2 left-2 h-2 w-2 border-b border-l ${alarming ? 'border-amber-400/35' : 'border-cyan-400/25'}`}
                                aria-hidden
                            />
                            <span
                                className={`pointer-events-none absolute bottom-2 right-2 h-2 w-2 border-b border-r ${alarming ? 'border-amber-400/35' : 'border-cyan-400/25'}`}
                                aria-hidden
                            />

                            <div
                                className="relative flex shrink-0 items-center justify-center"
                                style={{ width: size, height: size }}
                            >
                                <svg
                                    width={size}
                                    height={size}
                                    className="-rotate-90"
                                    aria-hidden
                                >
                                    <defs>
                                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                                            {alarming ? (
                                                <>
                                                    <stop offset="0%" stopColor="rgb(251 191 36)" stopOpacity="0.95" />
                                                    <stop offset="100%" stopColor="rgb(245 158 11)" stopOpacity="0.75" />
                                                </>
                                            ) : (
                                                <>
                                                    <stop offset="0%" stopColor="rgb(103 232 249)" stopOpacity="0.95" />
                                                    <stop offset="100%" stopColor="rgb(6 182 212)" stopOpacity="0.65" />
                                                </>
                                            )}
                                        </linearGradient>
                                    </defs>
                                    <circle
                                        cx={size / 2}
                                        cy={size / 2}
                                        r={RING_R}
                                        fill="none"
                                        stroke="rgba(255,255,255,0.06)"
                                        strokeWidth={RING_STROKE}
                                    />
                                    <circle
                                        cx={size / 2}
                                        cy={size / 2}
                                        r={RING_R}
                                        fill="none"
                                        stroke={`url(#${gradId})`}
                                        strokeWidth={RING_STROKE}
                                        strokeLinecap="round"
                                        strokeDasharray={RING_C}
                                        strokeDashoffset={dashOffset}
                                        className={
                                            done
                                                ? 'transition-[stroke-dashoffset] duration-300'
                                                : 'transition-[stroke-dashoffset] duration-200 ease-linear'
                                        }
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Orbit
                                        className={`h-5 w-5 ${alarming ? 'text-amber-300' : done ? 'text-zinc-500' : 'text-cyan-300/90'} ${alarming ? 'animate-pulse' : ''}`}
                                        strokeWidth={2}
                                        aria-hidden
                                    />
                                </div>
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 pr-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span
                                        className={`font-sans text-[9px] font-bold uppercase tracking-[0.2em] ${alarming ? 'text-amber-200/90' : 'text-cyan-200/75'}`}
                                    >
                                        {alarming ? 'Alerta orbital' : 'Orbital chrono'}
                                    </span>
                                    <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold tabular-nums text-zinc-500">
                                        <span
                                            className={`h-1.5 w-1.5 rounded-full ${alarming ? 'animate-pulse bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.85)]' : done ? 'bg-zinc-600' : 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]'}`}
                                            aria-hidden
                                        />
                                        {alarming ? 'alarme ativo' : 't−minus'}
                                    </span>
                                </div>
                                <div
                                    className={`font-mono text-[1.65rem] font-bold leading-none tabular-nums tracking-tight ${alarming ? 'text-amber-50' : done ? 'text-zinc-500' : 'text-white'}`}
                                    style={
                                        alarming
                                            ? {
                                                  textShadow:
                                                      '0 0 24px rgba(251,191,36,0.35), 0 1px 0 rgba(0,0,0,0.8)',
                                              }
                                            : done
                                              ? undefined
                                              : {
                                                    textShadow:
                                                        '0 0 28px rgba(34,211,238,0.25), 0 1px 0 rgba(0,0,0,0.8)',
                                                }
                                    }
                                >
                                    {display}
                                </div>
                                <div className="font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                                    {alarming ? (
                                        <span className="text-amber-200/80">Toque aqui para silenciar · alarme contínuo</span>
                                    ) : t.label ? (
                                        <span className="line-clamp-2 text-zinc-400">{t.label}</span>
                                    ) : (
                                        <span className="text-zinc-600">Contagem regressiva ativa</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
