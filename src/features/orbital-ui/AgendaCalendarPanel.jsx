import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

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
        year: 'numeric',
    });
}

/**
 * Painel agenda mensal (lembretes com data/hora fixa) — ocupa quase toda a tela.
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

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/65 p-2 pt-12 pb-2 backdrop-blur-md sm:p-3 sm:pt-14 sm:pb-3"
            role="presentation"
            onClick={onClose}
        >
            <div
                className="flex h-full w-full max-h-[calc(100dvh-3rem)] max-w-[1900px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/92 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_32px_120px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:rounded-3xl md:flex-row"
                role="dialog"
                aria-label="Agenda"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_32%)] sm:rounded-3xl" />

                {/* Calendário — maior parte da área */}
                <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-6 sm:py-5">
                        <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500 sm:text-xs">
                                Agenda OrbitalSync
                            </div>
                            <div className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl md:text-3xl">
                                {MONTHS_PT[monthIndex]} {year}
                            </div>
                            {googleLoading ? (
                                <div className="mt-2 text-[10px] font-medium text-sky-400/90 sm:text-xs">
                                    A sincronizar com Google Calendar…
                                </div>
                            ) : null}
                            {googleError ? (
                                <div className="mt-2 max-w-xl text-[10px] leading-snug text-amber-200/90 sm:text-xs">
                                    Google: {googleError}
                                </div>
                            ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                            <select
                                aria-label="Selecionar mês"
                                value={monthIndex}
                                onChange={(e) => setCursor(new Date(year, Number(e.target.value), 1))}
                                className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/50 sm:h-11"
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
                                className="h-10 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/50 sm:h-11"
                                style={{ colorScheme: 'dark' }}
                            >
                                {Array.from({ length: YEAR_WINDOW * 2 + 1 }, (_, i) => year - YEAR_WINDOW + i).map((y) => (
                                    <option key={y} value={y} className="bg-zinc-950 text-zinc-100">
                                        {y}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => setCursor(new Date(year, monthIndex - 1, 1))}
                                className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100 sm:h-11 sm:w-11"
                                title="Mês anterior"
                            >
                                <ChevronLeft size={22} strokeWidth={2} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setCursor(new Date(year, monthIndex + 1, 1))}
                                className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100 sm:h-11 sm:w-11"
                                title="Próximo mês"
                            >
                                <ChevronRight size={22} strokeWidth={2} />
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="ml-1 flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-white/[0.1] hover:text-zinc-100 sm:h-11 sm:w-11"
                                title="Fechar"
                            >
                                <X size={20} strokeWidth={2} />
                            </button>
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2 sm:px-5 sm:pb-5 sm:pt-3 md:px-8 md:pb-8">
                        <div className="grid grid-cols-7 gap-1 pb-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 sm:gap-2 sm:text-xs md:text-sm">
                            {WEEK_LABELS.map((w) => (
                                <div key={w} className="py-2 sm:py-3">
                                    {w}
                                </div>
                            ))}
                        </div>
                        <div className="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-7 gap-1.5 sm:gap-2 md:gap-3">
                            {cells.map((cell, idx) => {
                                if (!cell) {
                                    return <div key={`e-${idx}`} className="rounded-2xl" />;
                                }
                                const k = dayKeyAtMidnight(cell);
                                const has = (byDay[k] || []).length > 0;
                                const isSel = k === selectedKey;
                                const isToday = k === dayKeyAtMidnight(new Date());
                                return (
                                    <button
                                        type="button"
                                        key={k}
                                        onClick={() => setSelectedKey(k)}
                                        className={`flex min-h-[2.5rem] flex-col items-center justify-center rounded-2xl text-sm font-medium tabular-nums transition-colors sm:min-h-[3rem] sm:text-base md:min-h-0 md:text-lg lg:text-xl ${
                                            isSel
                                                ? 'bg-cyan-500/30 text-cyan-50 ring-2 ring-cyan-400/50 shadow-[0_0_24px_rgba(34,211,238,0.15)]'
                                                : 'text-zinc-200 hover:bg-white/[0.08]'
                                        } ${isToday && !isSel ? 'ring-2 ring-white/20' : ''}`}
                                    >
                                        <span>{cell.getDate()}</span>
                                        {has ? (
                                            <span className="mt-1 flex h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)] sm:h-2 sm:w-2" />
                                        ) : (
                                            <span className="mt-1 h-1.5 w-1.5 sm:h-2 sm:w-2" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Lembretes do dia — faixa lateral larga */}
                <div className="relative z-10 flex max-h-[38vh] min-h-[180px] w-full shrink-0 flex-col border-t border-white/[0.08] bg-black/25 md:max-h-none md:w-[min(100%,26rem)] md:border-l md:border-t-0 lg:w-[min(100%,32rem)]">
                    <div className="shrink-0 border-b border-white/[0.06] px-4 py-3 sm:px-5 sm:py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Dia selecionado
                        </div>
                        <div className="mt-1 capitalize text-base font-medium leading-snug text-zinc-100 sm:text-lg">
                            {formatSelectedHeading(selectedKey)}
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 sm:space-y-3 sm:px-5 sm:py-4">
                        {selectedList.length === 0 ? (
                            <p className="py-8 text-center text-sm leading-relaxed text-zinc-500 sm:py-12 sm:text-base">
                                Nenhum lembrete neste dia.
                                <br />
                                Peça à ATHENAS para marcar na agenda.
                            </p>
                        ) : (
                            selectedList.map((r) => (
                                <div
                                    key={r.id}
                                    className="group flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-zinc-900/50 px-4 py-3 sm:px-4 sm:py-4"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="text-base font-medium text-zinc-100 sm:text-lg">{r.title}</div>
                                            {r.source === 'google' ? (
                                                <span className="rounded-md border border-sky-500/35 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200/95">
                                                    Google
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="mt-1 text-sm tabular-nums text-zinc-400">
                                            {new Date(r.startsAtMs).toLocaleTimeString('pt-BR', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </div>
                                        {r.source === 'google' && r.htmlLink ? (
                                            <a
                                                href={r.htmlLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-2 inline-block text-xs font-medium text-sky-400/90 hover:text-sky-300"
                                            >
                                                Abrir no Google Agenda
                                            </a>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onRemove(r.id)}
                                        title={
                                            r.source === 'google'
                                                ? 'Ocultar nesta vista (não apaga no Google)'
                                                : 'Remover'
                                        }
                                        className="shrink-0 rounded-xl p-2 text-zinc-500 opacity-70 transition-all hover:bg-rose-500/20 hover:text-rose-200 group-hover:opacity-100"
                                    >
                                        <X size={18} strokeWidth={2} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
