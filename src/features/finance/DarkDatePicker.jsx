import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function pad2(n) {
    return String(n).padStart(2, '0');
}

function toIso(y, m, d) {
    return `${y}-${pad2(m)}-${pad2(d)}`;
}

function isoValid(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

function formatDisplayPt(iso) {
    if (!isoValid(iso)) return 'Selecionar…';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseIsoToLocalDate(iso) {
    if (!isoValid(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Comparação YYYY-MM-DD */
function isoCmp(a, b) {
    if (!isoValid(a) || !isoValid(b)) return 0;
    return a < b ? -1 : a > b ? 1 : 0;
}

export default function DarkDatePicker({
    label,
    value,
    onChange,
    min = '2000-01-01',
    max,
    fieldId,
    openFieldId,
    setOpenFieldId,
}) {
    const triggerRef = useRef(null);
    const popoverRef = useRef(null);
    const isOpen = openFieldId === fieldId;
    const maxIso = max || toIso(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

    const valDate = parseIsoToLocalDate(value);
    const anchor = valDate || new Date();
    const [viewY, setViewY] = useState(anchor.getFullYear());
    const [viewM, setViewM] = useState(anchor.getMonth() + 1);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current) return;
        const r = triggerRef.current.getBoundingClientRect();
        const popH = 340;
        const spaceBelow = window.innerHeight - r.bottom;
        const flip = spaceBelow < popH && r.top > spaceBelow;
        setPos({
            top: flip ? r.top - popH - 8 : r.bottom + 8,
            left: Math.min(r.left, window.innerWidth - 300),
        });
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            const a = parseIsoToLocalDate(value) || new Date();
            setViewY(a.getFullYear());
            setViewM(a.getMonth() + 1);
        }
    }, [isOpen, value]);

    useEffect(() => {
        if (!isOpen) return;
        const onDoc = (e) => {
            const t = e.target;
            if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
            setOpenFieldId(null);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpenFieldId(null);
        };
        document.addEventListener('mousedown', onDoc, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onDoc, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [isOpen, setOpenFieldId]);

    const headerLabel = new Date(viewY, viewM - 1, 1).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
    });

    const minD = parseIsoToLocalDate(min);
    const canPrev =
        !minD ||
        viewY > minD.getFullYear() ||
        (viewY === minD.getFullYear() && viewM > minD.getMonth() + 1);

    const goPrev = () => {
        if (!canPrev) return;
        const d = new Date(viewY, viewM - 2, 1);
        setViewY(d.getFullYear());
        setViewM(d.getMonth() + 1);
    };

    const maxD = parseIsoToLocalDate(maxIso);

    const goNext = () => {
        const d = new Date(viewY, viewM, 1);
        const nextY = d.getFullYear();
        const nextM = d.getMonth() + 1;
        if (maxD && (nextY > maxD.getFullYear() || (nextY === maxD.getFullYear() && nextM > maxD.getMonth() + 1))) {
            return;
        }
        setViewY(nextY);
        setViewM(nextM);
    };

    const canNext =
        !maxD ||
        viewY < maxD.getFullYear() ||
        (viewY === maxD.getFullYear() && viewM < maxD.getMonth() + 1);

    const firstDow = new Date(viewY, viewM - 1, 1).getDay();
    const nDays = new Date(viewY, viewM, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i += 1) cells.push(null);
    for (let d = 1; d <= nDays; d += 1) cells.push(d);

    const today = new Date();
    const todayIso = toIso(today.getFullYear(), today.getMonth() + 1, today.getDate());

    const pickDay = (day) => {
        const iso = toIso(viewY, viewM, day);
        if (isoCmp(iso, min) < 0 || isoCmp(iso, maxIso) > 0) return;
        onChange(iso);
        setOpenFieldId(null);
    };

    const setToday = () => {
        if (isoCmp(todayIso, maxIso) > 0) return;
        if (isoCmp(todayIso, min) < 0) return;
        onChange(todayIso);
        setOpenFieldId(null);
    };

    const popover = isOpen ? (
        <div
            ref={popoverRef}
            role="dialog"
            aria-label={`Calendário ${label}`}
            className="fixed z-[1080] w-[min(calc(100vw-24px),280px)] rounded-2xl border border-zinc-600/45 bg-zinc-950/98 p-3 shadow-[0_24px_64px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
            style={{
                top: pos.top,
                left: Math.max(12, pos.left),
            }}
        >
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                <button
                    type="button"
                    onClick={goPrev}
                    disabled={!canPrev}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100 disabled:opacity-30"
                    aria-label="Mês anterior"
                >
                    <ChevronLeft size={18} strokeWidth={2} />
                </button>
                <div className="min-w-0 flex-1 text-center text-sm font-semibold capitalize tracking-tight text-zinc-100">
                    {headerLabel}
                </div>
                <button
                    type="button"
                    onClick={goNext}
                    disabled={!canNext}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100 disabled:opacity-30"
                    aria-label="Próximo mês"
                >
                    <ChevronRight size={18} strokeWidth={2} />
                </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                {WEEKDAY_LABELS.map((w) => (
                    <div key={w} className="py-1">
                        {w}
                    </div>
                ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((day, idx) =>
                    day == null ? (
                        <div key={`e-${idx}`} className="aspect-square" />
                    ) : (
                        <button
                            key={day}
                            type="button"
                            onClick={() => pickDay(day)}
                            disabled={(() => {
                                const iso = toIso(viewY, viewM, day);
                                return isoCmp(iso, min) < 0 || isoCmp(iso, maxIso) > 0;
                            })()}
                            className={`relative flex aspect-square items-center justify-center rounded-xl text-sm font-medium tabular-nums transition-colors ${
                                value === toIso(viewY, viewM, day)
                                    ? 'bg-cyan-500/30 text-cyan-100 ring-1 ring-cyan-400/40'
                                    : todayIso === toIso(viewY, viewM, day)
                                      ? 'text-zinc-100 ring-1 ring-zinc-500/50'
                                      : 'text-zinc-300 hover:bg-white/[0.08]'
                            } disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent`}
                        >
                            {day}
                        </button>
                    ),
                )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-zinc-700/50 pt-2">
                <button
                    type="button"
                    onClick={() => {
                        onChange('');
                        setOpenFieldId(null);
                    }}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
                >
                    Limpar
                </button>
                <button
                    type="button"
                    onClick={setToday}
                    disabled={isoCmp(todayIso, maxIso) > 0 || isoCmp(todayIso, min) < 0}
                    className="text-xs font-medium text-cyan-300/90 hover:text-cyan-200 disabled:opacity-35"
                >
                    Hoje
                </button>
            </div>
        </div>
    ) : null;

    return (
        <div className="flex w-[11.25rem] shrink-0 flex-col gap-1 sm:w-[12.25rem]">
            <span className="text-[11px] text-zinc-500">{label}</span>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpenFieldId(isOpen ? null : fieldId)}
                className="flex h-10 w-full max-w-full items-center justify-between gap-2 rounded-xl border border-zinc-600/40 bg-zinc-900/70 px-2.5 text-left text-sm text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-zinc-500/55 hover:bg-zinc-800/80 focus:outline-none focus:ring-1 focus:ring-cyan-500/35"
            >
                <span
                    className={`min-w-0 truncate ${value && isoValid(value) ? 'tabular-nums text-zinc-100' : 'text-zinc-500'}`}
                >
                    {formatDisplayPt(value)}
                </span>
                <CalendarDays size={17} className="shrink-0 text-cyan-400/80" strokeWidth={1.7} />
            </button>
            {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
        </div>
    );
}
