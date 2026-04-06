import React, { useEffect, useMemo, useState } from 'react';
import {
    Building2,
    CalendarRange,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    RefreshCw,
    TrendingDown,
    TrendingUp,
    LayoutDashboard,
    ListOrdered,
    SlidersHorizontal,
    Wallet,
    X,
  } from 'lucide-react';
import DarkDatePicker from './DarkDatePicker';
import { getBankIconUrl, getCardNetworkIconUrl } from './bankIcons';

function moneyBr(v) {
    const n = Number(v ?? 0);
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function moneyBrOrDash(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
    return moneyBr(v);
}

const SUBTYPE_PT = {
    CHECKING_ACCOUNT: 'Conta corrente',
    SAVINGS_ACCOUNT: 'Poupança',
    PAYMENT_ACCOUNT: 'Conta pagamento',
    SALARY_ACCOUNT: 'Conta salário',
    PREPAID_ACCOUNT: 'Conta pré-paga',
    INVESTMENT_ACCOUNT: 'Investimentos',
};

function subtypeLabel(sub) {
    if (!sub) return null;
    const u = String(sub).toUpperCase().replace(/\s/g, '_');
    return SUBTYPE_PT[u] || String(sub).replace(/_/g, ' ').toLowerCase();
}

function formatSynced(syncedAtMs) {
    const n = Number(syncedAtMs);
    if (!Number.isFinite(n) || n <= 0) return null;
    try {
        return new Date(n).toLocaleString('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return null;
    }
}

function formatMonthTitlePt(y, m) {
    try {
        return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    } catch {
        return `${m}/${y}`;
    }
}

function formatMonthKickerPt(y, m) {
    try {
        const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
        return s.replace('.', '');
    } catch {
        return `${m}/${y}`;
    }
}

function formatRangeTitlePt(startIso, endIso) {
    try {
        const a = new Date(`${String(startIso).slice(0, 10)}T12:00:00`);
        const b = new Date(`${String(endIso).slice(0, 10)}T12:00:00`);
        const o = { day: '2-digit', month: 'long', year: 'numeric' };
        return `${a.toLocaleDateString('pt-BR', o)} – ${b.toLocaleDateString('pt-BR', o)}`;
    } catch {
        return `${startIso} – ${endIso}`;
    }
}

function maxIsoDateToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Data e hora local (pt-BR). */
function formatTxDateTimeBr(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return new Date(n).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

const TX_DATE_CAL_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Preferir dia do extrato (date_calendar) para coincidir com filtros e fatura. */
function formatTxDisplayWhen(tx) {
    const dc = tx?.date_calendar;
    if (typeof dc === 'string' && TX_DATE_CAL_RE.test(dc)) {
        const [y, m, d] = dc.split('-').map(Number);
        if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
            return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
        }
    }
    return formatTxDateTimeBr(tx?.date_ms);
}

/** KPI — mesmo peso visual dos selects/cards da Agenda */
function KpiTile({ kicker, value, hint, valueClass = 'text-zinc-50' }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 transition-colors sm:py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[11px]">{kicker}</div>
            <div className={`mt-2 break-words text-lg font-semibold tabular-nums sm:text-xl md:text-2xl ${valueClass}`}>{value}</div>
            {hint ? <div className="mt-1 text-[11px] leading-tight text-zinc-600">{hint}</div> : null}
        </div>
    );
}

function PanelBlockTitle({ children }) {
    return (
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[11px]">{children}</div>
    );
}

function FinanceMainTabs({ value, onChange }) {
    const base =
        'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-5';
    return (
        <div
            className="flex shrink-0 gap-1 border-b border-white/[0.07] bg-black/20 px-3 py-2 sm:px-5"
            role="tablist"
            aria-label="Seções do financeiro"
        >
            <button
                type="button"
                role="tab"
                aria-selected={value === 'overview'}
                onClick={() => onChange('overview')}
                className={`${base} ${
                    value === 'overview'
                        ? 'bg-white/[0.1] text-zinc-100 ring-1 ring-white/[0.12]'
                        : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300'
                }`}
            >
                <LayoutDashboard size={17} strokeWidth={1.8} className="opacity-90" />
                Visão geral
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={value === 'transactions'}
                onClick={() => onChange('transactions')}
                className={`${base} ${
                    value === 'transactions'
                        ? 'bg-white/[0.1] text-zinc-100 ring-1 ring-white/[0.12]'
                        : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300'
                }`}
            >
                <ListOrdered size={17} strokeWidth={1.8} className="opacity-90" />
                Transações
            </button>
        </div>
    );
}

function BankRowCard({ item }) {
    const bal = Number(item.balance ?? 0);
    const sub = subtypeLabel(item.subtype);
    const bankSrc = getBankIconUrl(item);
    const odL = item.overdraft_limit != null ? Number(item.overdraft_limit) : null;
    const odU = item.overdraft_used != null ? Number(item.overdraft_used) : null;

    return (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-zinc-900/50 px-4 py-3 sm:px-4 sm:py-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-black/25">
                    {bankSrc ? (
                        <img src={bankSrc} alt="" className="h-full w-full object-contain p-0.5" />
                    ) : (
                        <Building2 size={18} className="text-zinc-500" strokeWidth={1.5} />
                    )}
                </div>
                <div className="min-w-0">
                    <div className="truncate text-base font-medium text-zinc-100 sm:text-lg">{item.name}</div>
                    <div className="mt-1 truncate text-sm tabular-nums text-zinc-400">
                        {[sub, item.number_last4 ? `· ${item.number_last4}` : null].filter(Boolean).join(' ')}
                        {odL != null && odL > 0 && (
                            <span className="text-zinc-600">
                                {' '}
                                · cheque especial {moneyBr(odU ?? 0)} / {moneyBr(odL)}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <div className={`shrink-0 text-base font-semibold tabular-nums sm:text-lg ${bal < 0 ? 'text-rose-300/95' : 'text-cyan-100/95'}`}>
                {moneyBr(bal)}
            </div>
        </div>
    );
}

function TransactionRow({ tx, matchedAccount }) {
    const inc = tx.kind === 'income';
    const account =
        (typeof matchedAccount?.name === 'string' && matchedAccount.name.trim()) ||
        (typeof tx.account_name === 'string' && tx.account_name.trim()) ||
        null;

    const iconSource =
        matchedAccount ||
        (account || tx.institution
            ? {
                  institution: typeof tx.institution === 'string' ? tx.institution : '',
                  name: account || '',
                  marketing_name: (typeof tx.account_name === 'string' && tx.account_name) || account || '',
              }
            : null);

    const bankSrc = iconSource ? getBankIconUrl(iconSource) : null;
    const networkSrc = matchedAccount ? getCardNetworkIconUrl(matchedAccount) : null;

    return (
        <div className="rounded-xl border border-zinc-600/40 bg-zinc-800/55 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-4">
            <div className="flex gap-3 sm:gap-4">
                <div className="relative h-11 w-11 shrink-0">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-zinc-500/35 bg-zinc-900/70">
                        {bankSrc ? (
                            <img src={bankSrc} alt="" className="h-full w-full object-contain p-1" />
                        ) : networkSrc ? (
                            <img src={networkSrc} alt="" className="h-full w-full object-contain p-1.5" />
                        ) : (
                            <Building2 size={20} className="text-zinc-500" strokeWidth={1.5} />
                        )}
                    </div>
                    {bankSrc && networkSrc ? (
                        <div
                            className="absolute -bottom-1 -right-1 flex h-6 w-8 items-center justify-center overflow-hidden rounded-md border border-zinc-600/50 bg-zinc-950 p-0.5 shadow-md"
                            title={matchedAccount?.credit_brand || ''}
                        >
                            <img src={networkSrc} alt="" className="h-full w-full object-contain" />
                        </div>
                    ) : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                        <div className="text-[10px] font-medium tabular-nums tracking-wide text-zinc-400 sm:text-xs">
                            {formatTxDisplayWhen(tx)}
                        </div>
                        <div>
                            <div className="break-words text-sm font-semibold leading-snug text-zinc-50 sm:text-base">
                                {tx.description?.trim() ? tx.description : '—'}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs">
                                <span className="inline-flex max-w-full items-center rounded-md border border-zinc-600/40 bg-zinc-900/50 px-2 py-0.5 font-medium text-zinc-300">
                                    <span className="truncate">{tx.category || 'Sem categoria'}</span>
                                </span>
                                {account ? (
                                    <>
                                        <span className="text-zinc-500" aria-hidden>
                                            ·
                                        </span>
                                        <span className="min-w-0 truncate text-zinc-400" title={account}>
                                            {account}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-zinc-500" aria-hidden>
                                            ·
                                        </span>
                                        <span className="text-zinc-500">Conta não informada</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="shrink-0 border-t border-zinc-600/35 pt-2 sm:border-t-0 sm:pt-0 sm:text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Valor</div>
                        <div
                            className={`mt-1 text-base font-semibold tabular-nums sm:text-lg ${inc ? 'text-emerald-300/95' : 'text-rose-200/95'}`}
                        >
                            {inc ? '+' : '−'}
                            {moneyBr(tx.amount)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CardRowCard({ item }) {
    const bal = Number(item.balance ?? 0);
    const limit = item.credit_limit != null ? Number(item.credit_limit) : null;
    const avail = item.available_credit != null ? Number(item.available_credit) : null;
    const bankSrc = getBankIconUrl(item);
    const networkSrc = getCardNetworkIconUrl(item);
    const last4 = item.number_last4;
    const meta = [item.credit_brand, item.credit_level].filter(Boolean).join(' · ');

    let usedPct = 0;
    if (limit != null && limit > 0) {
        const used = avail != null ? Math.max(0, limit - avail) : bal;
        usedPct = Math.min(100, (used / limit) * 100);
    }

    return (
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 px-4 py-3 sm:px-4 sm:py-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-black/25">
                            {bankSrc ? (
                                <img src={bankSrc} alt="" className="h-full w-full object-contain p-1" />
                            ) : networkSrc ? (
                                <img src={networkSrc} alt="" className="h-full w-full object-contain p-1.5" />
                            ) : (
                                <CreditCard size={20} className="text-cyan-400/85" strokeWidth={1.5} />
                            )}
                        </div>
                        {bankSrc && networkSrc ? (
                            <div
                                className="absolute -bottom-1 -right-1 flex h-7 w-[2.125rem] items-center justify-center overflow-hidden rounded-lg border border-white/[0.12] bg-zinc-950 p-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
                                title={item.credit_brand || 'Bandeira'}
                            >
                                <img src={networkSrc} alt="" className="h-full w-full object-contain" />
                            </div>
                        ) : null}
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-base font-medium text-zinc-100 sm:text-lg">
                            {item.name}
                            {last4 ? <span className="font-normal text-zinc-500"> ·••• {last4}</span> : null}
                        </div>
                        {meta ? <div className="mt-1 truncate text-sm text-zinc-400">{meta}</div> : null}
                    </div>
                </div>
            </div>
            {limit != null && limit > 0 && (
                <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-950/90 ring-1 ring-white/[0.06]">
                        <div className="h-full rounded-full bg-cyan-500/45" style={{ width: `${usedPct}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
                        <span>
                            Fatura: <span className="font-medium text-zinc-300">{moneyBr(bal)}</span>
                        </span>
                        <span>
                            Limite: <span className="tabular-nums text-zinc-300">{moneyBr(limit)}</span>
                        </span>
                        {avail != null ? (
                            <span>
                                Disponível:{' '}
                                <span className="font-medium tabular-nums text-cyan-200/95">{moneyBr(avail)}</span>
                            </span>
                        ) : null}
                    </div>
                </div>
            )}
            {(limit == null || limit <= 0) && (
                <div className="mt-3 flex flex-wrap gap-x-4 text-sm text-zinc-500">
                    <span>
                        Fatura / saldo: <span className="font-medium text-zinc-300">{moneyBr(bal)}</span>
                    </span>
                    {avail != null ? (
                        <span>
                            Disponível: <span className="text-cyan-200/95">{moneyBr(avail)}</span>
                        </span>
                    ) : null}
                </div>
            )}
        </div>
    );
}

export default function FinancePanel({
    open,
    onClose,
    snapshot,
    loading,
    error,
    onRefresh,
    financePeriod,
    onMonthChange,
    onApplyCustomRange,
    onSwitchToCustomPeriod,
    onBackToMonthMode,
}) {
    const fallback = new Date();
    const viewYear =
        financePeriod?.type === 'month' && Number.isFinite(Number(financePeriod?.year))
            ? Number(financePeriod.year)
            : fallback.getFullYear();
    const viewMonth =
        financePeriod?.type === 'month' && Number.isFinite(Number(financePeriod?.month))
            ? Number(financePeriod.month)
            : fallback.getMonth() + 1;
    const summary = snapshot?.summary || {};

    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    const canGoNext = viewYear < curY || (viewYear === curY && viewMonth < curM);

    const goPrevMonth = () => {
        const d = new Date(viewYear, viewMonth - 2, 1);
        onMonthChange?.(d.getFullYear(), d.getMonth() + 1);
    };
    const goNextMonth = () => {
        if (!canGoNext) return;
        const d = new Date(viewYear, viewMonth, 1);
        onMonthChange?.(d.getFullYear(), d.getMonth() + 1);
    };

    const transactions = useMemo(() => {
        const raw = snapshot?.transactions;
        return Array.isArray(raw) ? raw : [];
    }, [snapshot]);

    const accountById = useMemo(() => {
        const m = new Map();
        for (const a of snapshot?.accounts || []) {
            if (!a || a.id == null) continue;
            const id = String(a.id).trim();
            if (id) m.set(id, a);
        }
        return m;
    }, [snapshot]);

    const viewMeta = snapshot?.view && typeof snapshot.view === 'object' ? snapshot.view : null;
    const txIsCustomView = viewMeta?.mode === 'custom';
    const transactionsPeriodTitle =
        txIsCustomView && viewMeta?.start_date && viewMeta?.end_date
            ? formatRangeTitlePt(viewMeta.start_date, viewMeta.end_date)
            : formatMonthTitlePt(viewYear, viewMonth);
    const transactionsKicker =
        txIsCustomView && viewMeta?.start_date && viewMeta?.end_date
            ? `${viewMeta.start_date} – ${viewMeta.end_date}`
            : formatMonthKickerPt(viewYear, viewMonth);
    const viewRange =
        viewMeta?.start_date && viewMeta?.end_date ? `${viewMeta.start_date} → ${viewMeta.end_date}` : null;

    const [customStartDraft, setCustomStartDraft] = useState('');
    const [customEndDraft, setCustomEndDraft] = useState('');
    useEffect(() => {
        if (!open) return;
        if (financePeriod?.type === 'custom' && financePeriod.start_date && financePeriod.end_date) {
            setCustomStartDraft(financePeriod.start_date);
            setCustomEndDraft(financePeriod.end_date);
        }
    }, [open, financePeriod]);

    const applyCustomPeriod = () => {
        const a = String(customStartDraft || '').trim().slice(0, 10);
        const b = String(customEndDraft || '').trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return;
        let start = a <= b ? a : b;
        let end = a <= b ? b : a;
        const max = maxIsoDateToday();
        if (end > max) end = max;
        if (start > end) start = end;
        onApplyCustomRange?.(start, end);
    };

    const periodSegmentBase =
        'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors sm:text-sm';

    const bankList = useMemo(() => {
        const fromBank = snapshot?.bank_accounts;
        if (Array.isArray(fromBank) && fromBank.length) return fromBank;
        const all = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
        return all.filter((a) => a.product_group !== 'card');
    }, [snapshot]);

    const cardList = useMemo(() => {
        const fromApi = snapshot?.credit_cards;
        if (Array.isArray(fromApi) && fromApi.length) return fromApi;
        const all = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
        return all.filter((a) => a.product_group === 'card');
    }, [snapshot]);

    const bankTotal =
        typeof summary.bank_balance_total === 'number'
            ? summary.bank_balance_total
            : bankList.reduce((s, a) => s + Number(a.balance ?? 0), 0);

    const cardsBillTotal =
        typeof summary.cards_balance_total === 'number'
            ? summary.cards_balance_total
            : cardList.reduce((s, a) => s + Number(a.balance ?? 0), 0);

    const syncedLabel = formatSynced(snapshot?.synced_at_ms);

    const sortedBanks = useMemo(
        () => [...bankList].sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0)),
        [bankList],
    );
    const sortedCards = useMemo(
        () => [...cardList].sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0)),
        [cardList],
    );

    const [mainTab, setMainTab] = useState('overview');
    const [financeDatePickerOpen, setFinanceDatePickerOpen] = useState(null);
    useEffect(() => {
        if (open) setMainTab('overview');
    }, [open]);
    useEffect(() => {
        if (!open) setFinanceDatePickerOpen(null);
    }, [open]);

    if (!open) return null;

    const limTotal = summary.credit_limit_total;
    const availTotal = summary.credit_available_total;

    return (
        <div
            className="fixed inset-0 z-[72] flex items-stretch justify-center bg-black/65 p-2 pt-12 pb-2 backdrop-blur-md sm:p-3 sm:pt-14 sm:pb-3"
            role="presentation"
            onClick={onClose}
        >
            <div
                className="relative flex h-full w-full max-h-[calc(100dvh-3rem)] max-w-[1900px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/92 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_32px_120px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:rounded-3xl"
                role="dialog"
                aria-label="Dashboard financeiro"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_32%)] sm:rounded-3xl" />

                <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-6 sm:py-5">
                        <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500 sm:text-xs">
                                OrbitalSync · Financeiro
                            </div>
                            <div className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl md:text-3xl">
                                {mainTab === 'transactions' ? 'Transações' : 'Contas e cartões'}
                            </div>
                            {syncedLabel ? (
                                <p className="mt-1 text-sm text-zinc-500">Pierre · {syncedLabel}</p>
                            ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                            <button
                                type="button"
                                onClick={onRefresh}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-500/20 sm:h-11 sm:px-4"
                            >
                                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} strokeWidth={2} />
                                Atualizar
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-white/[0.1] hover:text-zinc-100 sm:h-11 sm:w-11"
                                title="Fechar"
                            >
                                <X size={20} strokeWidth={2} />
                            </button>
                        </div>
                    </div>

                    <FinanceMainTabs value={mainTab} onChange={setMainTab} />

                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 pt-2 sm:px-5 sm:pb-5 sm:pt-3 md:px-8 md:pb-8">
                        {mainTab === 'overview' ? (
                            <>
                                <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                                    <KpiTile
                                        kicker="Saldo em contas"
                                        value={moneyBr(bankTotal)}
                                        hint={`${bankList.length} conta(s)`}
                                        valueClass={bankTotal < 0 ? 'text-rose-200' : 'text-zinc-50'}
                                    />
                                    <KpiTile
                                        kicker="Fatura cartões"
                                        value={moneyBr(cardsBillTotal)}
                                        hint={`${cardList.length} cartão(ões)`}
                                        valueClass="text-zinc-100"
                                    />
                                    <KpiTile
                                        kicker="Limite total"
                                        value={moneyBrOrDash(limTotal)}
                                        hint={
                                            summary.credit_cards_with_limit_count
                                                ? `${summary.credit_cards_with_limit_count} com limite`
                                                : 'Open Finance'
                                        }
                                    />
                                    <KpiTile
                                        kicker="Disponível"
                                        value={moneyBrOrDash(availTotal)}
                                        hint="Limite disponível"
                                        valueClass="text-cyan-100/95"
                                    />
                                </div>

                                <div className="mt-4">
                                    <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/22 bg-cyan-500/[0.08] px-4 py-3 shadow-[inset_0_1px_0_rgba(34,211,238,0.1)] sm:py-4 md:max-w-xl">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/12 ring-1 ring-cyan-400/25 sm:h-11 sm:w-11">
                                            <Wallet size={22} className="text-cyan-400/95" strokeWidth={2} />
                                        </div>
                                        <div>
                                            <PanelBlockTitle>Soma contas + faturas</PanelBlockTitle>
                                            <div className="mt-1 text-lg font-semibold tabular-nums text-cyan-50 sm:text-xl">
                                                {moneyBr(summary.current_balance)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-5 lg:gap-8 md:items-start">
                                    <div className="min-w-0">
                                        <div className="shrink-0 border-b border-white/[0.06] pb-3">
                                            <PanelBlockTitle>Contas bancárias</PanelBlockTitle>
                                            <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                                                Saldos e cheque especial, quando informado pela instituição.
                                            </p>
                                        </div>
                                        <div className="space-y-2 py-3 sm:space-y-3 sm:py-4">
                                            {sortedBanks.length === 0 ? (
                                                <p className="py-8 text-center text-sm text-zinc-500 sm:py-12">Nenhuma conta retornada.</p>
                                            ) : (
                                                sortedBanks.map((a) => <BankRowCard key={a.id} item={a} />)
                                            )}
                                        </div>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="shrink-0 border-b border-white/[0.06] pb-3">
                                            <div className="flex items-center gap-2">
                                                <CreditCard size={16} className="text-cyan-400/85" strokeWidth={1.6} />
                                                <PanelBlockTitle>Cartões de crédito</PanelBlockTitle>
                                            </div>
                                            <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                                                Fatura, limite e disponível (Open Finance / Pierre).
                                            </p>
                                        </div>
                                        <div className="space-y-2 py-3 sm:space-y-3 sm:py-4">
                                            {sortedCards.length === 0 ? (
                                                <p className="py-8 text-center text-sm leading-relaxed text-zinc-500 sm:py-12">
                                                    Nenhum cartão retornado.
                                                    <br />
                                                    Dados via Open Finance na Pierre.
                                                </p>
                                            ) : (
                                                sortedCards.map((a) => <CardRowCard key={a.id} item={a} />)
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="mt-2 space-y-3 rounded-2xl border border-white/[0.08] bg-zinc-900/40 px-3 py-3 sm:px-4">
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => financePeriod?.type !== 'month' && onBackToMonthMode?.()}
                                            className={`${periodSegmentBase} ${
                                                financePeriod?.type === 'month'
                                                    ? 'bg-white/[0.1] text-zinc-100 ring-1 ring-white/[0.12]'
                                                    : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300'
                                            }`}
                                        >
                                            <CalendarRange size={16} strokeWidth={1.8} />
                                            Por mês
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => financePeriod?.type !== 'custom' && onSwitchToCustomPeriod?.()}
                                            className={`${periodSegmentBase} ${
                                                financePeriod?.type === 'custom'
                                                    ? 'bg-white/[0.1] text-zinc-100 ring-1 ring-white/[0.12]'
                                                    : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300'
                                            }`}
                                        >
                                            <SlidersHorizontal size={16} strokeWidth={1.8} />
                                            Personalizado
                                        </button>
                                    </div>

                                    {financePeriod?.type === 'month' ? (
                                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[11px]">
                                                    Mês de calendário
                                                </div>
                                                <div className="mt-1 truncate text-base font-medium capitalize text-zinc-100 sm:text-lg">
                                                    {transactionsPeriodTitle}
                                                </div>
                                                {viewRange ? (
                                                    <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500">{viewRange}</div>
                                                ) : null}
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={goPrevMonth}
                                                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                                                    title="Mês anterior"
                                                    aria-label="Mês anterior"
                                                >
                                                    <ChevronLeft size={22} strokeWidth={2} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={goNextMonth}
                                                    disabled={!canGoNext}
                                                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.1] text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                                                    title="Próximo mês"
                                                    aria-label="Próximo mês"
                                                >
                                                    <ChevronRight size={22} strokeWidth={2} />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 border-t border-white/[0.06] pt-3">
                                            <div>
                                                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[11px]">
                                                    Intervalo personalizado
                                                </div>
                                                <div className="mt-0.5 text-xs text-zinc-500">
                                                    Máx. 366 dias · fim até hoje
                                                </div>
                                            </div>
                                            <div className="flex max-w-full flex-wrap items-end gap-2">
                                                <DarkDatePicker
                                                    label="Início"
                                                    value={customStartDraft}
                                                    onChange={setCustomStartDraft}
                                                    min="2000-01-01"
                                                    max={maxIsoDateToday()}
                                                    fieldId="tx-start"
                                                    openFieldId={financeDatePickerOpen}
                                                    setOpenFieldId={setFinanceDatePickerOpen}
                                                />
                                                <DarkDatePicker
                                                    label="Fim"
                                                    value={customEndDraft}
                                                    onChange={setCustomEndDraft}
                                                    min="2000-01-01"
                                                    max={maxIsoDateToday()}
                                                    fieldId="tx-end"
                                                    openFieldId={financeDatePickerOpen}
                                                    setOpenFieldId={setFinanceDatePickerOpen}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={applyCustomPeriod}
                                                    className="h-10 shrink-0 rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-3 text-sm font-medium text-cyan-100 hover:bg-cyan-500/25 sm:px-4"
                                                >
                                                    Aplicar período
                                                </button>
                                            </div>
                                            <div className="max-w-xl truncate text-xs font-medium text-zinc-400">
                                                {transactionsPeriodTitle}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
                                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.09] px-4 py-3 shadow-[inset_0_1px_0_rgba(52,211,153,0.12)] sm:py-4">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/25 sm:h-11 sm:w-11">
                                            <TrendingUp size={22} className="text-emerald-400/95" strokeWidth={2} />
                                        </div>
                                        <div>
                                            <PanelBlockTitle>{`Receitas (${transactionsKicker})`}</PanelBlockTitle>
                                            <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-100 sm:text-xl">
                                                {moneyBr(summary.income_month)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/[0.09] px-4 py-3 shadow-[inset_0_1px_0_rgba(251,113,133,0.12)] sm:py-4">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 ring-1 ring-rose-400/25 sm:h-11 sm:w-11">
                                            <TrendingDown size={22} className="text-rose-400/95" strokeWidth={2} />
                                        </div>
                                        <div>
                                            <PanelBlockTitle>{`Despesas (${transactionsKicker})`}</PanelBlockTitle>
                                            <div className="mt-1 text-lg font-semibold tabular-nums text-rose-100 sm:text-xl">
                                                {moneyBr(summary.expense_month)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 rounded-2xl border border-zinc-500/25 bg-zinc-800/40 px-4 py-3 shadow-[inset_0_1px_0_rgba(161,161,170,0.08)] sm:py-4">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-700/50 ring-1 ring-zinc-500/25 sm:h-11 sm:w-11">
                                            <Wallet size={22} className="text-zinc-300" strokeWidth={2} />
                                        </div>
                                        <div>
                                            <PanelBlockTitle>{txIsCustomView ? 'Saldo do período' : 'Saldo do mês'}</PanelBlockTitle>
                                            <div
                                                className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${
                                                    Number(summary.net_month) >= 0 ? 'text-emerald-100/90' : 'text-rose-100/90'
                                                }`}
                                            >
                                                {moneyBr(summary.net_month)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 shrink-0 border-b border-white/[0.06] pb-3">
                                    <PanelBlockTitle>Lançamentos</PanelBlockTitle>
                                    <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                                        Lista do período selecionado (Open Finance / Pierre).
                                    </p>
                                </div>
                                <div className="min-h-0 flex-1 space-y-2 py-3 pb-8 sm:space-y-2 sm:py-4">
                                    {transactions.length === 0 ? (
                                        <p className="py-10 text-center text-sm text-zinc-500">Nenhum lançamento neste período.</p>
                                    ) : (
                                        transactions.map((tx) => {
                                            const aid = tx.account_id != null ? String(tx.account_id).trim() : '';
                                            const matched = aid ? accountById.get(aid) : undefined;
                                            return <TransactionRow key={tx.id} tx={tx} matchedAccount={matched} />;
                                        })
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
                </div>

                {(loading || error) && (
                    <div className="relative z-10 shrink-0 border-t border-white/[0.08] bg-black/55 px-4 py-2 text-center text-[11px] text-zinc-400">
                        {loading
                            ? 'Sincronizando com os bancos (Open Finance)… pode levar alguns segundos.'
                            : error}
                    </div>
                )}
            </div>
        </div>
    );
}
