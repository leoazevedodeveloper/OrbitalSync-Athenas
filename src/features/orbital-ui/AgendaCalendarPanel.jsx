import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar, Clock, ExternalLink, Sparkles } from 'lucide-react';

const WEEK_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MONTHS_PT = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
];

const YEAR_WINDOW = 8;

/** @param {Date} d */
function dayKeyAtMidnight(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatSelectedHeading(key) {
    const [y, m, d] = key.split('-').map(Number);
    if (!y || !m || !d) return key;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });
}

/** Dynamic accent based on event count */
function eventCountAccent(count) {
    if (count >= 4) return 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.7)]';
    if (count >= 2) return 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]';
    return 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.55)]';
}

/**
 * Painel agenda mensal (lembretes com data/hora fixa) — design premium fullscreen.
 * @param {{ open: boolean, onClose: () => void, reminders: { id: string, title: string, startsAtMs: number, source?: string, htmlLink?: string }[], onRemove: (id: string) => void, onAddBrazilNationalHolidays?: (year: number) => void, onVisibleMonthChange?: (year: number, month1to12: number) => void, googleLoading?: boolean, googleError?: string }} props
 */
export default function AgendaCalendarPanel({
    open,
    onClose,
    reminders,
    onRemove,
    onAddBrazilNationalHolidays,
    onVisibleMonthChange,
    googleLoading = false,
    googleError = '',
}) {
    const [cursor, setCursor] = useState(() => {
        const n = new Date();
        return new Date(n.getFullYear(), n.getMonth(), 1);
    });
    const [selectedKey, setSelectedKey] = useState(() => dayKeyAtMidnight(new Date()));
    const [isAnimating, setIsAnimating] = useState(false);

    const byDay = useMemo(() => {
        /** @type {Record<string, typeof reminders>} */
        const m = {};
        for (const r of reminders) {
            const d = new Date(r.startsAtMs);
            const k = dayKeyAtMidnight(d);
            if (!m[k]) m[k] = [];
            m[k].push(r);
        }
        for (const k of Object.keys(m)) {
            m[k].sort((a, b) => a.startsAtMs - b.startsAtMs);
        }
        return m;
    }, [reminders]);

    const year = cursor.getFullYear();
    const monthIndex = cursor.getMonth();
    const firstDow = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < firstDow; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
        cells.push(new Date(year, monthIndex, d));
    }

    const selectedList = byDay[selectedKey] || [];

    // Total events this month
    const monthEventCount = useMemo(() => {
        let count = 0;
        for (const cell of cells) {
            if (cell) {
                const k = dayKeyAtMidnight(cell);
                count += (byDay[k] || []).length;
            }
        }
        return count;
    }, [cells, byDay]);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return;
        onAddBrazilNationalHolidays?.(year);
    }, [open, year, onAddBrazilNationalHolidays]);

    useEffect(() => {
        if (!open || !onVisibleMonthChange) return;
        onVisibleMonthChange(year, monthIndex + 1);
    }, [open, year, monthIndex, onVisibleMonthChange]);

    // Month change animation
    const switchMonth = (delta) => {
        setIsAnimating(true);
        setTimeout(() => {
            setCursor(new Date(year, monthIndex + delta, 1));
            setIsAnimating(false);
        }, 150);
    };

    if (!open) return null;

    const todayKey = dayKeyAtMidnight(new Date());

    return (
        <div
            className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/70 p-2 pt-12 pb-2 backdrop-blur-xl sm:p-3 sm:pt-14 sm:pb-3 animate-[fadeIn_0.2s_ease-out]"
            role="presentation"
            onClick={onClose}
        >
            <div
                className="relative flex h-full w-full max-h-[calc(100dvh-3rem)] max-w-[1900px] flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-950/95 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_40px_140px_rgba(0,0,0,0.7)] backdrop-blur-2xl sm:rounded-3xl md:flex-row"
                role="dialog"
                aria-label="Agenda"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Decorative top gradient line */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
                {/* Subtle radial glow */}
                <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-64 w-[600px] rounded-full bg-cyan-500/[0.04] blur-3xl" />

                {/* ════════════════ CALENDÁRIO ════════════════ */}
                <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
                    {/* ── Header ── */}
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-7 sm:py-5">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <Calendar size={13} className="text-cyan-400/70" strokeWidth={2.5} />
                                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400/70 sm:text-[11px]">
                                    Agenda OrbitalSync
                                </span>
                                {monthEventCount > 0 && (
                                    <span className="ml-1 rounded-full bg-white/[0.07] px-2 py-0.5 text-[9px] font-bold tabular-nums text-zinc-400">
                                        {monthEventCount} evento{monthEventCount !== 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                            <div className={`mt-2 truncate text-2xl font-semibold tracking-tight text-zinc-100 transition-all duration-300 sm:text-3xl md:text-4xl ${isAnimating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
                                {MONTHS_PT[monthIndex]}
                                <span className="ml-2 text-zinc-500 font-normal">{year}</span>
                            </div>
                            {googleLoading && (
                                <div className="mt-2.5 flex items-center gap-2">
                                    <div className="h-1 w-1 animate-pulse rounded-full bg-sky-400" />
                                    <span className="text-[10px] font-medium text-sky-400/80 sm:text-xs">
                                        Sincronizando Google Calendar…
                                    </span>
                                </div>
                            )}
                            {googleError && (
                                <div className="mt-2.5 max-w-xl rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[10px] leading-snug text-amber-200/80 sm:text-xs">
                                    ⚠ {googleError}
                                </div>
                            )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                            <select
                                aria-label="Selecionar mês"
                                value={monthIndex}
                                onChange={(e) => setCursor(new Date(year, Number(e.target.value), 1))}
                                className="h-9 cursor-pointer rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 outline-none transition-all hover:bg-white/[0.08] focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20 sm:h-10 sm:text-sm"
                                style={{ colorScheme: 'dark' }}
                            >
                                {MONTHS_PT.map((m, idx) => (
                                    <option key={m} value={idx} className="bg-zinc-950 text-zinc-100">
                                        {m}
                                    </option>
                                ))}
                            </select>
                            <select
                                aria-label="Selecionar ano"
                                value={year}
                                onChange={(e) => setCursor(new Date(Number(e.target.value), monthIndex, 1))}
                                className="h-9 cursor-pointer rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-zinc-300 outline-none transition-all hover:bg-white/[0.08] focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20 sm:h-10 sm:text-sm"
                                style={{ colorScheme: 'dark' }}
                            >
                                {Array.from({ length: YEAR_WINDOW * 2 + 1 }, (_, i) => year - YEAR_WINDOW + i).map((y) => (
                                    <option key={y} value={y} className="bg-zinc-950 text-zinc-100">
                                        {y}
                                    </option>
                                ))}
                            </select>
                            <div className="ml-1 flex items-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
                                <button
                                    type="button"
                                    onClick={() => switchMonth(-1)}
                                    className="flex h-9 w-9 items-center justify-center rounded-l-xl text-zinc-500 transition-all hover:bg-white/[0.08] hover:text-zinc-200 active:scale-95 sm:h-10 sm:w-10"
                                    title="Mês anterior"
                                >
                                    <ChevronLeft size={18} strokeWidth={2.5} />
                                </button>
                                <div className="h-5 w-px bg-white/[0.06]" />
                                <button
                                    type="button"
                                    onClick={() => switchMonth(1)}
                                    className="flex h-9 w-9 items-center justify-center rounded-r-xl text-zinc-500 transition-all hover:bg-white/[0.08] hover:text-zinc-200 active:scale-95 sm:h-10 sm:w-10"
                                    title="Próximo mês"
                                >
                                    <ChevronRight size={18} strokeWidth={2.5} />
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="ml-2 flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 transition-all hover:bg-white/[0.08] hover:text-zinc-200 active:scale-95 sm:h-10 sm:w-10"
                                title="Fechar"
                            >
                                <X size={18} strokeWidth={2} />
                            </button>
                        </div>
                    </div>

                    {/* ── Calendar Grid ── */}
                    <div className={`flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4 md:px-8 md:pb-8 transition-all duration-300 ${isAnimating ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'}`}>
                        {/* Week day labels */}
                        <div className="grid grid-cols-7 gap-1 pb-2 text-center sm:gap-2">
                            {WEEK_LABELS.map((w, i) => (
                                <div
                                    key={w}
                                    className={`py-2 text-[10px] font-bold uppercase tracking-[0.18em] sm:py-3 sm:text-[11px] ${
                                        i === 0 || i === 6 ? 'text-zinc-600' : 'text-zinc-500'
                                    }`}
                                >
                                    {w}
                                </div>
                            ))}
                        </div>
                        {/* Day grid */}
                        <div className="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-7 gap-1 sm:gap-1.5 md:gap-2">
                            {cells.map((cell, idx) => {
                                if (!cell) {
                                    return <div key={`e-${idx}`} className="rounded-xl" />;
                                }
                                const k = dayKeyAtMidnight(cell);
                                const evts = byDay[k] || [];
                                const has = evts.length > 0;
                                const isSel = k === selectedKey;
                                const isToday = k === todayKey;
                                const isWeekend = cell.getDay() === 0 || cell.getDay() === 6;
                                const isPast = k < todayKey;

                                return (
                                    <button
                                        type="button"
                                        key={k}
                                        onClick={() => setSelectedKey(k)}
                                        className={[
                                            'group relative flex min-h-[2.5rem] flex-col items-center justify-center rounded-xl text-sm font-medium tabular-nums transition-all duration-200 sm:min-h-[3rem] sm:text-base md:min-h-0 md:rounded-2xl md:text-lg lg:text-xl',
                                            isSel
                                                ? 'bg-gradient-to-b from-cyan-500/25 to-cyan-600/10 text-white ring-1 ring-cyan-400/40 shadow-[0_0_30px_rgba(34,211,238,0.12)]'
                                                : isToday
                                                ? 'bg-white/[0.06] text-white ring-1 ring-white/15'
                                                : isPast
                                                ? 'text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400'
                                                : isWeekend
                                                ? 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                                                : 'text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100',
                                        ].join(' ')}
                                    >
                                        <span className={isToday && !isSel ? 'relative' : ''}>
                                            {cell.getDate()}
                                            {isToday && !isSel && (
                                                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] w-3 rounded-full bg-cyan-400/60" />
                                            )}
                                        </span>
                                        {has ? (
                                            <span className="mt-1 flex items-center gap-[3px]">
                                                {evts.length <= 3 ? (
                                                    evts.map((_, i) => (
                                                        <span
                                                            key={i}
                                                            className={`inline-block h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5 ${eventCountAccent(evts.length)}`}
                                                        />
                                                    ))
                                                ) : (
                                                    <>
                                                        <span className={`inline-block h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5 ${eventCountAccent(evts.length)}`} />
                                                        <span className="text-[8px] font-bold text-zinc-400 sm:text-[9px]">
                                                            +{evts.length - 1}
                                                        </span>
                                                    </>
                                                )}
                                            </span>
                                        ) : (
                                            <span className="mt-1 h-1 w-1 sm:h-1.5 sm:w-1.5" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ════════════════ PAINEL LATERAL — EVENTOS DO DIA ════════════════ */}
                <div className="relative z-10 flex max-h-[38vh] min-h-[200px] w-full shrink-0 flex-col border-t border-white/[0.06] bg-gradient-to-b from-zinc-900/60 to-zinc-950/80 md:max-h-none md:w-[min(100%,28rem)] md:border-l md:border-t-0 md:bg-gradient-to-r md:from-zinc-900/40 md:to-zinc-950/80 lg:w-[min(100%,34rem)]">
                    {/* Subtle glow at the top of the sidebar */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-cyan-500/[0.03] to-transparent md:inset-y-0 md:left-0 md:h-auto md:w-32 md:bg-gradient-to-r" />

                    {/* ── Day heading ── */}
                    <div className="relative shrink-0 border-b border-white/[0.06] px-5 py-4 sm:px-6 sm:py-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Sparkles size={11} className="text-cyan-400/50" strokeWidth={2.5} />
                                    <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-600 sm:text-[10px]">
                                        Dia selecionado
                                    </span>
                                </div>
                                <div className="mt-1.5 text-base font-semibold capitalize leading-snug text-zinc-100 sm:text-lg">
                                    {formatSelectedHeading(selectedKey)}
                                </div>
                            </div>
                            {selectedList.length > 0 && (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/10 text-xs font-bold tabular-nums text-cyan-300/80">
                                    {selectedList.length}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Events list ── */}
                    <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
                        {selectedList.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-3 py-8 sm:py-12">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                                    <Calendar size={24} className="text-zinc-600" strokeWidth={1.5} />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-medium text-zinc-500">
                                        Nenhum evento neste dia
                                    </p>
                                    <p className="mt-1 text-xs text-zinc-600">
                                        Peça à ATHENAS para agendar.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2 sm:space-y-2.5">
                                {selectedList.map((r, index) => (
                                    <div
                                        key={r.id}
                                        className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] transition-all duration-200 hover:border-white/[0.1] hover:bg-white/[0.04]"
                                        style={{ animationDelay: `${index * 50}ms` }}
                                    >
                                        {/* Left accent bar */}
                                        <div className={`absolute left-0 top-0 h-full w-[3px] ${
                                            r.source === 'google'
                                                ? 'bg-gradient-to-b from-sky-400 to-sky-600'
                                                : index % 3 === 0
                                                ? 'bg-gradient-to-b from-cyan-400 to-cyan-600'
                                                : index % 3 === 1
                                                ? 'bg-gradient-to-b from-violet-400 to-violet-600'
                                                : 'bg-gradient-to-b from-amber-400 to-amber-600'
                                        }`} />

                                        <div className="flex items-start gap-3 px-4 py-3 pl-5 sm:px-5 sm:py-3.5 sm:pl-6">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-[13px] font-semibold leading-snug text-zinc-100 sm:text-sm">
                                                        {r.title}
                                                    </span>
                                                    {r.source === 'google' && (
                                                        <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-300/90">
                                                            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-current" aria-hidden>
                                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                            </svg>
                                                            Google
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-1.5 flex items-center gap-1.5 text-xs tabular-nums text-zinc-500">
                                                    <Clock size={11} className="text-zinc-600" strokeWidth={2} />
                                                    {new Date(r.startsAtMs).toLocaleTimeString('pt-BR', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </div>
                                                {r.source === 'google' && r.htmlLink && (
                                                    <a
                                                        href={r.htmlLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-sky-400/70 transition-colors hover:text-sky-300"
                                                    >
                                                        <ExternalLink size={10} strokeWidth={2.5} />
                                                        Abrir no Google
                                                    </a>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => onRemove(r.id)}
                                                title={
                                                    r.source === 'google'
                                                        ? 'Remover evento do Google Calendar'
                                                        : 'Remover'
                                                }
                                                className="mt-0.5 shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 transition-all duration-200 hover:bg-rose-500/15 hover:text-rose-300 group-hover:opacity-100"
                                            >
                                                <X size={14} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Keyframe for panel entrance */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
