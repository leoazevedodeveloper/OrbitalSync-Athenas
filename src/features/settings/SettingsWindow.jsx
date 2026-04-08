import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    Shield,
    Mic,
    Volume2,
    Video,
    MousePointer2,
    Hand,
    Palette,
    Wrench,
    AppWindow,
    Copy,
    Check,
    FileJson,
    RefreshCw,
    FolderOpen,
    Plug2,
    Database,
    Sparkles,
    Webhook,
    ExternalLink,
    Activity,
    Loader2,
    KeyRound,
    Save,
    ChevronRight,
    Bot,
    Brain,
    FileText,
    Layers,
    Search,
    SlidersHorizontal,
    Users,
    History,
    Eye,
    EyeOff,
    ChevronDown,
    Wallet,
} from 'lucide-react';

const TOOLS = [
    { id: 'create_directory', label: 'Criar pasta' },
    { id: 'write_file', label: 'Escrever arquivo' },
    { id: 'read_directory', label: 'Listar diretório' },
    { id: 'read_file', label: 'Ler arquivo' },
    { id: 'create_project', label: 'Criar projeto' },
    { id: 'switch_project', label: 'Trocar projeto' },
    { id: 'list_projects', label: 'Listar projetos' },
    { id: 'generate_image', label: 'Gerar imagem (ComfyUI)' },
    { id: 'list_launch_apps', label: 'Listar apps locais' },
    { id: 'launch_app', label: 'Abrir app local' },
    { id: 'trigger_webhook', label: 'Webhooks / automação' },
];

/* Mesma base do chat: Quicksand (font-sans) + negrito, melhor leitura no escuro */
const settingsType = 'font-sans font-bold antialiased';

const sectionTitleClass =
    'flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-200 mb-3';

const fieldClass =
    'relative z-[1] w-full rounded-xl border border-white/15 bg-black/55 px-3 py-2.5 text-xs font-bold text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] focus:border-cyan-500/35 focus:ring-1 focus:ring-cyan-500/15 outline-none transition-colors pointer-events-auto placeholder:text-zinc-500';

const rowClass =
    'relative z-[1] flex items-center justify-between gap-3 text-xs font-bold rounded-xl border border-white/15 bg-black/60 px-3 py-2.5 text-zinc-100 hover:border-white/25 transition-colors pointer-events-auto';

const panelClass =
    'rounded-[1.25rem] border border-white/15 bg-black/60 shadow-[0_12px_40px_rgba(0,0,0,0.45)]';

function suggestLaunchAppIdFromPath(absPath) {
    const normalized = absPath.replace(/\\/g, '/');
    const file = normalized.split('/').pop() || 'app';
    const stem = file.replace(/\.[^.]+$/, '');
    let s = stem
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!s) s = 'app';
    if (!/^[a-z0-9]/i.test(s)) s = `app-${s}`;
    return s.slice(0, 64);
}

function defaultLabelFromPath(absPath) {
    const normalized = absPath.replace(/\\/g, '/');
    const file = normalized.split('/').pop() || 'App';
    const stem = file.replace(/\.[^.]+$/, '');
    return stem.replace(/_/g, ' ').trim() || 'App';
}

function shortPath(p) {
    if (!p || typeof p !== 'string') return '—';
    const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length <= 2) return p;
    return `…/${parts.slice(-2).join('/')}`;
}

/** Alinha com `semantic_embed_senders` no backend (User, ATHENAS, * ou all). */
function parseSemanticEmbedSenders(s) {
    const raw = (s || '').trim();
    const t = raw.toLowerCase();
    if (t === '*' || t === 'all') {
        return { all: true, user: true, athenas: true };
    }
    const parts = new Set(
        raw
            .split(',')
            .map((x) => x.trim().toLowerCase())
            .filter(Boolean)
    );
    return {
        all: false,
        user: parts.has('user'),
        athenas: parts.has('athenas'),
    };
}

function buildSemanticEmbedSenders({ all, user, athenas }) {
    if (all) return '*';
    const bits = [];
    if (user) bits.push('User');
    if (athenas) bits.push('ATHENAS');
    return bits.length ? bits.join(', ') : 'User';
}

function semanticSendersBadgeLabel(s) {
    const f = parseSemanticEmbedSenders(s);
    if (f.all) return '*';
    const bits = [];
    if (f.user) bits.push('User');
    if (f.athenas) bits.push('ATHENAS');
    return bits.join(' + ') || 'User';
}

function maskDots(length) {
    const n = Math.min(Math.max(0, Number(length) || 0), 64);
    return n > 0 ? '•'.repeat(n) : '';
}

/**
 * Chave guardada no servidor: mostra ••• e olho para carregar o valor; com valor, input + olho para texto/claro.
 */
function SecretCredentialField({ label, value, setValue, placeholder, configured, secretLength, field, socket, disabled }) {
    const [showPlain, setShowPlain] = useState(false);
    const [revealing, setRevealing] = useState(false);
    const [revealError, setRevealError] = useState(null);

    useEffect(() => {
        const onRevealed = (p) => {
            if (!p || typeof p !== 'object' || p.field !== field) return;
            setRevealing(false);
            if (p.ok) {
                setRevealError(null);
                setValue(typeof p.value === 'string' ? p.value : '');
                setShowPlain(true);
            } else {
                setRevealError(p.message || 'Não foi possível obter a chave.');
            }
        };
        socket.on('setting_secret_revealed', onRevealed);
        return () => socket.off('setting_secret_revealed', onRevealed);
    }, [socket, field, setValue]);

    const hasValue = (value || '').length > 0;
    const len = typeof secretLength === 'number' ? secretLength : 0;
    const showMaskedOnly = !hasValue && !!configured && len > 0;

    const requestReveal = () => {
        setRevealError(null);
        setRevealing(true);
        socket.emit('reveal_setting_secret', { field });
    };

    return (
        <div>
            <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-zinc-400">{label}</label>
            {showMaskedOnly ? (
                <div
                    className={`${fieldClass} flex items-center justify-between gap-2 py-2 pl-3 pr-1`}
                    style={{ WebkitAppRegion: 'no-drag' }}
                >
                    <span
                        className="min-w-0 flex-1 truncate font-mono text-sm tracking-[0.2em] text-zinc-400 select-none"
                        aria-hidden
                    >
                        {maskDots(len)}
                    </span>
                    <button
                        type="button"
                        onClick={requestReveal}
                        disabled={disabled || revealing}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-zinc-100 disabled:opacity-40"
                        style={{ WebkitAppRegion: 'no-drag' }}
                        title="Carregar chave do servidor e mostrar"
                        aria-label="Carregar chave do servidor e mostrar"
                    >
                        {revealing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                    </button>
                </div>
            ) : (
                <div className="relative z-[1]" style={{ WebkitAppRegion: 'no-drag' }}>
                    <input
                        type={showPlain ? 'text' : 'password'}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={placeholder}
                        disabled={disabled}
                        className={`${fieldClass} pr-11 !z-0`}
                        autoComplete="new-password"
                    />
                    <button
                        type="button"
                        onClick={() => (hasValue ? setShowPlain((v) => !v) : requestReveal())}
                        disabled={disabled || revealing}
                        className="pointer-events-auto absolute right-1.5 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-transparent bg-black/55 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200 disabled:opacity-40"
                        style={{ WebkitAppRegion: 'no-drag' }}
                        title={hasValue ? (showPlain ? 'Ocultar chave' : 'Mostrar chave') : 'Carregar chave do servidor'}
                        aria-label={hasValue ? (showPlain ? 'Ocultar chave' : 'Mostrar chave') : 'Carregar chave do servidor'}
                    >
                        {revealing && !hasValue ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : showPlain && hasValue ? (
                            <EyeOff className="h-4 w-4" aria-hidden />
                        ) : (
                            <Eye className="h-4 w-4" aria-hidden />
                        )}
                    </button>
                </div>
            )}
            {revealError ? <p className="mt-1.5 text-[10px] text-rose-300">{revealError}</p> : null}
        </div>
    );
}

function IntegrationStatusPill({ active, children }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                active
                    ? 'border border-emerald-400/35 bg-emerald-500/15 text-emerald-100 shadow-[0_0_16px_rgba(16,185,129,0.12)]'
                    : 'border border-white/10 bg-black/45 text-zinc-500'
            }`}
        >
            {children}
        </span>
    );
}

function IntegrationTestStrip({ data, nested }) {
    if (!data) return null;
    const tier = data.tier || 'down';
    const ring =
        tier === 'up'
            ? 'border-emerald-500/35 bg-emerald-950/30 text-emerald-100'
            : tier === 'degraded'
              ? 'border-amber-500/35 bg-amber-950/30 text-amber-100'
              : 'border-rose-500/30 bg-rose-950/25 text-rose-100';
    const title =
        tier === 'up' ? 'Teste · online' : tier === 'degraded' ? 'Teste · parcial' : 'Teste · inacessível';
    const box = nested ? 'mt-0 rounded-lg border px-2.5 py-2' : 'mt-3 rounded-xl border px-3 py-2.5';
    return (
        <div
            className={`${box} ${ring}`}
            role="status"
            aria-live="polite"
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{title}</span>
                {typeof data.latency_ms === 'number' ? (
                    <span className="font-mono text-[10px] text-zinc-400">{data.latency_ms} ms</span>
                ) : null}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">{data.message}</p>
            {data.status_code != null ? (
                <p className="mt-0.5 font-mono text-[9px] text-zinc-400">HTTP {data.status_code}</p>
            ) : null}
            {data.path_checked ? (
                <p className="mt-0.5 font-mono text-[9px] text-zinc-400">{data.path_checked}</p>
            ) : null}
        </div>
    );
}

function IntegrationWebhookTestStrip({ data, nested }) {
    if (!data) return null;
    const tier = data.tier || 'down';
    const ring =
        tier === 'up'
            ? 'border-emerald-500/35 bg-emerald-950/30 text-emerald-100'
            : tier === 'degraded'
              ? 'border-amber-500/35 bg-amber-950/30 text-amber-100'
              : 'border-rose-500/30 bg-rose-950/25 text-rose-100';
    const title =
        tier === 'up' ? 'Teste · URLs OK' : tier === 'degraded' ? 'Teste · algumas falharam' : 'Teste · sem resposta';
    const box = nested ? 'mt-0 rounded-lg border px-2.5 py-2' : 'mt-3 rounded-xl border px-3 py-2.5';
    const hookListClass = nested ? 'mt-2 max-h-24 space-y-1 overflow-y-auto border-t border-white/5 pt-2' : 'mt-2 max-h-[5.5rem] space-y-1 overflow-y-auto border-t border-white/5 pt-2';
    return (
        <div className={`${box} ${ring}`} role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{title}</span>
                {typeof data.latency_ms === 'number' ? (
                    <span className="font-mono text-[10px] text-zinc-400">{data.latency_ms} ms</span>
                ) : null}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">{data.message}</p>
            {Array.isArray(data.hooks) && data.hooks.length > 0 ? (
                <ul className={hookListClass}>
                    {data.hooks.map((h) => (
                        <li key={h.id} className="flex flex-col gap-0.5 text-[9px] sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                            <span className="shrink-0 font-mono text-emerald-200/80">{h.id}</span>
                            <span className="min-w-0 flex-1">
                                <span
                                    className={
                                        h.tier === 'up'
                                            ? 'text-emerald-300/90'
                                            : h.tier === 'degraded'
                                              ? 'text-amber-300/90'
                                              : 'text-rose-300/90'
                                    }
                                >
                                    {h.message}
                                </span>
                                {h.probe_trace ? (
                                    <span className="mt-0.5 block font-mono text-[8px] leading-snug text-zinc-400">
                                        {h.probe_trace}
                                    </span>
                                ) : null}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

function probeDotClass(tier) {
    if (tier === 'up') return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]';
    if (tier === 'degraded') return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]';
    return 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.35)]';
}

/** Resumo com bolinha ON/Off; detalhes do teste só ao expandir. */
function IntegrationProbeToggle({ data, webhookMode, testRunning }) {
    const [open, setOpen] = useState(false);

    if (testRunning) {
        return (
            <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-cyan-500/20 bg-cyan-950/25 px-3 py-2 text-[10px] text-cyan-100/90">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan-400/90" aria-hidden />
                <span>A testar ligação…</span>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-600 ring-1 ring-white/10" aria-hidden />
                <span className="text-[10px] leading-snug text-zinc-500">
                    Ainda sem teste — usa <strong className="font-medium text-zinc-400">Testar conexões agora</strong> acima.
                </span>
            </div>
        );
    }

    const tier = data.tier || 'down';
    const label = tier === 'up' ? 'ON' : tier === 'degraded' ? 'Parcial' : 'Off';
    const sub =
        tier === 'up' ? 'ligação OK' : tier === 'degraded' ? 'atenção' : 'falhou / indisponível';
    const latency = typeof data.latency_ms === 'number' ? `${data.latency_ms} ms` : null;

    return (
        <div className="mt-3">
            <button
                type="button"
                onClick={() => setOpen((x) => !x)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-left transition-colors hover:border-white/18 hover:bg-black/45"
                style={{ WebkitAppRegion: 'no-drag' }}
                aria-expanded={open}
            >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${probeDotClass(tier)}`}
                        title={sub}
                        aria-hidden
                    />
                    <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-200">
                        {label}
                        <span className="ml-1 font-normal normal-case tracking-normal text-zinc-400">· {sub}</span>
                    </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                    {latency ? <span className="font-mono text-[9px] text-zinc-400">{latency}</span> : null}
                    <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                        aria-hidden
                    />
                </span>
            </button>
            {open ? (
                <div className="mt-1.5">
                    {webhookMode ? (
                        <IntegrationWebhookTestStrip data={data} nested />
                    ) : (
                        <IntegrationTestStrip data={data} nested />
                    )}
                </div>
            ) : null}
        </div>
    );
}

/** Cartões do hub de integrações — mais ar, sombra e alinhamento vertical. */
const hubCardShell =
    'flex flex-col rounded-[1.05rem] border border-white/[0.11] bg-gradient-to-b from-white/[0.08] via-zinc-950/40 to-black/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_40px_rgba(0,0,0,0.35)] sm:min-h-[14rem]';

/** Linha de meta (host, URL, etc.) dentro dos cartões do hub. */
function HubMetaBlock({ children }) {
    return (
        <div className="mt-2 space-y-2 rounded-xl border border-white/[0.07] bg-black/35 p-2.5">{children}</div>
    );
}

function HubMetaRow({ label, value }) {
    if (value == null || value === '') return null;
    return (
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</span>
            <span className="min-w-0 break-all font-mono text-[11px] leading-snug text-zinc-200">{value}</span>
        </div>
    );
}

/** Faixa alinhada ao probe — Gemini não tem HTTP test no hub. */
function IntegrationGeminiStatusStrip({ configured }) {
    return (
        <div className="mt-3" role="status">
            <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            configured
                                ? 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.45)]'
                                : 'bg-zinc-600 ring-1 ring-white/10'
                        }`}
                        aria-hidden
                    />
                    <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-200">
                        {configured ? 'Chave configurada' : 'Sem chave'}
                        <span className="ml-1 font-normal normal-case tracking-normal text-zinc-500">
                            · API não testada neste painel
                        </span>
                    </span>
                </span>
                <span className="shrink-0 font-mono text-[9px] text-zinc-500">—</span>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                Valida falando com a ATHENAS ou abre <strong className="font-medium text-zinc-400">Editar credenciais</strong>.
            </p>
        </div>
    );
}

/** Modal centrado para credenciais / ajuda do hub (overlay sobre a janela de configurações). */
function IntegrationHubModal({ open, onClose, title, subtitle, expandMode, children }) {
    const isInfoOnly = expandMode === 'info';

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[500] flex items-end justify-center p-3 sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="integration-hub-modal-title"
        >
            <button
                type="button"
                className="absolute inset-0 bg-black/70 backdrop-blur-[1px]"
                onClick={onClose}
                aria-label="Fechar"
            />
            <div
                className="relative z-[1] flex max-h-[min(90dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.65)] sm:max-w-xl"
                style={{ WebkitAppRegion: 'no-drag' }}
            >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-zinc-950/95 px-4 py-3.5 sm:px-5">
                    <div className="min-w-0 pr-2">
                        <h2
                            id="integration-hub-modal-title"
                            className="text-sm font-bold uppercase tracking-[0.14em] text-zinc-100"
                        >
                            {title}
                        </h2>
                        {subtitle ? <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{subtitle}</p> : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:bg-white/12 hover:text-white"
                        aria-label="Fechar"
                    >
                        <X size={18} aria-hidden />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
                    {isInfoOnly ? (
                        <p className="mb-4 border-b border-white/5 pb-3 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                            Documentação rápida
                        </p>
                    ) : (
                        <p className="mb-4 flex flex-wrap items-center gap-2 border-b border-white/5 pb-3 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                            <FileJson className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                            <span className="break-all">
                                Grava em{' '}
                                <code className="font-mono text-[10px] font-semibold text-zinc-400">
                                    data/local_credentials.json
                                </code>
                            </span>
                        </p>
                    )}
                    <div className="min-h-0">{children}</div>
                </div>
            </div>
        </div>,
        document.body
    );
}

/**
 * Cartão do hub: resumo (estado / testes) + botão que abre modal com credenciais ou ajuda.
 */
function IntegrationModalCard({ summary, credentials, modalTitle, modalSubtitle, expandMode = 'credentials' }) {
    const [open, setOpen] = useState(false);
    const isInfoOnly = expandMode === 'info';
    const btnLabel = isInfoOnly ? 'Como funcionam os webhooks' : 'Editar credenciais';

    return (
        <>
            <div className={`${hubCardShell} w-full`}>
                <div className="flex min-h-0 flex-1 flex-col">{summary}</div>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={`mt-4 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors motion-reduce:transition-none ${
                        isInfoOnly
                            ? 'border-orange-500/20 bg-orange-500/[0.07] text-orange-100/90 hover:border-orange-400/35 hover:bg-orange-500/15'
                            : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-cyan-500/25 hover:bg-cyan-500/10 hover:text-cyan-100'
                    }`}
                    style={{ WebkitAppRegion: 'no-drag' }}
                >
                    {isInfoOnly ? (
                        <Webhook className="h-3.5 w-3.5 shrink-0 text-orange-200/90" aria-hidden />
                    ) : (
                        <KeyRound className="h-3.5 w-3.5 shrink-0 text-cyan-300/85" aria-hidden />
                    )}
                    <span>{btnLabel}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </button>
            </div>
            <IntegrationHubModal
                open={open}
                onClose={() => setOpen(false)}
                title={modalTitle}
                subtitle={modalSubtitle}
                expandMode={expandMode}
            >
                {credentials}
            </IntegrationHubModal>
        </>
    );
}

/** Cartão da memória semântica — mesmo shell que os cartões do hub (sem flip 3D). */
function SemanticHubCard({ icon: Icon, iconClass, title, subtitle, badge, children }) {
    return (
        <div className={`${hubCardShell} min-h-[12rem] w-full sm:min-h-[13.5rem]`}>
            <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-black/20 ${iconClass}`}
                    >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                        <div className="text-[13px] font-semibold leading-tight text-zinc-100">{title}</div>
                        <div className="text-[9px] uppercase tracking-wider text-zinc-400">{subtitle}</div>
                    </div>
                </div>
                {badge != null ? badge : null}
            </div>
            <div className="min-h-0 flex-1">{children}</div>
        </div>
    );
}

/**
 * Memória & contexto — entre Cérebro e Integrações (stack de rede).
 */
function SemanticMemoryHubSection({
    integrations,
    credentialsMeta,
    testResults,
    testRunning,
    semanticSearchEnabled,
    semanticEmbedIndex,
    semanticEmbedSenders,
    semanticEmbedMinLength,
    semanticEmbedMaxChars,
    memoryRemoteSelective,
    setMemoryRemoteSelective,
    memoryOllamaGateEnabled,
    setMemoryOllamaGateEnabled,
    memoryFullRemote,
    setMemoryFullRemote,
    memoryGeminiGateEnabled,
    setMemoryGeminiGateEnabled,
    memoryGateModel,
    setMemoryGateModel,
    flushMemoryGateModel,
    memoryOllamaModel,
    setMemoryOllamaModel,
    flushMemoryOllamaModel,
    memoryOllamaUrl,
    setMemoryOllamaUrl,
    flushMemoryOllamaUrl,
    memoryGateRetries,
    setMemoryGateRetries,
    flushMemoryGateRetries,
    memoryGateTimeoutSec,
    setMemoryGateTimeoutSec,
    flushMemoryGateTimeoutSec,
    memorySalienceDebug,
    setMemorySalienceDebug,
    chatStartupContextLimit,
    setChatStartupContextLimit,
    flushChatStartupContextLimit,
    setSemanticSearch,
    setSemanticIndex,
    commitSemanticEmbedSenders,
    setSemanticEmbedMinLength,
    flushSemanticMinLength,
    setSemanticEmbedMaxChars,
    flushSemanticMaxChars,
}) {
    const supabaseOk = !!integrations?.supabase?.configured;
    const geminiOk = !!credentialsMeta?.gemini_configured;
    const stackReady = supabaseOk && geminiOk;
    const searchLive = stackReady && semanticSearchEnabled;
    const indexLive = stackReady && semanticSearchEnabled && semanticEmbedIndex;
    const senderFlags = parseSemanticEmbedSenders(semanticEmbedSenders);

    const toggleEmbedAll = (checked) => {
        if (checked) commitSemanticEmbedSenders('*');
        else commitSemanticEmbedSenders('User, ATHENAS');
    };

    const toggleEmbedUser = (checked) => {
        if (senderFlags.all) return;
        let user = checked;
        let { athenas } = senderFlags;
        if (!user && !athenas) user = true;
        commitSemanticEmbedSenders(buildSemanticEmbedSenders({ all: false, user, athenas }));
    };

    const toggleEmbedAthenas = (checked) => {
        if (senderFlags.all) return;
        let athenas = checked;
        let { user } = senderFlags;
        if (!user && !athenas) athenas = true;
        commitSemanticEmbedSenders(buildSemanticEmbedSenders({ all: false, user, athenas }));
    };

    const limitsBadge = `${semanticEmbedMinLength ?? '—'} · ${semanticEmbedMaxChars ?? '—'}`;
    const liveLimitLabel = String(chatStartupContextLimit ?? '').trim() || '—';

    return (
        <section className="mt-4 mb-8 sm:mt-5 sm:mb-10">
            <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-violet-950/[0.18] via-fuchsia-950/14 to-zinc-950/90 shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
                <div className="border-b border-white/[0.06] bg-black/25 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <h3 className={`${sectionTitleClass} mb-0`}>
                                    <Search className="h-3.5 w-3.5" strokeWidth={2} />
                                    Memória &amp; contexto
                                </h3>
                                {stackReady ? (
                                    <span className="inline-flex items-center rounded-full border border-violet-500/30 bg-black/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-violet-200/80">
                                        Pipeline OK
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center rounded-full border border-zinc-600/40 bg-black/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                                        Aguarda cérebro
                                    </span>
                                )}
                            </div>
                            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-zinc-400">
                                Embeddings com <strong className="font-medium text-zinc-300">Gemini</strong>, vetores no{' '}
                                <strong className="font-medium text-zinc-300">Postgres (pgvector)</strong>, gravação em{' '}
                                <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-zinc-400">athena_settings.values</code>.
                                O ficheiro <code className="text-zinc-500">.env</code> prévalece no arranque do Python quando a variável existir.
                            </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] text-zinc-400">
                                <Database
                                    className={`h-3.5 w-3.5 ${supabaseOk ? 'text-emerald-300/90' : 'text-zinc-500'}`}
                                    strokeWidth={2}
                                />
                                <span className={supabaseOk ? 'text-zinc-200' : ''}>Supabase</span>
                                <IntegrationStatusPill active={supabaseOk}>{supabaseOk ? 'OK' : 'Off'}</IntegrationStatusPill>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] text-zinc-400">
                                <Bot
                                    className={`h-3.5 w-3.5 ${geminiOk ? 'text-sky-300/90' : 'text-zinc-500'}`}
                                    strokeWidth={2}
                                />
                                <span className={geminiOk ? 'text-zinc-200' : ''}>Gemini</span>
                                <IntegrationStatusPill active={geminiOk}>{geminiOk ? 'Chave' : 'Off'}</IntegrationStatusPill>
                            </span>
                        </div>
                    </div>
                    {!stackReady ? (
                        <p className="mt-3 max-w-2xl rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-[10px] leading-relaxed text-amber-100/90">
                            Completa <strong className="font-medium text-amber-200/90">Cérebro · ATHENAS</strong> acima (URL Supabase + chave
                            Gemini) para usar busca semântica e indexação.
                        </p>
                    ) : null}
                </div>

                <div className="space-y-8 px-4 py-5 sm:px-6 sm:py-6">
                    <div>
                        <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-white/[0.07] pb-2">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">1 · Índice &amp; busca</p>
                                <p className="mt-0.5 text-[11px] text-zinc-400">
                                    Busca, indexação, remetentes, limites de texto e mensagens no arranque Live.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5 xl:gap-5">
                            <SemanticHubCard
                    icon={Search}
                    iconClass="border-cyan-500/30 text-cyan-200"
                    title="Busca no histórico"
                    subtitle="Similaridade semântica"
                    badge={<IntegrationStatusPill active={searchLive}>{searchLive ? 'Ativo' : 'Off'}</IntegrationStatusPill>}
                >
                    <p className="mb-3 line-clamp-3 text-[10px] leading-snug text-zinc-400">
                        Consultas por significado às mensagens antigas. Predefinição:{' '}
                        <strong className="font-normal text-zinc-400">ligado</strong>.
                    </p>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2.5">
                        <span className="text-[11px] text-zinc-100">Usar busca semântica</span>
                        <SettingsSwitch
                            checked={semanticSearchEnabled}
                            onCheckedChange={setSemanticSearch}
                            ariaLabel="Alternar busca semântica no histórico"
                        />
                    </div>
                </SemanticHubCard>

                <SemanticHubCard
                    icon={Layers}
                    iconClass="border-violet-500/30 text-violet-200"
                    title="Indexação"
                    subtitle="Embeddings novas msgs"
                    badge={<IntegrationStatusPill active={indexLive}>{indexLive ? 'A indexar' : 'Pausado'}</IntegrationStatusPill>}
                >
                    <p className="mb-3 line-clamp-3 text-[10px] leading-snug text-zinc-400">
                        Gera vetores ao guardar mensagens (usa API). Predefinição:{' '}
                        <strong className="font-normal text-zinc-400">ligado</strong>.
                    </p>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2.5">
                        <span className="text-[11px] text-zinc-100">Indexar automaticamente</span>
                        <SettingsSwitch
                            checked={semanticEmbedIndex}
                            onCheckedChange={setSemanticIndex}
                            ariaLabel="Alternar indexação por embeddings"
                        />
                    </div>
                </SemanticHubCard>

                <SemanticHubCard
                    icon={Users}
                    iconClass="border-amber-500/30 text-amber-200"
                    title="Remetentes"
                    subtitle="Quem entra no índice"
                    badge={
                        <span className="max-w-[7rem] truncate rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                            {semanticSendersBadgeLabel(semanticEmbedSenders)}
                        </span>
                    }
                >
                    <p className="mb-2.5 text-[10px] leading-snug text-zinc-400">
                        Escolhe quem indexar para busca semântica. «Todas» equivale a{' '}
                        <code className="text-zinc-500">*</code> no servidor.
                    </p>
                    <div className="flex flex-col gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2 transition-colors hover:border-white/10">
                            <input
                                type="checkbox"
                                checked={senderFlags.all}
                                onChange={(e) => toggleEmbedAll(e.target.checked)}
                                className="h-3.5 w-3.5 shrink-0 rounded border-white/20 bg-black/50 text-amber-400 focus:ring-amber-500/40"
                            />
                            <span className="text-[11px] text-zinc-100">Todas as mensagens</span>
                        </label>
                        <label
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2 transition-colors hover:border-white/10 ${senderFlags.all ? 'opacity-45' : ''}`}
                        >
                            <input
                                type="checkbox"
                                checked={senderFlags.user}
                                disabled={senderFlags.all}
                                onChange={(e) => toggleEmbedUser(e.target.checked)}
                                className="h-3.5 w-3.5 shrink-0 rounded border-white/20 bg-black/50 text-amber-400 focus:ring-amber-500/40 disabled:cursor-not-allowed"
                            />
                            <span className="text-[11px] text-zinc-100">Tu (User)</span>
                        </label>
                        <label
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2 transition-colors hover:border-white/10 ${senderFlags.all ? 'opacity-45' : ''}`}
                        >
                            <input
                                type="checkbox"
                                checked={senderFlags.athenas}
                                disabled={senderFlags.all}
                                onChange={(e) => toggleEmbedAthenas(e.target.checked)}
                                className="h-3.5 w-3.5 shrink-0 rounded border-white/20 bg-black/50 text-amber-400 focus:ring-amber-500/40 disabled:cursor-not-allowed"
                            />
                            <span className="text-[11px] text-zinc-100">ATHENAS (assistente)</span>
                        </label>
                    </div>
                </SemanticHubCard>

                <SemanticHubCard
                    icon={SlidersHorizontal}
                    iconClass="border-rose-500/25 text-rose-200"
                    title="Limites"
                    subtitle="Tamanho do texto"
                    badge={
                        <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                            {limitsBadge}
                        </span>
                    }
                >
                    <div className="space-y-2.5">
                        <div>
                            <label className="mb-1 block text-[9px] uppercase tracking-wider text-zinc-400">
                                Mín. caracteres <span className="text-zinc-500">(0–500)</span>
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={500}
                                value={semanticEmbedMinLength}
                                onChange={(e) => setSemanticEmbedMinLength(e.target.value)}
                                onBlur={flushSemanticMinLength}
                                className={fieldClass}
                                style={{ WebkitAppRegion: 'no-drag' }}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-[9px] uppercase tracking-wider text-zinc-400">
                                Máx. por embedding <span className="text-zinc-500">(200–8000)</span>
                            </label>
                            <input
                                type="number"
                                min={200}
                                max={8000}
                                value={semanticEmbedMaxChars}
                                onChange={(e) => setSemanticEmbedMaxChars(e.target.value)}
                                onBlur={flushSemanticMaxChars}
                                className={fieldClass}
                                style={{ WebkitAppRegion: 'no-drag' }}
                            />
                        </div>
                    </div>
                            </SemanticHubCard>

                            <SemanticHubCard
                                icon={History}
                                iconClass="border-teal-500/30 text-teal-200"
                                title="Contexto ao ligar (Live)"
                                subtitle="Arranque da sessão"
                                badge={
                                    <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                                        N: {liveLimitLabel}
                                    </span>
                                }
                            >
                                <p className="mb-2.5 text-[10px] leading-snug text-zinc-400">
                                    Mensagens recentes injectadas antes do Gemini Live (e no reconnect). Intervalo 10–500. Equivale a{' '}
                                    <code className="text-zinc-500">ORBITAL_CHAT_STARTUP_CONTEXT_LIMIT</code>.
                                </p>
                                <label className="mb-1 block text-[9px] uppercase tracking-wider text-zinc-400">
                                    Últimas N mensagens
                                </label>
                                <input
                                    type="number"
                                    min={10}
                                    max={500}
                                    value={chatStartupContextLimit}
                                    onChange={(e) => setChatStartupContextLimit(e.target.value)}
                                    onBlur={flushChatStartupContextLimit}
                                    className={fieldClass}
                                    style={{ WebkitAppRegion: 'no-drag' }}
                                />
                            </SemanticHubCard>
                        </div>
                    </div>

                    <div>
                        <div className="mb-3 border-b border-white/[0.07] pb-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                                2 · Portão Ollama &amp; memória remota
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-400">
                                O que sobe ao Supabase, compat legado, rede local do Ollama e modelo do classificador.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
                            <SemanticHubCard
                                icon={Sparkles}
                                iconClass="border-amber-400/35 text-amber-200"
                                title="Política &amp; filtros"
                                subtitle="Supabase + gates"
                                badge={
                                    <IntegrationStatusPill active={memoryRemoteSelective && geminiOk}>
                                        {memoryRemoteSelective
                                            ? memoryOllamaGateEnabled && memoryGeminiGateEnabled
                                                ? 'IA'
                                                : 'Bypass'
                                            : 'Tudo remoto'}
                                    </IntegrationStatusPill>
                                }
                            >
                                <p className="mb-3 text-[10px] leading-snug text-zinc-400">
                                    <code className="text-zinc-500">chat_history.jsonl</code> guarda tudo localmente. «Filtrar» + Ollama
                                    escolhem o que vai ao remoto para embeddings.
                                </p>
                                <div className="flex flex-col gap-2.5">
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2.5">
                                        <span className="text-[11px] text-zinc-100">Filtrar envio ao Supabase</span>
                                        <SettingsSwitch
                                            checked={memoryRemoteSelective}
                                            onCheckedChange={setMemoryRemoteSelective}
                                            ariaLabel="Filtrar mensagens enviadas ao Supabase"
                                        />
                                    </div>
                                    <div
                                        className={`flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2.5 ${!memoryRemoteSelective ? 'opacity-45' : ''}`}
                                    >
                                        <span className="text-[11px] text-zinc-100">Decidir com Ollama</span>
                                        <SettingsSwitch
                                            checked={memoryOllamaGateEnabled && memoryRemoteSelective}
                                            disabled={!memoryRemoteSelective}
                                            onCheckedChange={(v) => memoryRemoteSelective && setMemoryOllamaGateEnabled(!!v)}
                                            ariaLabel="ORBITAL_MEMORY_OLLAMA_GATE"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2.5">
                                        <span className="text-[11px] text-zinc-100">Compat legado Gemini gate</span>
                                        <SettingsSwitch
                                            checked={memoryGeminiGateEnabled}
                                            onCheckedChange={setMemoryGeminiGateEnabled}
                                            ariaLabel="ORBITAL_MEMORY_GEMINI_GATE"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2.5">
                                        <span className="text-[11px] leading-snug text-zinc-100">
                                            Enviar tudo ao remoto <span className="text-zinc-500">(sem filtro)</span>
                                        </span>
                                        <SettingsSwitch
                                            checked={memoryFullRemote}
                                            onCheckedChange={setMemoryFullRemote}
                                            ariaLabel="ORBITAL_MEMORY_FULL_REMOTE"
                                        />
                                    </div>
                                    <div
                                        className={`flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2.5 ${!memoryRemoteSelective || !memoryOllamaGateEnabled ? 'opacity-45' : ''}`}
                                    >
                                        <span className="text-[11px] text-zinc-100">Logs de decisão (debug)</span>
                                        <SettingsSwitch
                                            checked={memorySalienceDebug}
                                            onCheckedChange={setMemorySalienceDebug}
                                            ariaLabel="ORBITAL_MEMORY_SALIENCE_DEBUG"
                                        />
                                    </div>
                                </div>
                            </SemanticHubCard>

                            <SemanticHubCard
                                icon={Bot}
                                iconClass="border-sky-500/30 text-sky-200"
                                title="Modelo do gate"
                                subtitle="Ollama classify"
                                badge={
                                    <span className="max-w-[6rem] truncate rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                                        {(memoryGateModel || memoryOllamaModel || 'def').slice(0, 12)}
                                    </span>
                                }
                            >
                                <p className="mb-2.5 text-[10px] leading-snug text-zinc-400">
                                    Vazio usa o pré-definido do código (ex. <code className="text-zinc-500">qwen2.5:7b</code>). Equivale a{' '}
                                    <code className="text-zinc-500">ORBITAL_MEMORY_GATE_MODEL</code> /{' '}
                                    <code className="text-zinc-500">ORBITAL_MEMORY_OLLAMA_MODEL</code>.
                                </p>
                                <div className="space-y-2.5">
                                    <div>
                                        <label className="mb-1 block text-[9px] uppercase tracking-wider text-zinc-400">
                                            Modelo principal
                                        </label>
                                        <input
                                            type="text"
                                            value={memoryGateModel}
                                            onChange={(e) => setMemoryGateModel(e.target.value)}
                                            onBlur={flushMemoryGateModel}
                                            className={fieldClass}
                                            placeholder="ex.: qwen2.5:7b"
                                            style={{ WebkitAppRegion: 'no-drag' }}
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[9px] uppercase tracking-wider text-zinc-400">
                                            Alias (compat)
                                        </label>
                                        <input
                                            type="text"
                                            value={memoryOllamaModel}
                                            onChange={(e) => setMemoryOllamaModel(e.target.value)}
                                            onBlur={flushMemoryOllamaModel}
                                            className={fieldClass}
                                            placeholder="opcional"
                                            style={{ WebkitAppRegion: 'no-drag' }}
                                        />
                                    </div>
                                </div>
                            </SemanticHubCard>

                            <SemanticHubCard
                                icon={Database}
                                iconClass="border-emerald-500/28 text-emerald-200"
                                title="Ligação Ollama"
                                subtitle="Rede &amp; timeouts"
                                badge={
                                    <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                                        {memoryGateRetries}× · {memoryGateTimeoutSec}s
                                    </span>
                                }
                            >
                                <p className="mb-2.5 text-[10px] leading-snug text-zinc-400">
                                    Endpoint local e robustez das chamadas ao classificador.{' '}
                                    <code className="text-zinc-500">ORBITAL_MEMORY_OLLAMA_URL</code>, retries e timeout.
                                </p>
                                <div className="space-y-2.5">
                                    <div>
                                        <label className="mb-1 block text-[9px] uppercase tracking-wider text-zinc-400">URL base</label>
                                        <input
                                            type="text"
                                            value={memoryOllamaUrl}
                                            onChange={(e) => setMemoryOllamaUrl(e.target.value)}
                                            onBlur={flushMemoryOllamaUrl}
                                            className={fieldClass}
                                            placeholder="http://127.0.0.1:11434"
                                            style={{ WebkitAppRegion: 'no-drag' }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="mb-1 block text-[9px] uppercase tracking-wider text-zinc-400">Retries 1–5</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={5}
                                                value={memoryGateRetries}
                                                onChange={(e) => setMemoryGateRetries(e.target.value)}
                                                onBlur={flushMemoryGateRetries}
                                                className={fieldClass}
                                                style={{ WebkitAppRegion: 'no-drag' }}
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-[9px] uppercase tracking-wider text-zinc-400">Timeout s</label>
                                            <input
                                                type="number"
                                                min={3}
                                                max={120}
                                                step="0.5"
                                                value={memoryGateTimeoutSec}
                                                onChange={(e) => setMemoryGateTimeoutSec(e.target.value)}
                                                onBlur={flushMemoryGateTimeoutSec}
                                                className={fieldClass}
                                                style={{ WebkitAppRegion: 'no-drag' }}
                                            />
                                        </div>
                                    </div>
                                    <IntegrationProbeToggle
                                        data={testResults?.ollama}
                                        webhookMode={false}
                                        testRunning={testRunning}
                                    />
                                </div>
                            </SemanticHubCard>
                        </div>
                    </div>

                    <p className="max-w-3xl rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2.5 text-[10px] leading-relaxed text-zinc-500">
                        <strong className="font-medium text-zinc-400">.env sobrepõe</strong> valores gravados no Supabase quando a variável
                        existe no arranque do Python (<code className="text-zinc-400">ORBITAL_*</code>).
                    </p>
                </div>
            </div>
        </section>
    );
}

function useServerCredentialsSave(socket) {
    const [credSaving, setCredSaving] = useState(false);
    const [credFeedback, setCredFeedback] = useState(null);

    useEffect(() => {
        const onResult = (payload) => {
            setCredSaving(false);
            if (!payload || typeof payload !== 'object') return;
            setCredFeedback({
                ok: !!payload.ok,
                message: payload.message || (payload.ok ? 'Guardado.' : 'Falha ao guardar.'),
            });
            window.setTimeout(() => setCredFeedback(null), 8000);
            if (payload.ok) {
                socket.emit('get_settings');
            }
        };
        socket.on('server_credentials_save_result', onResult);
        return () => socket.off('server_credentials_save_result', onResult);
    }, [socket]);

    const savePartial = useCallback((partial) => {
        setCredSaving(true);
        setCredFeedback(null);
        socket.emit('save_server_credentials', partial);
    }, [socket]);

    return { credSaving, credFeedback, savePartial };
}

function BrainAndIntegrationsPanels({ socket, children, ...rest }) {
    const { credSaving, credFeedback, savePartial } = useServerCredentialsSave(socket);
    return (
        <>
            <BrainAthenasSection {...rest} socket={socket} credSaving={credSaving} savePartial={savePartial} />
            {credFeedback ? (
                <div
                    className={`mx-auto mb-6 max-w-[1400px] rounded-xl border px-4 py-2.5 text-xs ${
                        credFeedback.ok
                            ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100'
                            : 'border-rose-500/30 bg-rose-950/20 text-rose-100'
                    }`}
                    role="status"
                >
                    {credFeedback.message}
                </div>
            ) : null}
            {children}
            <IntegrationsHubSection {...rest} socket={socket} credSaving={credSaving} savePartial={savePartial} />
        </>
    );
}

/**
 * Núcleo (cérebro): Supabase + Gemini — não são integrações opcionais.
 */
function BrainAthenasSection({
    integrations,
    integrationsReady,
    testRunning,
    testResults,
    credentialsMeta,
    socket,
    credSaving,
    savePartial,
}) {
    const supabase = integrations?.supabase;
    const meta = credentialsMeta;

    const [supabaseUrl, setSupabaseUrl] = useState('');
    const [supabaseKey, setSupabaseKey] = useState('');
    const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
    const [supabaseConfigEnabled, setSupabaseConfigEnabled] = useState(true);
    const [athenaModuleKey, setAthenaModuleKey] = useState('athena');
    const [geminiKey, setGeminiKey] = useState('');

    useEffect(() => {
        if (!meta || typeof meta !== 'object') return;
        setSupabaseUrl(meta.supabase_url || '');
        setSupabaseConfigEnabled(meta.supabase_config_enabled !== false);
        setAthenaModuleKey(
            typeof meta.athena_settings_module_key === 'string' && meta.athena_settings_module_key.trim()
                ? meta.athena_settings_module_key.trim()
                : 'athena'
        );
        const cs = meta.credentials_secrets;
        if (cs && typeof cs === 'object') {
            setSupabaseKey(typeof cs.supabase_service_role_key === 'string' ? cs.supabase_service_role_key : '');
            setSupabaseAnonKey(typeof cs.supabase_anon_key === 'string' ? cs.supabase_anon_key : '');
            setGeminiKey(typeof cs.gemini_api_key === 'string' ? cs.gemini_api_key : '');
        } else {
            setSupabaseKey('');
            setSupabaseAnonKey('');
            setGeminiKey('');
        }
    }, [meta]);

    const brainReadyCount =
        integrations && meta ? [!!supabase?.configured, !!meta.gemini_configured].filter(Boolean).length : 0;

    return (
        <section className="mb-6 sm:mb-8">
            <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-fuchsia-950/[0.22] via-violet-950/18 to-zinc-950/90 shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
                <div className="border-b border-white/[0.06] bg-black/25 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <h3 className={`${sectionTitleClass} mb-0`}>
                                <Brain className="h-3.5 w-3.5" strokeWidth={2} />
                                Cérebro · ATHENAS
                            </h3>
                            {integrations && meta ? (
                                <span className="inline-flex items-center rounded-full border border-fuchsia-500/30 bg-black/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-fuchsia-200/80">
                                    {brainReadyCount}/2 núcleo
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-zinc-400">
                            <strong className="font-medium text-zinc-300">Supabase</strong> e{' '}
                            <strong className="font-medium text-zinc-300">Gemini (ATHENAS)</strong> são a base do sistema — memória remota,
                            definições, ferramentas e voz/Live. Isto não é uma «integração» ao estilo Comfy ou n8n. Credenciais em{' '}
                            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-zinc-400">
                                data/local_credentials.json
                            </code>
                            . O teste HTTP ao Supabase continua disponível no cartão (e no botão «Testar ligações» na secção de integrações).
                        </p>
                    </div>
                </div>

                <div className="px-4 py-4 sm:px-6 sm:py-5">
                    {!integrationsReady ? (
                        <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-400">
                            A carregar estado…
                        </div>
                    ) : !integrations ? (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 px-4 py-3 text-xs text-amber-100/90">
                            Este servidor ainda não envia o bloco <code className="text-amber-200/80">integrations</code>. Atualiza o backend
                            OrbitalSync e reinicia o Python.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                            <IntegrationModalCard
                                modalTitle="Supabase"
                                modalSubtitle="Credenciais em data/local_credentials.json"
                                summary={
                                    <>
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                                                    <Database className="h-4 w-4" strokeWidth={2} />
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold leading-tight text-zinc-100">Supabase</div>
                                                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Postgres remoto</div>
                                                </div>
                                            </div>
                                            <IntegrationStatusPill active={!!supabase?.configured}>
                                                {supabase?.configured ? 'Ativo' : 'Off'}
                                            </IntegrationStatusPill>
                                        </div>
                                        <p className="line-clamp-3 text-[11px] leading-relaxed text-zinc-400">
                                            Config, tools e whitelist quando o backend usa o projeto Supabase.
                                        </p>
                                        {supabase?.configured ? (
                                            <HubMetaBlock>
                                                <HubMetaRow label="Host" value={supabase.host} />
                                                <HubMetaRow label="Módulo" value={supabase.module_key || 'athena'} />
                                            </HubMetaBlock>
                                        ) : (
                                            <p className="text-[11px] leading-relaxed text-zinc-500">
                                                Usa <strong className="text-zinc-400">Editar credenciais</strong> para URL e chaves, ou{' '}
                                                <code className="rounded bg-black/40 px-1 text-zinc-400">SUPABASE_*</code> no{' '}
                                                <code className="text-zinc-400">.env</code>.
                                            </p>
                                        )}
                                        <IntegrationProbeToggle
                                            data={testResults?.supabase}
                                            webhookMode={false}
                                            testRunning={testRunning}
                                        />
                                    </>
                                }
                                credentials={
                                    meta ? (
                                        <div className="flex flex-col gap-2.5">
                                            <p className="text-[10px] leading-relaxed text-zinc-400">
                                                Ficheiro:{' '}
                                                <span className="font-mono text-zinc-400">{shortPath(meta.credentials_file)}</span>
                                                {meta.credentials_file_exists ? (
                                                    <span className="ml-2 text-emerald-400/80">· existe</span>
                                                ) : null}
                                            </p>
                                            {meta.secrets_visible_in_ui ? (
                                                <p className="rounded-lg border border-amber-500/25 bg-amber-950/25 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-100/90">
                                                    <code className="text-amber-200/85">ORBITAL_EXPOSE_SECRETS_IN_SETTINGS_UI</code> ligado — a
                                                    chave é enviada ao abrir. Evita LAN/internet.
                                                </p>
                                            ) : (
                                                <p className="text-[10px] leading-relaxed text-zinc-500">
                                                    Com chave guardada, vês <strong className="text-zinc-400">pontinhos</strong>; o{' '}
                                                    <strong className="text-zinc-400">olho</strong> pede o valor ao Python (só este PC). Opcional:
                                                    copiar chave ao abrir com{' '}
                                                    <code className="font-mono text-zinc-400">ORBITAL_EXPOSE_SECRETS_IN_SETTINGS_UI=1</code> no{' '}
                                                    <code className="text-zinc-400">.env</code>.
                                                </p>
                                            )}
                                            <div>
                                                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-zinc-400">
                                                    URL do projeto
                                                </label>
                                                <input
                                                    type="url"
                                                    value={supabaseUrl}
                                                    onChange={(e) => setSupabaseUrl(e.target.value)}
                                                    placeholder="https://xxxx.supabase.co"
                                                    className={fieldClass}
                                                    autoComplete="off"
                                                />
                                            </div>
                                            <SecretCredentialField
                                                label="Service role key"
                                                value={supabaseKey}
                                                setValue={setSupabaseKey}
                                                placeholder={
                                                    meta.supabase_configured
                                                        ? 'Deixar vazio mantém a chave já guardada no PC'
                                                        : 'Colar service role key'
                                                }
                                                configured={!!meta.supabase_configured}
                                                secretLength={
                                                    typeof meta.supabase_service_role_key_length === 'number'
                                                        ? meta.supabase_service_role_key_length
                                                        : meta.supabase_secret_length
                                                }
                                                field="supabase_service_role_key"
                                                socket={socket}
                                                disabled={credSaving || !meta}
                                            />
                                            <SecretCredentialField
                                                label="Anon key (opcional)"
                                                value={supabaseAnonKey}
                                                setValue={setSupabaseAnonKey}
                                                placeholder={
                                                    (meta.supabase_anon_key_length || 0) > 0
                                                        ? 'Deixar vazio mantém a anon key já guardada'
                                                        : 'Colar anon key se usares só políticas RLS'
                                                }
                                                configured={(meta.supabase_anon_key_length || 0) > 0}
                                                secretLength={meta.supabase_anon_key_length || 0}
                                                field="supabase_anon_key"
                                                socket={socket}
                                                disabled={credSaving || !meta}
                                            />
                                            <div className={rowClass}>
                                                <span className="text-zinc-100">Usar config remota (Supabase)</span>
                                                <SettingsSwitch
                                                    checked={supabaseConfigEnabled}
                                                    onCheckedChange={setSupabaseConfigEnabled}
                                                    ariaLabel="Ligar ou desligar SUPABASE_CONFIG_ENABLED"
                                                />
                                            </div>
                                            <p className="text-[10px] leading-relaxed text-zinc-500">
                                                Se desligares, o backend ignora URL/chave para carregar{' '}
                                                <code className="text-zinc-400">athena_settings</code> do projeto (útil offline).
                                            </p>
                                            <div>
                                                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-zinc-400">
                                                    ATHENA_SETTINGS_MODULE_KEY
                                                </label>
                                                <input
                                                    type="text"
                                                    value={athenaModuleKey}
                                                    onChange={(e) => setAthenaModuleKey(e.target.value)}
                                                    placeholder="athena"
                                                    className={fieldClass}
                                                    autoComplete="off"
                                                />
                                                <p className="mt-1 text-[10px] text-zinc-500">
                                                    Linha em <code className="text-zinc-400">athena_settings.module_key</code> (predefinição:
                                                    athena).
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    savePartial({
                                                        supabase_url: supabaseUrl.trim(),
                                                        supabase_service_role_key: supabaseKey.trim(),
                                                        supabase_anon_key: supabaseAnonKey.trim(),
                                                        supabase_config_enabled: supabaseConfigEnabled,
                                                        athena_settings_module_key: athenaModuleKey.trim(),
                                                    })
                                                }
                                                disabled={credSaving || !meta}
                                                className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-500/35 bg-fuchsia-500/12 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-fuchsia-100 transition-colors hover:bg-fuchsia-500/22 disabled:cursor-not-allowed disabled:opacity-45"
                                                style={{ WebkitAppRegion: 'no-drag' }}
                                            >
                                                {credSaving ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                                ) : (
                                                    <Save className="h-3.5 w-3.5" aria-hidden />
                                                )}
                                                Guardar Supabase
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-zinc-400">A carregar metadados…</p>
                                    )
                                }
                            />

                            <IntegrationModalCard
                                modalTitle="Gemini / ATHENAS"
                                modalSubtitle="GEMINI_API_KEY (local_credentials.json)"
                                summary={
                                    <>
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-200">
                                                    <Bot className="h-4 w-4" strokeWidth={2} />
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold leading-tight text-zinc-100">
                                                        Gemini / ATHENAS
                                                    </div>
                                                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">Live · voz</div>
                                                </div>
                                            </div>
                                            <IntegrationStatusPill active={!!meta?.gemini_configured}>
                                                {meta?.gemini_configured ? 'Chave OK' : 'Sem chave'}
                                            </IntegrationStatusPill>
                                        </div>
                                        <p className="line-clamp-3 text-[11px] leading-relaxed text-zinc-400">
                                            <code className="rounded bg-black/30 px-1 text-zinc-500">GEMINI_API_KEY</code> — conversa em tempo
                                            real; este painel não faz pedido HTTP de validação.
                                        </p>
                                        <IntegrationGeminiStatusStrip configured={!!meta?.gemini_configured} />
                                    </>
                                }
                                credentials={
                                    meta ? (
                                        <div className="flex flex-col gap-3">
                                            {meta.secrets_visible_in_ui ? (
                                                <p className="rounded-lg border border-amber-500/25 bg-amber-950/25 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-100/90">
                                                    <code className="text-amber-200/85">ORBITAL_EXPOSE_SECRETS_IN_SETTINGS_UI</code> ligado — chave
                                                    enviada ao abrir.
                                                </p>
                                            ) : (
                                                <p className="text-[10px] leading-relaxed text-zinc-500">
                                                    Com chave guardada aparecem <strong className="text-zinc-400">pontinhos</strong>; o{' '}
                                                    <strong className="text-zinc-400">olho</strong> carrega do servidor. Opcional:{' '}
                                                    <code className="font-mono text-zinc-400">ORBITAL_EXPOSE_SECRETS_IN_SETTINGS_UI=1</code>.
                                                </p>
                                            )}
                                            <SecretCredentialField
                                                label="Google Gemini — API key"
                                                value={geminiKey}
                                                setValue={setGeminiKey}
                                                placeholder={
                                                    meta.gemini_configured
                                                        ? 'Deixar vazio mantém a chave já guardada no PC'
                                                        : 'Colar API key do Gemini'
                                                }
                                                configured={!!meta.gemini_configured}
                                                secretLength={meta.gemini_api_key_length}
                                                field="gemini_api_key"
                                                socket={socket}
                                                disabled={credSaving || !meta}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => savePartial({ gemini_api_key: geminiKey.trim() })}
                                                disabled={credSaving || !meta}
                                                className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/35 bg-sky-500/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100 transition-colors hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-45"
                                                style={{ WebkitAppRegion: 'no-drag' }}
                                            >
                                                {credSaving ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                                ) : (
                                                    <Save className="h-3.5 w-3.5" aria-hidden />
                                                )}
                                                Guardar Gemini
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-zinc-400">A carregar metadados…</p>
                                    )
                                }
                            />
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

/**
 * Integrações opcionais: ComfyUI, n8n/webhooks, Finance (Pierre).
 */
function IntegrationsHubSection({
    integrations,
    integrationsReady,
    testRunning,
    testResults,
    testError,
    onRunTests,
    credentialsMeta,
    socket,
    credSaving,
    savePartial,
}) {
    const comfy = integrations?.comfyui;
    const n8n = integrations?.n8n;
    const meta = credentialsMeta;

    const [comfyUrl, setComfyUrl] = useState('http://127.0.0.1:2000');
    const [comfyWorkflow, setComfyWorkflow] = useState('');
    const [pierreKey, setPierreKey] = useState('');

    useEffect(() => {
        if (!meta || typeof meta !== 'object') return;
        setComfyUrl(meta.comfyui_base_url || 'http://127.0.0.1:2000');
        setComfyWorkflow(meta.comfyui_workflow_file || '');
        const cs = meta.credentials_secrets;
        if (cs && typeof cs === 'object') {
            setPierreKey(typeof cs.pierre_api_key === 'string' ? cs.pierre_api_key : '');
        } else {
            setPierreKey('');
        }
    }, [meta]);

    const integrationsReadyCount =
        integrations && meta
            ? [!!comfy?.workflow_ready, (n8n?.hooks_count ?? 0) > 0, !!meta.pierre_configured].filter(Boolean).length
            : 0;

    return (
        <section className="mt-4 mb-8 sm:mt-5 sm:mb-10">
            <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-teal-950/[0.14] via-zinc-950/50 to-black/80 shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
                <div className="border-b border-white/[0.06] bg-black/25 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <h3 className={`${sectionTitleClass} mb-0`}>
                                    <Plug2 className="h-3.5 w-3.5" strokeWidth={2} />
                                    Integrações
                                </h3>
                                {integrations && meta ? (
                                    <span className="inline-flex items-center rounded-full border border-teal-500/25 bg-black/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-teal-200/85">
                                        {integrationsReadyCount}/3 ligadas
                                    </span>
                                ) : null}
                            </div>
                            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-zinc-400">
                                Serviços à volta do núcleo: imagens (ComfyUI), automações HTTP (n8n / webhooks) e financeiro opcional
                                (Pierre). <strong className="font-medium text-zinc-300">Testar ligações</strong> cobre Supabase, ComfyUI,
                                webhooks e Ollama <span className="text-zinc-500">(URL em memória ou</span>{' '}
                                <code className="text-zinc-500">ORBITAL_MEMORY_OLLAMA_URL</code>
                                <span className="text-zinc-500">)</span> (o Supabase também está no cérebro).
                            </p>
                        </div>
                        {integrationsReady && integrations ? (
                            <button
                                type="button"
                                onClick={onRunTests}
                                disabled={testRunning}
                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-teal-500/40 bg-teal-500/15 px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-teal-100 shadow-[0_0_24px_rgba(45,212,191,0.12)] transition-colors hover:bg-teal-500/25 disabled:cursor-not-allowed disabled:opacity-45"
                                style={{ WebkitAppRegion: 'no-drag' }}
                            >
                                {testRunning ? (
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                ) : (
                                    <Activity className="h-4 w-4 shrink-0" aria-hidden />
                                )}
                                Testar ligações
                            </button>
                        ) : null}
                    </div>
                </div>

                <div className="px-4 py-4 sm:px-6 sm:py-5">
                    {!integrationsReady ? (
                        <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-400">
                            A carregar estado das integrações…
                        </div>
                    ) : !integrations ? (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-950/15 px-4 py-3 text-xs text-amber-100/90">
                            Este servidor ainda não envia o bloco <code className="text-amber-200/80">integrations</code>. Atualiza o
                            backend OrbitalSync e reinicia o Python.
                        </div>
                    ) : (
                        <>
                            {testError ? (
                                <div
                                    className="mb-4 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-200"
                                    role="alert"
                                >
                                    {testError}
                                </div>
                            ) : null}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 xl:gap-5 2xl:gap-6">
                                <IntegrationModalCard
                                    modalTitle="ComfyUI"
                                    modalSubtitle="URL base e ficheiro workflow (local_credentials.json)"
                                    summary={
                                        <>
                                            <div className="mb-2 flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
                                                        <Sparkles className="h-4 w-4" strokeWidth={2} />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold leading-tight text-zinc-100">ComfyUI</div>
                                                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">API local</div>
                                                    </div>
                                                </div>
                                                <IntegrationStatusPill active={!!comfy?.workflow_ready}>
                                                    {comfy?.workflow_ready ? 'Pronto' : 'Incompleto'}
                                                </IntegrationStatusPill>
                                            </div>
                                            <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-400">
                                                Imagens pela ATHENAS — servidor ComfyUI + JSON workflow (API).
                                            </p>
                                            <HubMetaBlock>
                                                <HubMetaRow label="URL" value={comfy?.base_url || '—'} />
                                                <HubMetaRow label="Workflow" value={shortPath(comfy?.workflow_path)} />
                                            </HubMetaBlock>
                                            <IntegrationProbeToggle
                                                data={testResults?.comfyui}
                                                webhookMode={false}
                                                testRunning={testRunning}
                                            />
                                        </>
                                    }
                                    credentials={
                                        meta ? (
                                            <div className="flex flex-col gap-2.5">
                                                <div>
                                                    <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-zinc-400">
                                                        URL base
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={comfyUrl}
                                                        onChange={(e) => setComfyUrl(e.target.value)}
                                                        placeholder="http://127.0.0.1:2000"
                                                        className={fieldClass}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-zinc-400">
                                                        Workflow API (opcional)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={comfyWorkflow}
                                                        onChange={(e) => setComfyWorkflow(e.target.value)}
                                                        placeholder="Opcional — vazio grava data/comfyui/workflow_api.json"
                                                        className={fieldClass}
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        savePartial({
                                                            comfyui_base_url: comfyUrl.trim(),
                                                            comfyui_workflow_file: comfyWorkflow.trim(),
                                                        })
                                                    }
                                                    disabled={credSaving || !meta}
                                                    className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/35 bg-violet-500/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-100 transition-colors hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-45"
                                                    style={{ WebkitAppRegion: 'no-drag' }}
                                                >
                                                    {credSaving ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                                    ) : (
                                                        <Save className="h-3.5 w-3.5" aria-hidden />
                                                    )}
                                                    Guardar ComfyUI
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-zinc-400">A carregar metadados…</p>
                                        )
                                    }
                                />

                                <IntegrationModalCard
                                    expandMode="info"
                                    modalTitle="n8n e webhooks"
                                    modalSubtitle="Onde ficam as URLs (não vão para local_credentials.json)"
                                    summary={
                                        <>
                                            <div className="mb-2 flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-200">
                                                        <Webhook className="h-4 w-4" strokeWidth={2} />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold leading-tight text-zinc-100">
                                                            n8n &amp; webhooks
                                                        </div>
                                                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">HTTP</div>
                                                    </div>
                                                </div>
                                                <IntegrationStatusPill active={(n8n?.hooks_count ?? 0) > 0}>
                                                    {(n8n?.hooks_count ?? 0) > 0 ? `${n8n.hooks_count} hooks` : 'Sem hooks'}
                                                </IntegrationStatusPill>
                                            </div>
                                            <p className="mb-2 text-[11px] leading-relaxed text-zinc-400">
                                                Tool <strong className="text-zinc-400">trigger_webhook</strong> · origem:{' '}
                                                {n8n?.webhooks_source === 'supabase' ? 'Supabase' : 'webhooks.json'}.
                                                {n8n?.webhooks_source === 'supabase' ? (
                                                    <>
                                                        {' '}
                                                        Hooks em <code className="text-zinc-500">config/webhooks.json</code> entram em{' '}
                                                        <em className="not-italic text-zinc-300">merge</em> só para ids que ainda não existem
                                                        no remoto (o app não envia o ficheiro ao Supabase).
                                                    </>
                                                ) : null}
                                            </p>
                                            {(n8n?.hooks_preview?.length ?? 0) > 0 ? (
                                                <ul className="max-h-[5.5rem] space-y-1.5 overflow-y-auto pr-1 text-[11px] leading-snug">
                                                    {n8n.hooks_preview.map((h) => (
                                                        <li
                                                            key={h.id}
                                                            className="rounded-md border border-white/5 bg-black/30 px-1.5 py-1 text-zinc-300"
                                                        >
                                                            <span className="font-mono text-[10px] text-emerald-200/90">{h.id}</span>
                                                            {h.description ? (
                                                                <span className="mt-0.5 block text-[10px] leading-snug text-zinc-400">
                                                                    {h.description}
                                                                </span>
                                                            ) : null}
                                                            {h.url ? (
                                                                <span className="mt-1 block break-all font-mono text-[9px] leading-snug text-orange-200/75">
                                                                    {h.url}
                                                                </span>
                                                            ) : (
                                                                <span className="mt-1 block text-[9px] leading-snug text-zinc-400">
                                                                    <span className="text-amber-200/80">Sem URL no payload.</span>{' '}
                                                                    {n8n?.webhooks_source === 'supabase' ? (
                                                                        <>
                                                                            Confirma <code className="text-zinc-500">athena_webhooks</code>{' '}
                                                                            (coluna <code className="text-zinc-500">url</code> ou metadata), RLS e
                                                                            reinicia o Python.
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            Edita <code className="text-zinc-500">config/webhooks.json</code>.
                                                                        </>
                                                                    )}
                                                                </span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-[11px] text-zinc-500">
                                                    Adiciona em <code className="text-zinc-400">config/webhooks.json</code> ou na tabela{' '}
                                                    <code className="text-zinc-400">athena_webhooks</code>.
                                                </p>
                                            )}
                                            <a
                                                href="https://n8n.io"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-medium text-orange-300/90 hover:text-orange-200"
                                            >
                                                n8n.io
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                            <IntegrationProbeToggle
                                                data={testResults?.webhooks}
                                                webhookMode
                                                testRunning={testRunning}
                                            />
                                        </>
                                    }
                                    credentials={
                                        <div className="flex flex-1 flex-col gap-2 text-[10px] leading-relaxed text-zinc-400">
                                            <p>
                                                Estes URLs não vão para <code className="text-zinc-400">local_credentials.json</code>. Configura em{' '}
                                                <code className="text-zinc-400">athena_webhooks</code> (Supabase) ou em{' '}
                                                <code className="text-zinc-400">config/webhooks.json</code>.
                                            </p>
                                            <p className="text-zinc-400">Acima: bolinha de teste — expande para ver HTTP por hook.</p>
                                        </div>
                                    }
                                />

                                <IntegrationModalCard
                                    modalTitle="Finance (Pierre)"
                                    modalSubtitle="PIERRE_API_KEY (local_credentials.json)"
                                    summary={
                                        <>
                                            <div className="mb-2 flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-lime-500/30 bg-lime-500/10 text-lime-200">
                                                        <Wallet className="h-4 w-4" strokeWidth={2} />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold leading-tight text-zinc-100">
                                                            Finance · Pierre
                                                        </div>
                                                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Opcional</div>
                                                    </div>
                                                </div>
                                                <IntegrationStatusPill active={!!meta?.pierre_configured}>
                                                    {meta?.pierre_configured ? 'Token OK' : 'Sem token'}
                                                </IntegrationStatusPill>
                                            </div>
                                            <p className="line-clamp-3 text-[11px] leading-relaxed text-zinc-400">
                                                Integração financeira opcional. URL e timeouts definem-se no{' '}
                                                <code className="rounded bg-black/30 px-1 text-zinc-500">.env</code> (
                                                <code className="text-zinc-500">PIERRE_BASE_URL</code>, etc.).
                                            </p>
                                        </>
                                    }
                                    credentials={
                                        meta ? (
                                            <div className="flex flex-col gap-2.5">
                                                {meta.secrets_visible_in_ui ? (
                                                    <p className="rounded-lg border border-amber-500/25 bg-amber-950/25 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-100/90">
                                                        <code className="text-amber-200/85">ORBITAL_EXPOSE_SECRETS_IN_SETTINGS_UI</code> ligado —
                                                        token enviado ao abrir.
                                                    </p>
                                                ) : (
                                                    <p className="text-[10px] leading-relaxed text-zinc-500">
                                                        Mesmo fluxo que as outras chaves: pontinhos + olho para revelar localmente.
                                                    </p>
                                                )}
                                                <SecretCredentialField
                                                    label="Pierre — API key"
                                                    value={pierreKey}
                                                    setValue={setPierreKey}
                                                    placeholder={
                                                        meta.pierre_configured
                                                            ? 'Deixar vazio mantém o token já guardado no PC'
                                                            : 'Colar API key Pierre'
                                                    }
                                                    configured={!!meta.pierre_configured}
                                                    secretLength={meta.pierre_api_key_length ?? 0}
                                                    field="pierre_api_key"
                                                    socket={socket}
                                                    disabled={credSaving || !meta}
                                                />
                                                <p className="text-[10px] leading-relaxed text-zinc-500">
                                                    <code className="text-zinc-400">PIERRE_BASE_URL</code> e restantes{' '}
                                                    <code className="text-zinc-400">PIERRE_*</code> no ficheiro{' '}
                                                    <code className="text-zinc-400">.env</code> (secção Finance no mapa abaixo).
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => savePartial({ pierre_api_key: pierreKey.trim() })}
                                                    disabled={credSaving || !meta}
                                                    className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/35 bg-lime-500/12 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-lime-100 transition-colors hover:bg-lime-500/22 disabled:cursor-not-allowed disabled:opacity-45"
                                                    style={{ WebkitAppRegion: 'no-drag' }}
                                                >
                                                    {credSaving ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                                    ) : (
                                                        <Save className="h-3.5 w-3.5" aria-hidden />
                                                    )}
                                                    Guardar Pierre
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-zinc-400">A carregar metadados…</p>
                                        )
                                    }
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

/**
 * Editor do ficheiro `.env` na raiz do repo (Socket.IO → Python).
 */
function DotEnvFileSection({ socket }) {
    const [text, setText] = useState('');
    const [pathLabel, setPathLabel] = useState('');
    const [fileExists, setFileExists] = useState(false);
    const [loadedOnce, setLoadedOnce] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState(null);

    useEffect(() => {
        const onContent = (p) => {
            setLoading(false);
            if (!p || typeof p !== 'object') return;
            if (p.ok) {
                setText(typeof p.content === 'string' ? p.content : '');
                setPathLabel(typeof p.path === 'string' ? p.path : '');
                setFileExists(!!p.exists);
                setLoadedOnce(true);
                setFeedback(null);
            } else {
                setFeedback({
                    ok: false,
                    message: p.message || 'Não foi possível ler o .env.',
                });
            }
        };
        const onSave = (p) => {
            setSaving(false);
            if (!p || typeof p !== 'object') return;
            setFeedback({
                ok: !!p.ok,
                message: p.message || (p.ok ? 'Gravado.' : 'Falha ao gravar.'),
            });
            window.setTimeout(() => setFeedback(null), 10000);
            if (p.ok) {
                socket.emit('get_settings');
            }
        };
        socket.on('dotenv_file_content', onContent);
        socket.on('dotenv_file_save_result', onSave);
        return () => {
            socket.off('dotenv_file_content', onContent);
            socket.off('dotenv_file_save_result', onSave);
        };
    }, [socket]);

    const loadFromDisk = () => {
        setLoading(true);
        setFeedback(null);
        socket.emit('get_dotenv_file');
    };

    const save = () => {
        setSaving(true);
        setFeedback(null);
        socket.emit('save_dotenv_file', { content: text });
    };

    const shell =
        'rounded-[1.15rem] border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/40 p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

    return (
        <section className="mb-8 sm:mb-10">
            <h3 className={sectionTitleClass}>
                <FileText className="h-3.5 w-3.5" strokeWidth={2} />
                Ficheiro .env (avançado)
            </h3>
            <p className="mb-4 max-w-3xl text-xs leading-relaxed text-zinc-400 sm:text-sm">
                Edição direta do <code className="text-zinc-400">.env</code> na raiz do projeto. Ao gravar, o backend recarrega variáveis
                e cria <code className="text-zinc-400">.env.bak</code> com a versão anterior. O ficheiro{' '}
                <code className="text-zinc-400">data/local_credentials.json</code> continua a{' '}
                <strong className="text-zinc-400">sobrepor</strong> chaves que lá estiverem definidas. Não partilhes este ecrã — o texto
                inclui segredos.
            </p>
            <div className={shell}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={loadFromDisk}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-45"
                        style={{ WebkitAppRegion: 'no-drag' }}
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        {loadedOnce ? 'Recarregar do disco' : 'Carregar do disco'}
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || !loadedOnce}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                        style={{ WebkitAppRegion: 'no-drag' }}
                    >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                        Gravar .env
                    </button>
                    {pathLabel ? (
                        <span className="text-[10px] text-zinc-400">
                            <span className="text-zinc-500">Caminho: </span>
                            <span className="break-all font-mono text-zinc-400">{pathLabel}</span>
                            {!fileExists && loadedOnce ? (
                                <span className="ml-2 text-amber-200/80">(novo ao gravar)</span>
                            ) : null}
                        </span>
                    ) : null}
                </div>
                {!loadedOnce ? (
                    <p className="text-xs text-zinc-500">
                        Carrega o ficheiro do disco para editar. Até lá o editor fica vazio.
                    </p>
                ) : (
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        spellCheck={false}
                        className="min-h-[220px] w-full resize-y rounded-xl border border-white/15 bg-black/55 px-3 py-2.5 font-mono text-[11px] font-semibold leading-relaxed text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] focus:border-amber-500/35 focus:outline-none focus:ring-1 focus:ring-amber-500/25"
                        style={{ WebkitAppRegion: 'no-drag' }}
                        aria-label="Conteúdo do ficheiro .env"
                    />
                )}
                {feedback ? (
                    <div
                        className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                            feedback.ok
                                ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-100'
                                : 'border-rose-500/30 bg-rose-950/20 text-rose-100'
                        }`}
                        role="status"
                    >
                        {feedback.message}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

function EnvReferenceSection() {
    const [expanded, setExpanded] = useState(false);
    const groups = [
        {
            title: 'LLM principal',
            icon: Bot,
            keys: [
                ['GEMINI_API_KEY', 'Chave da ATHENAS (voz/chat Live).'],
                ['ORBITAL_EXPOSE_SECRETS_IN_SETTINGS_UI', 'Mostra segredos na UI local (somente dev).'],
            ],
        },
        {
            title: 'Supabase',
            icon: Database,
            keys: [
                ['SUPABASE_URL', 'URL do projeto Supabase.'],
                ['SUPABASE_SERVICE_ROLE_KEY', 'Chave de servidor (recomendado no backend).'],
                ['SUPABASE_ANON_KEY', 'Alternativa com políticas RLS adequadas.'],
                ['SUPABASE_CONFIG_ENABLED', 'Liga/desliga uso de config remota.'],
                ['ATHENA_SETTINGS_MODULE_KEY', 'module_key em athena_settings (default: athena).'],
            ],
        },
        {
            title: 'Memória remota (Ollama gate)',
            icon: Brain,
            keys: [
                ['ORBITAL_MEMORY_OLLAMA_GATE', 'Liga/desliga classificador seletivo de memória.'],
                ['ORBITAL_MEMORY_GEMINI_GATE', 'Compat legado (se off, também desliga o gate).'],
                ['ORBITAL_MEMORY_FULL_REMOTE', 'Se on, envia tudo para remoto (sem filtro).'],
                ['ORBITAL_MEMORY_GATE_MODEL', 'Modelo Ollama usado no gate (ex.: qwen2.5:7b).'],
                ['ORBITAL_MEMORY_OLLAMA_MODEL', 'Alias opcional de modelo (compat).'],
                ['ORBITAL_MEMORY_OLLAMA_URL', 'Endpoint local do Ollama.'],
                ['ORBITAL_MEMORY_GATE_RETRIES', 'Tentativas em falha de chamada local.'],
                ['ORBITAL_MEMORY_GATE_TIMEOUT_SEC', 'Timeout por requisição do gate.'],
                ['ORBITAL_MEMORY_SALIENCE_DEBUG', 'Logs detalhados de decisão de memória.'],
            ],
        },
        {
            title: 'Embeddings e busca semântica',
            icon: Search,
            keys: [
                ['ORBITAL_CHAT_SEMANTIC', 'Liga/desliga busca semântica no histórico.'],
                ['ORBITAL_EMBED_INDEX', 'Liga indexação automática por embeddings.'],
                ['ORBITAL_EMBED_SENDERS', 'Quem indexar: * ou User, ATHENAS.'],
                ['ORBITAL_EMBED_MIN_LENGTH', 'Mínimo de caracteres para indexar.'],
                ['ORBITAL_EMBED_MAX_CHARS', 'Máximo de caracteres por embedding.'],
                ['ORBITAL_CHAT_STARTUP_CONTEXT_LIMIT', 'Mensagens usadas no startup/reconnect.'],
            ],
        },
        {
            title: 'Integrações',
            icon: Plug2,
            keys: [
                ['COMFYUI_BASE_URL', 'Base URL do ComfyUI local.'],
                ['COMFYUI_WORKFLOW_FILE', 'Workflow customizado (opcional).'],
                ['ATHENA_GOOGLE_CALENDAR_WEBHOOK_URL', 'Webhook padrão de calendário (opcional).'],
                ['ORBITAL_DISABLE_DEFAULT_CALENDAR_WEBHOOK', 'Desliga injeção do webhook padrão.'],
                ['ORBITAL_INTEGRATION_TEST_LOG', 'Logs extras no teste de integrações.'],
                ['ORBITAL_SKIP_WEBHOOK_POST_PROBE', 'Não faz POST de probe em /webhook/.'],
            ],
        },
        {
            title: 'Finance / extras',
            icon: FileText,
            keys: [
                ['PIERRE_API_KEY', 'Token da integração Pierre (opcional).'],
                ['PIERRE_BASE_URL', 'URL base da API Pierre.'],
                ['PIERRE_TIMEOUT_SECONDS', 'Timeout das chamadas padrão.'],
                ['PIERRE_MANUAL_UPDATE_TIMEOUT_SECONDS', 'Timeout de atualizações manuais.'],
                ['PIERRE_POST_SYNC_WAIT_SECONDS', 'Espera base após sync.'],
                ['PIERRE_POST_SYNC_EXTRA_WAIT_INPROGRESS', 'Espera extra se houver itens em progresso.'],
                ['PIERRE_POST_SYNC_WAIT_MAX', 'Limite máximo de espera pós-sync.'],
                ['PIERRE_FOLLOW_UP_SNAPSHOT_SECONDS', 'Delay para snapshot de confirmação.'],
                ['ORBITAL_SKIP_DOCKER_START', 'Não executa docker start no arranque do Electron.'],
                ['ORBITAL_DOCKER_CONTAINERS', 'Nomes Docker (vírgula), ex.: n8n. Default: n8n.'],
                ['ORBITAL_START_DOCKER_DESKTOP', 'Windows: 0 = não abrir Docker Desktop se o daemon estiver parado.'],
                ['ORBITAL_DOCKER_DESKTOP_EXE', 'Caminho do Docker Desktop.exe (opcional).'],
                ['ORBITAL_DOCKER_WAIT_MS', 'Tempo máximo a esperar pelo daemon após abrir o Desktop (ms).'],
                ['ORBITAL_DOCKER_CLI', 'Caminho completo do docker.exe se o Electron não tiver docker no PATH.'],
                ['ORBITAL_DOCKER_STOP_ON_QUIT', 'Se 1, executa docker stop nos containers ao sair do app.'],
                ['ORBITAL_SKIP_CLOUDFLARED', 'Desliga bootstrap de cloudflared.'],
                ['CLOUDFLARED_TUNNEL', 'Nome do túnel cloudflared.'],
                ['CLOUDFLARED_EXE', 'Caminho do executável cloudflared.'],
            ],
        },
    ];

    return (
        <section className="mb-8 sm:mb-10">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className={`${sectionTitleClass} mb-0`}>
                    <Wrench className="h-3.5 w-3.5" strokeWidth={2} />
                    Mapa de configurações (.env)
                </h3>
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-200 transition-colors hover:bg-white/10"
                    style={{ WebkitAppRegion: 'no-drag' }}
                >
                    {expanded ? 'Ocultar' : 'Exibir'}
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
            </div>
            <p className="mb-4 max-w-3xl text-xs leading-relaxed text-zinc-400 sm:text-sm">
                Referência rápida das variáveis suportadas pelo backend.
            </p>
            {expanded ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {groups.map((group) => {
                        const Icon = group.icon;
                        return (
                            <div
                                key={group.title}
                                className="rounded-[1.15rem] border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                            >
                                <div className="mb-3 flex items-center gap-2">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-zinc-300">
                                        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                                    </span>
                                    <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-zinc-200">
                                        {group.title}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {group.keys.map(([keyName, help]) => (
                                        <div key={keyName} className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
                                            <code className="text-[10px] text-cyan-200">{keyName}</code>
                                            <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{help}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}

/**
 * Checkbox nativo com área de clique total — em Electron, <button> + filhos absolutos
 * às vezes não recebem o clique corretamente com -webkit-app-region.
 */
function SettingsSwitch({ checked, onCheckedChange, ariaLabel }) {
    return (
        <label
            className="relative inline-block h-5 w-9 shrink-0 cursor-pointer align-middle"
            style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' }}
        >
            <input
                type="checkbox"
                role="switch"
                aria-checked={checked}
                aria-label={ariaLabel}
                className="absolute inset-0 z-20 m-0 h-5 w-9 cursor-pointer opacity-0"
                checked={checked}
                onChange={(e) => onCheckedChange(e.target.checked)}
            />
            <span
                aria-hidden
                className={`block h-5 w-9 rounded-full border transition-colors duration-200 ${
                    checked
                        ? 'border-emerald-400/35 bg-emerald-400/15'
                        : 'border-white/10 bg-black/30'
                }`}
            />
            <span
                aria-hidden
                className={`pointer-events-none absolute left-0.5 top-0.5 z-10 h-4 w-4 rounded-full shadow transition-transform duration-200 ${
                    checked ? 'translate-x-4 bg-emerald-300' : 'translate-x-0 bg-zinc-500'
                }`}
            />
        </label>
    );
}

const SettingsWindow = ({
    socket,
    micDevices,
    speakerDevices,
    webcamDevices,
    selectedMicId,
    setSelectedMicId,
    selectedSpeakerId,
    setSelectedSpeakerId,
    selectedWebcamId,
    setSelectedWebcamId,
    cursorSensitivity,
    setCursorSensitivity,
    micInputGain,
    setMicInputGain,
    audioVadThreshold,
    setAudioVadThreshold,
    audioSilenceMs,
    setAudioSilenceMs,
    isCameraFlipped,
    setIsCameraFlipped,
    showChatVisualization,
    setShowChatVisualization,
    onClose,
    pickExecutable,
}) => {
    const [permissions, setPermissions] = useState({});
    const [faceAuthEnabled, setFaceAuthEnabled] = useState(false);
    const [semanticSearchEnabled, setSemanticSearchEnabled] = useState(true);
    const [semanticEmbedIndex, setSemanticEmbedIndex] = useState(true);
    const [semanticEmbedSenders, setSemanticEmbedSenders] = useState('User, ATHENAS');
    const [semanticEmbedMinLength, setSemanticEmbedMinLength] = useState('24');
    const [semanticEmbedMaxChars, setSemanticEmbedMaxChars] = useState('8000');
    const [chatStartupContextLimit, setChatStartupContextLimit] = useState('100');
    const [memoryRemoteSelective, setMemoryRemoteSelectiveState] = useState(true);
    const [memoryOllamaGateEnabled, setMemoryOllamaGateState] = useState(true);
    const [memoryFullRemote, setMemoryFullRemoteState] = useState(false);
    const [memoryGeminiGateEnabled, setMemoryGeminiGateEnabledState] = useState(true);
    const [memoryGateModel, setMemoryGateModel] = useState('');
    const [memoryOllamaModel, setMemoryOllamaModel] = useState('');
    const [memoryOllamaUrl, setMemoryOllamaUrl] = useState('');
    const [memoryGateRetries, setMemoryGateRetries] = useState('3');
    const [memoryGateTimeoutSec, setMemoryGateTimeoutSec] = useState('20');
    const [memorySalienceDebug, setMemorySalienceDebugState] = useState(false);
    const [launchAppCatalog, setLaunchAppCatalog] = useState([]);
    const [launchAppsConfigPath, setLaunchAppsConfigPath] = useState('');
    const [pathCopied, setPathCopied] = useState(false);
    const [catalogRefreshing, setCatalogRefreshing] = useState(false);
    const [integrations, setIntegrations] = useState(null);
    const [integrationsReady, setIntegrationsReady] = useState(false);
    const [integrationTestRunning, setIntegrationTestRunning] = useState(false);
    const [integrationTestResults, setIntegrationTestResults] = useState(null);
    const [integrationTestError, setIntegrationTestError] = useState(null);
    const [credentialsMeta, setCredentialsMeta] = useState(null);

    const [addDraftPath, setAddDraftPath] = useState('');
    const [addDraftId, setAddDraftId] = useState('');
    const [addDraftLabel, setAddDraftLabel] = useState('');
    const [addDraftDesc, setAddDraftDesc] = useState('');
    const [addSaving, setAddSaving] = useState(false);
    const [addFeedback, setAddFeedback] = useState(null);

    const refreshCatalog = useCallback(() => {
        setCatalogRefreshing(true);
        socket.emit('get_settings');
    }, [socket]);

    const runIntegrationTests = useCallback(() => {
        setIntegrationTestRunning(true);
        setIntegrationTestError(null);
        setIntegrationTestResults(null);
        socket.emit('test_integrations');
    }, [socket]);

    useEffect(() => {
        const onIntegrationTestResult = (payload) => {
            setIntegrationTestRunning(false);
            if (!payload || payload.ok === false) {
                setIntegrationTestResults(null);
                setIntegrationTestError(
                    typeof payload?.error === 'string' ? payload.error : 'Falha ao executar testes de integração.'
                );
                return;
            }
            setIntegrationTestError(null);
            setIntegrationTestResults(payload.results || null);
        };
        socket.on('integration_test_result', onIntegrationTestResult);
        return () => socket.off('integration_test_result', onIntegrationTestResult);
    }, [socket]);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    useEffect(() => {
        const onAddResult = (payload) => {
            setAddSaving(false);
            if (!payload || typeof payload !== 'object') return;
            const ok = !!payload.ok;
            const message = payload.message || (ok ? 'Salvo.' : 'Falha ao salvar.');
            setAddFeedback({ ok, message });
            if (ok) {
                setAddDraftPath('');
                setAddDraftId('');
                setAddDraftLabel('');
                setAddDraftDesc('');
            }
            window.setTimeout(() => setAddFeedback(null), 6000);
        };
        socket.on('launch_app_add_result', onAddResult);
        return () => socket.off('launch_app_add_result', onAddResult);
    }, [socket]);

    const pickAndFill = useCallback(async () => {
        if (typeof pickExecutable !== 'function') return;
        try {
            const p = await pickExecutable();
            if (p && typeof p === 'string') {
                setAddDraftPath(p);
                setAddDraftId(suggestLaunchAppIdFromPath(p));
                setAddDraftLabel(defaultLabelFromPath(p));
                setAddDraftDesc('');
                setAddFeedback(null);
            }
        } catch {
            setAddFeedback({ ok: false, message: 'Não foi possível abrir o gerenciador de arquivos.' });
        }
    }, [pickExecutable]);

    const clearAddDraft = useCallback(() => {
        setAddDraftPath('');
        setAddDraftId('');
        setAddDraftLabel('');
        setAddDraftDesc('');
        setAddFeedback(null);
    }, []);

    const submitAddLaunchApp = useCallback(() => {
        if (!addDraftPath.trim()) return;
        setAddSaving(true);
        setAddFeedback(null);
        socket.emit('add_launch_app', {
            path: addDraftPath.trim(),
            id: addDraftId.trim() || undefined,
            label: addDraftLabel.trim() || undefined,
            description: addDraftDesc.trim() || undefined,
        });
    }, [addDraftPath, addDraftId, addDraftLabel, addDraftDesc, socket]);

    useEffect(() => {
        socket.emit('get_settings');

        const handleSettings = (settings) => {
            if (!settings) return;
            if (settings.tool_permissions) setPermissions(settings.tool_permissions);
            if (typeof settings.face_auth_enabled !== 'undefined') {
                setFaceAuthEnabled(settings.face_auth_enabled);
                localStorage.setItem('face_auth_enabled', settings.face_auth_enabled);
            }
            if (typeof settings.semantic_search_enabled !== 'undefined') {
                setSemanticSearchEnabled(!!settings.semantic_search_enabled);
            }
            if (typeof settings.semantic_embed_index !== 'undefined') {
                setSemanticEmbedIndex(!!settings.semantic_embed_index);
            }
            if (typeof settings.semantic_embed_senders === 'string') {
                setSemanticEmbedSenders(settings.semantic_embed_senders || 'User, ATHENAS');
            }
            if (typeof settings.chat_startup_context_limit === 'number') {
                setChatStartupContextLimit(String(settings.chat_startup_context_limit));
            } else if (settings.chat_startup_context_limit != null) {
                const n = parseInt(String(settings.chat_startup_context_limit), 10);
                if (!Number.isNaN(n)) setChatStartupContextLimit(String(n));
            }
            if (typeof settings.semantic_embed_min_length === 'number') {
                setSemanticEmbedMinLength(String(settings.semantic_embed_min_length));
            } else if (settings.semantic_embed_min_length != null) {
                const n = parseInt(String(settings.semantic_embed_min_length), 10);
                if (!Number.isNaN(n)) setSemanticEmbedMinLength(String(n));
            }
            if (typeof settings.semantic_embed_max_chars === 'number') {
                setSemanticEmbedMaxChars(String(settings.semantic_embed_max_chars));
            } else if (settings.semantic_embed_max_chars != null) {
                const n = parseInt(String(settings.semantic_embed_max_chars), 10);
                if (!Number.isNaN(n)) setSemanticEmbedMaxChars(String(n));
            }
            if (typeof settings.memory_remote_selective !== 'undefined') {
                setMemoryRemoteSelectiveState(!!settings.memory_remote_selective);
            }
            if (typeof settings.memory_ollama_gate_enabled !== 'undefined') {
                setMemoryOllamaGateState(!!settings.memory_ollama_gate_enabled);
            } else if (typeof settings.memory_gemini_gate_enabled !== 'undefined') {
                setMemoryOllamaGateState(!!settings.memory_gemini_gate_enabled);
            }
            if (typeof settings.memory_full_remote !== 'undefined') {
                setMemoryFullRemoteState(!!settings.memory_full_remote);
            }
            if (typeof settings.memory_gemini_gate_enabled !== 'undefined') {
                setMemoryGeminiGateEnabledState(!!settings.memory_gemini_gate_enabled);
            }
            if (typeof settings.memory_gate_model === 'string') {
                setMemoryGateModel(settings.memory_gate_model);
            }
            if (typeof settings.memory_ollama_model === 'string') {
                setMemoryOllamaModel(settings.memory_ollama_model);
            }
            if (typeof settings.memory_ollama_url === 'string') {
                setMemoryOllamaUrl(settings.memory_ollama_url);
            }
            if (typeof settings.memory_gate_retries === 'number') {
                setMemoryGateRetries(String(settings.memory_gate_retries));
            } else if (settings.memory_gate_retries != null) {
                const n = parseInt(String(settings.memory_gate_retries), 10);
                if (!Number.isNaN(n)) setMemoryGateRetries(String(n));
            }
            if (typeof settings.memory_gate_timeout_sec === 'number') {
                setMemoryGateTimeoutSec(String(settings.memory_gate_timeout_sec));
            } else if (settings.memory_gate_timeout_sec != null) {
                const n = parseFloat(String(settings.memory_gate_timeout_sec));
                if (!Number.isNaN(n)) setMemoryGateTimeoutSec(String(n));
            }
            if (typeof settings.memory_salience_debug !== 'undefined') {
                setMemorySalienceDebugState(!!settings.memory_salience_debug);
            }
            if (Array.isArray(settings.launch_app_catalog)) {
                setLaunchAppCatalog(settings.launch_app_catalog);
            }
            if (typeof settings.launch_apps_config_path === 'string') {
                setLaunchAppsConfigPath(settings.launch_apps_config_path);
            }
            setIntegrationsReady(true);
            if (Object.prototype.hasOwnProperty.call(settings, 'integrations') && settings.integrations != null) {
                setIntegrations(settings.integrations);
            } else {
                setIntegrations(null);
            }
            if (settings.credentials_meta != null && typeof settings.credentials_meta === 'object') {
                setCredentialsMeta(settings.credentials_meta);
            } else {
                setCredentialsMeta({
                    credentials_file: 'data/local_credentials.json',
                    credentials_file_exists: false,
                    supabase_url: '',
                    supabase_configured: false,
                    supabase_host: '',
                    supabase_config_enabled: true,
                    athena_settings_module_key: 'athena',
                    supabase_anon_key_length: 0,
                    supabase_service_role_key_length: 0,
                    gemini_configured: false,
                    comfyui_base_url: 'http://127.0.0.1:2000',
                    comfyui_workflow_file: '',
                    secrets_visible_in_ui: false,
                    supabase_secret_length: 0,
                    gemini_api_key_length: 0,
                });
            }
            setCatalogRefreshing(false);
        };

        socket.on('settings', handleSettings);
        return () => {
            socket.off('settings', handleSettings);
        };
    }, [socket]);

    const togglePermission = (toolId, nextVal) => {
        setPermissions((prev) => ({ ...prev, [toolId]: nextVal }));
        socket.emit('update_settings', { tool_permissions: { [toolId]: nextVal } });
    };

    const setFaceAuth = (newVal) => {
        setFaceAuthEnabled(newVal);
        localStorage.setItem('face_auth_enabled', newVal);
        socket.emit('update_settings', { face_auth_enabled: newVal });
    };

    const setCameraFlip = (newVal) => {
        setIsCameraFlipped(newVal);
        socket.emit('update_settings', { camera_flipped: newVal });
    };

    const setSemanticSearch = (newVal) => {
        setSemanticSearchEnabled(newVal);
        socket.emit('update_settings', { semantic_search_enabled: newVal });
    };

    const setSemanticIndex = (newVal) => {
        setSemanticEmbedIndex(newVal);
        socket.emit('update_settings', { semantic_embed_index: newVal });
    };

    const commitSemanticEmbedSenders = useCallback(
        (str) => {
            const s = (str || '').trim() || 'User, ATHENAS';
            setSemanticEmbedSenders(s);
            socket.emit('update_settings', { semantic_embed_senders: s });
        },
        [socket]
    );

    const flushSemanticMinLength = useCallback(() => {
        const n = parseInt(String(semanticEmbedMinLength).trim(), 10);
        const v = Number.isNaN(n) ? 24 : Math.max(0, Math.min(500, n));
        setSemanticEmbedMinLength(String(v));
        socket.emit('update_settings', { semantic_embed_min_length: v });
    }, [semanticEmbedMinLength, socket]);

    const flushSemanticMaxChars = useCallback(() => {
        const n = parseInt(String(semanticEmbedMaxChars).trim(), 10);
        const v = Number.isNaN(n) ? 8000 : Math.max(200, Math.min(8000, n));
        setSemanticEmbedMaxChars(String(v));
        socket.emit('update_settings', { semantic_embed_max_chars: v });
    }, [semanticEmbedMaxChars, socket]);

    const flushChatStartupContextLimit = useCallback(() => {
        const n = parseInt(String(chatStartupContextLimit).trim(), 10);
        const v = Number.isNaN(n) ? 100 : Math.max(10, Math.min(500, n));
        setChatStartupContextLimit(String(v));
        socket.emit('update_settings', { chat_startup_context_limit: v });
    }, [chatStartupContextLimit, socket]);

    const setMemoryRemoteSelective = useCallback(
        (v) => {
            const next = !!v;
            setMemoryRemoteSelectiveState(next);
            socket.emit('update_settings', { memory_remote_selective: next });
        },
        [socket]
    );

    const setMemoryOllamaGateEnabled = useCallback((v) => {
        const next = !!v;
        setMemoryOllamaGateState(next);
        socket.emit('update_settings', { memory_ollama_gate_enabled: next });
    }, [socket]);

    const setMemoryFullRemote = useCallback((v) => {
        const next = !!v;
        setMemoryFullRemoteState(next);
        socket.emit('update_settings', { memory_full_remote: next });
    }, [socket]);

    const setMemoryGeminiGateEnabled = useCallback((v) => {
        const next = !!v;
        setMemoryGeminiGateEnabledState(next);
        socket.emit('update_settings', { memory_gemini_gate_enabled: next });
    }, [socket]);

    const flushMemoryGateModel = useCallback(() => {
        socket.emit('update_settings', { memory_gate_model: memoryGateModel.trim() });
    }, [memoryGateModel, socket]);

    const flushMemoryOllamaModel = useCallback(() => {
        socket.emit('update_settings', { memory_ollama_model: memoryOllamaModel.trim() });
    }, [memoryOllamaModel, socket]);

    const flushMemoryOllamaUrl = useCallback(() => {
        socket.emit('update_settings', { memory_ollama_url: memoryOllamaUrl.trim() });
    }, [memoryOllamaUrl, socket]);

    const flushMemoryGateRetries = useCallback(() => {
        const n = parseInt(String(memoryGateRetries).trim(), 10);
        const v = Number.isNaN(n) ? 3 : Math.max(1, Math.min(5, n));
        setMemoryGateRetries(String(v));
        socket.emit('update_settings', { memory_gate_retries: v });
    }, [memoryGateRetries, socket]);

    const flushMemoryGateTimeoutSec = useCallback(() => {
        const n = parseFloat(String(memoryGateTimeoutSec).trim());
        const v = Number.isNaN(n) ? 20 : Math.max(3, Math.min(120, n));
        setMemoryGateTimeoutSec(String(v));
        socket.emit('update_settings', { memory_gate_timeout_sec: v });
    }, [memoryGateTimeoutSec, socket]);

    const setMemorySalienceDebug = useCallback((v) => {
        const next = !!v;
        setMemorySalienceDebugState(next);
        socket.emit('update_settings', { memory_salience_debug: next });
    }, [socket]);

    const copyConfigPath = async () => {
        if (!launchAppsConfigPath) return;
        try {
            await navigator.clipboard.writeText(launchAppsConfigPath);
            setPathCopied(true);
            setTimeout(() => setPathCopied(false), 2000);
        } catch {
            window.prompt('Copie o caminho:', launchAppsConfigPath);
        }
    };

    const ui = (
        <div
            id="settings-portal-root"
            className={`fixed inset-0 z-[250] flex h-[100dvh] w-full flex-col overflow-hidden border-0 bg-zinc-950/[0.95] text-zinc-100 shadow-[inset_0_0_120px_rgba(0,0,0,0.35)] backdrop-blur-[0.5px] pointer-events-auto outline-none ring-0 ${settingsType}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            style={{ WebkitAppRegion: 'no-drag' }}
        >
            {/* Evita blur-2xl + textura remota — no Electron o scroll ficava ~20 fps. */}
            <div
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.025),transparent_22%)]"
                aria-hidden
            />
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_0%,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.55)_100%)]"
                aria-hidden
            />

            {/* Só esta faixa arrasta a janela (Electron). O resto precisa ser no-drag para selects/botões funcionarem. */}
            <div
                className="relative z-10 h-3 w-full shrink-0 cursor-grab bg-gradient-to-r from-white/10 via-white/5 to-transparent active:cursor-grabbing"
                style={{ WebkitAppRegion: 'drag' }}
                title="Arrastar janela"
                aria-hidden
            />

            <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-white/15 bg-zinc-950/70 px-6 py-4 sm:px-10 sm:py-5">
                <div className="min-w-0 flex-1">
                    <h2
                        id="settings-title"
                        className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-50 sm:text-base"
                    >
                        Configurações
                    </h2>
                    <p className="mt-1 max-w-2xl text-xs text-zinc-400">
                        Áudio, câmera, cérebro (Supabase + Gemini), memória &amp; contexto, integrações (ComfyUI, n8n, Pierre), apps e ATHENAS.
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-400">Esc para fechar</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-2 text-sm font-bold text-zinc-100 transition-colors hover:bg-white/12 hover:text-white"
                >
                    <X size={18} aria-hidden />
                    Fechar
                </button>
            </header>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 transform-gpu overflow-y-auto overflow-x-hidden overscroll-y-contain px-6 py-6 sm:px-8 lg:px-10 [contain:layout]">
                    <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-col xl:min-h-[calc(100dvh-9rem)]">
                        <BrainAndIntegrationsPanels
                            integrations={integrations}
                            integrationsReady={integrationsReady}
                            testRunning={integrationTestRunning}
                            testResults={integrationTestResults}
                            testError={integrationTestError}
                            onRunTests={runIntegrationTests}
                            credentialsMeta={credentialsMeta}
                            socket={socket}
                        >
                            <SemanticMemoryHubSection
                                integrations={integrations}
                                credentialsMeta={credentialsMeta}
                                testResults={integrationTestResults}
                                testRunning={integrationTestRunning}
                                semanticSearchEnabled={semanticSearchEnabled}
                                semanticEmbedIndex={semanticEmbedIndex}
                                semanticEmbedSenders={semanticEmbedSenders}
                                semanticEmbedMinLength={semanticEmbedMinLength}
                                semanticEmbedMaxChars={semanticEmbedMaxChars}
                                memoryRemoteSelective={memoryRemoteSelective}
                                setMemoryRemoteSelective={setMemoryRemoteSelective}
                                memoryOllamaGateEnabled={memoryOllamaGateEnabled}
                                setMemoryOllamaGateEnabled={setMemoryOllamaGateEnabled}
                                memoryFullRemote={memoryFullRemote}
                                setMemoryFullRemote={setMemoryFullRemote}
                                memoryGeminiGateEnabled={memoryGeminiGateEnabled}
                                setMemoryGeminiGateEnabled={setMemoryGeminiGateEnabled}
                                memoryGateModel={memoryGateModel}
                                setMemoryGateModel={setMemoryGateModel}
                                flushMemoryGateModel={flushMemoryGateModel}
                                memoryOllamaModel={memoryOllamaModel}
                                setMemoryOllamaModel={setMemoryOllamaModel}
                                flushMemoryOllamaModel={flushMemoryOllamaModel}
                                memoryOllamaUrl={memoryOllamaUrl}
                                setMemoryOllamaUrl={setMemoryOllamaUrl}
                                flushMemoryOllamaUrl={flushMemoryOllamaUrl}
                                memoryGateRetries={memoryGateRetries}
                                setMemoryGateRetries={setMemoryGateRetries}
                                flushMemoryGateRetries={flushMemoryGateRetries}
                                memoryGateTimeoutSec={memoryGateTimeoutSec}
                                setMemoryGateTimeoutSec={setMemoryGateTimeoutSec}
                                flushMemoryGateTimeoutSec={flushMemoryGateTimeoutSec}
                                memorySalienceDebug={memorySalienceDebug}
                                setMemorySalienceDebug={setMemorySalienceDebug}
                                chatStartupContextLimit={chatStartupContextLimit}
                                setChatStartupContextLimit={setChatStartupContextLimit}
                                flushChatStartupContextLimit={flushChatStartupContextLimit}
                                setSemanticSearch={setSemanticSearch}
                                setSemanticIndex={setSemanticIndex}
                                commitSemanticEmbedSenders={commitSemanticEmbedSenders}
                                setSemanticEmbedMinLength={setSemanticEmbedMinLength}
                                flushSemanticMinLength={flushSemanticMinLength}
                                setSemanticEmbedMaxChars={setSemanticEmbedMaxChars}
                                flushSemanticMaxChars={flushSemanticMaxChars}
                            />
                        </BrainAndIntegrationsPanels>
                        <EnvReferenceSection />
                        <DotEnvFileSection socket={socket} />
                        <div className="grid min-h-0 grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8 xl:[grid-template-rows:1fr] xl:items-stretch">
                            <div className="flex flex-col gap-4 xl:h-full xl:min-h-0 xl:justify-start xl:gap-5 xl:py-1">
                                <section>
                                    <h3 className={sectionTitleClass}>
                                        <Shield className="h-3.5 w-3.5" strokeWidth={2} />
                                        Segurança
                                    </h3>
                                    <div className={rowClass}>
                                        <span className="text-zinc-100">Autenticação facial</span>
                                        <SettingsSwitch
                                            checked={faceAuthEnabled}
                                            onCheckedChange={setFaceAuth}
                                            ariaLabel="Alternar autenticação facial"
                                        />
                                    </div>
                                </section>

                                <section>
                                    <h3 className={sectionTitleClass}>
                                        <Mic className="h-3.5 w-3.5" strokeWidth={2} />
                                        Áudio e câmera
                                    </h3>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-zinc-400">
                                                Microfone
                                            </label>
                                            <select
                                                value={selectedMicId}
                                                onChange={(e) => setSelectedMicId(e.target.value)}
                                                className={fieldClass}
                                            >
                                                {micDevices.map((device, i) => (
                                                    <option key={device.deviceId} value={device.deviceId}>
                                                        {device.label || `Microfone ${i + 1}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-3">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                                                    Sensibilidade / ganho de entrada
                                                </span>
                                                <span className="font-mono text-xs tabular-nums text-zinc-300">
                                                    {micInputGain.toFixed(2)}×
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min={0.25}
                                                max={4}
                                                step={0.05}
                                                value={micInputGain}
                                                onChange={(e) =>
                                                    setMicInputGain(parseFloat(e.target.value))
                                                }
                                                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-400"
                                            />
                                            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                                                Amplifica o áudio captado antes de enviar à ATHENAS (e na visualização). Use
                                                valores maiores se o microfone for quieto; acima de ~2,5 pode distorcer.
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-3">
                                            <div className="mb-1 flex items-center gap-2">
                                                <SlidersHorizontal className="h-3 w-3 text-zinc-500" />
                                                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                                                    Detecção de voz (microfone no backend)
                                                </span>
                                            </div>
                                            <p className="mb-3 text-[10px] leading-relaxed text-zinc-500">
                                                Controla quando o sistema considera que você está falando e quando “encerra” um
                                                trecho após silêncio. Ajustes aplicam em tempo real com a ATHENAS ligada.
                                            </p>
                                            <div className="mb-4">
                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                                                        Limiar de volume (RMS)
                                                    </span>
                                                    <span className="font-mono text-xs tabular-nums text-zinc-300">
                                                        {audioVadThreshold}
                                                    </span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min={200}
                                                    max={3000}
                                                    step={25}
                                                    value={audioVadThreshold}
                                                    onChange={(e) => setAudioVadThreshold(parseInt(e.target.value, 10))}
                                                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-cyan-400"
                                                />
                                                <p className="mt-1.5 text-[10px] text-zinc-600">
                                                    Mais baixo = mais sensível (pega ruído); mais alto = só voz forte.
                                                </p>
                                            </div>
                                            <div>
                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                                                        Silêncio para encerrar fala
                                                    </span>
                                                    <span className="font-mono text-xs tabular-nums text-zinc-300">
                                                        {audioSilenceMs} ms
                                                    </span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min={100}
                                                    max={800}
                                                    step={10}
                                                    value={audioSilenceMs}
                                                    onChange={(e) => setAudioSilenceMs(parseInt(e.target.value, 10))}
                                                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-cyan-400"
                                                />
                                                <p className="mt-1.5 text-[10px] text-zinc-600">
                                                    Mais curto = resposta mais rápida; maior = evita cortar pausas naturais.
                                                </p>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-400">
                                                <Volume2 className="h-3 w-3" /> Alto-falante
                                            </label>
                                            <select
                                                value={selectedSpeakerId}
                                                onChange={(e) => setSelectedSpeakerId(e.target.value)}
                                                className={fieldClass}
                                            >
                                                {speakerDevices.map((device, i) => (
                                                    <option key={device.deviceId} value={device.deviceId}>
                                                        {device.label || `Alto-falante ${i + 1}`}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                                                Saída da voz da IA (PyAudio). Se mudar e o som não trocar, desligue e ligue a
                                                ATHENAS (botão energia).
                                            </p>
                                        </div>
                                        <div>
                                            <label className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-400">
                                                <Video className="h-3 w-3" /> Webcam
                                            </label>
                                            <select
                                                value={selectedWebcamId}
                                                onChange={(e) => setSelectedWebcamId(e.target.value)}
                                                className={fieldClass}
                                            >
                                                {webcamDevices.map((device, i) => (
                                                    <option key={device.deviceId} value={device.deviceId}>
                                                        {device.label || `Câmera ${i + 1}`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <h3 className={sectionTitleClass}>
                                        <MousePointer2 className="h-3.5 w-3.5" strokeWidth={2} />
                                        Cursor
                                    </h3>
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-[10px] uppercase tracking-wider text-zinc-400">Sensibilidade</span>
                                        <span className="font-mono text-xs text-zinc-300">{cursorSensitivity}x</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="1.0"
                                        max="5.0"
                                        step="0.1"
                                        value={cursorSensitivity}
                                        onChange={(e) => setCursorSensitivity(parseFloat(e.target.value))}
                                        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-zinc-200"
                                    />
                                </section>

                                <section>
                                    <h3 className={sectionTitleClass}>
                                        <Hand className="h-3.5 w-3.5" strokeWidth={2} />
                                        Gestos
                                    </h3>
                                    <div className={rowClass}>
                                        <span className="text-zinc-100">Espelhar câmera (horizontal)</span>
                                        <SettingsSwitch
                                            checked={isCameraFlipped}
                                            onCheckedChange={setCameraFlip}
                                            ariaLabel="Espelhar câmera"
                                        />
                                    </div>
                                </section>

                                <section>
                                    <h3 className={sectionTitleClass}>
                                        <Palette className="h-3.5 w-3.5" strokeWidth={2} />
                                        Interface
                                    </h3>
                                    <div className={rowClass}>
                                        <span className="text-zinc-100">Mostrar histórico do chat</span>
                                        <SettingsSwitch
                                            checked={showChatVisualization}
                                            onCheckedChange={setShowChatVisualization}
                                            ariaLabel="Mostrar histórico do chat (a barra de mensagem permanece)"
                                        />
                                    </div>
                                </section>
                            </div>

                            <div className="flex flex-col gap-4 xl:h-full xl:min-h-0 xl:gap-4">
                                <section
                                    className={`flex min-h-0 flex-col p-5 sm:p-6 xl:min-h-[12rem] xl:flex-1 ${panelClass}`}
                                >
                                    <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
                                        <h3 className={`${sectionTitleClass} mb-0`}>
                                            <AppWindow className="h-3.5 w-3.5" strokeWidth={2} />
                                            Apps abertos pela voz
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={refreshCatalog}
                                            disabled={catalogRefreshing}
                                            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                                            title="Recarregar lista do arquivo JSON"
                                        >
                                            <RefreshCw className={`h-3.5 w-3.5 ${catalogRefreshing ? 'animate-spin' : ''}`} />
                                            Atualizar
                                        </button>
                                    </div>
                                    <p className="mb-4 shrink-0 text-xs leading-relaxed text-zinc-400 sm:text-sm">
                                        Cadastre executáveis na lista branca. A assistente usa o campo{' '}
                                        <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-zinc-200">id</code> ao
                                        abrir (ex.: “abre o bloco de notas”).
                                    </p>

                                    <div className="mb-4 shrink-0 space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4">
                                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200/90">
                                            <FolderOpen className="h-3.5 w-3.5" strokeWidth={2} />
                                            Adicionar app (arquivo)
                                        </div>
                                        {typeof pickExecutable === 'function' ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={pickAndFill}
                                                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-500/20"
                                                    style={{ WebkitAppRegion: 'no-drag' }}
                                                >
                                                    <FolderOpen className="h-4 w-4" />
                                                    Procurar executável no PC…
                                                </button>
                                                {addDraftPath ? (
                                                    <div className="space-y-3 border-t border-white/10 pt-3">
                                                        <div className="break-all font-mono text-[10px] leading-snug text-zinc-400">
                                                            {addDraftPath}
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400">
                                                                id (comando de voz){' '}
                                                                <span className="font-normal normal-case text-zinc-500">
                                                                    — opcional; vazio = gerar automaticamente
                                                                </span>
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={addDraftId}
                                                                onChange={(e) => setAddDraftId(e.target.value)}
                                                                placeholder="ex.: chrome, vscode"
                                                                className={fieldClass}
                                                                autoComplete="off"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400">
                                                                Nome exibido
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={addDraftLabel}
                                                                onChange={(e) => setAddDraftLabel(e.target.value)}
                                                                className={fieldClass}
                                                                autoComplete="off"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-400">
                                                                Descrição (opcional)
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={addDraftDesc}
                                                                onChange={(e) => setAddDraftDesc(e.target.value)}
                                                                className={fieldClass}
                                                                autoComplete="off"
                                                            />
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                disabled={addSaving}
                                                                onClick={submitAddLaunchApp}
                                                                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-zinc-100 transition-colors hover:bg-white/15 disabled:opacity-40"
                                                                style={{ WebkitAppRegion: 'no-drag' }}
                                                            >
                                                                {addSaving ? 'Salvando…' : 'Adicionar à lista'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={clearAddDraft}
                                                                className="rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
                                                                style={{ WebkitAppRegion: 'no-drag' }}
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : (
                                            <p className="text-[11px] leading-relaxed text-zinc-400">
                                                Abra o OrbitalSync pelo app <strong className="text-zinc-400">desktop</strong> para
                                                usar o seletor de arquivos do Windows. No navegador (só front), edite o JSON
                                                manualmente abaixo.
                                            </p>
                                        )}
                                        {addFeedback ? (
                                            <p
                                                className={`text-xs ${addFeedback.ok ? 'text-emerald-300' : 'text-rose-300'}`}
                                                role="status"
                                            >
                                                {addFeedback.message}
                                            </p>
                                        ) : null}
                                    </div>

                                    {launchAppsConfigPath && (
                                        <div className="mb-4 shrink-0 rounded-xl border border-white/10 bg-black/30 p-3 sm:p-4">
                                            <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-400">
                                                <FileJson className="h-3 w-3" />
                                                Arquivo de configuração
                                            </div>
                                            <div className="flex items-start gap-2">
                                                <code className="flex-1 break-all font-mono text-[11px] leading-snug text-zinc-300 sm:text-xs">
                                                    {launchAppsConfigPath}
                                                </code>
                                                <button
                                                    type="button"
                                                    onClick={copyConfigPath}
                                                    className="shrink-0 rounded-lg border border-white/10 p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
                                                    title="Copiar caminho"
                                                >
                                                    {pathCopied ? (
                                                        <Check className="h-4 w-4 text-emerald-400" />
                                                    ) : (
                                                        <Copy className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                            <p className="mt-3 text-[11px] text-zinc-400">
                                                Edite e salve o JSON; depois clique em{' '}
                                                <strong className="text-zinc-400">Atualizar</strong>.
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                                        {launchAppCatalog.length === 0 ? (
                                            <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-xs text-amber-100/90 sm:text-sm">
                                                Nenhum app na lista. Use <strong className="text-amber-200/80">Procurar executável</strong>{' '}
                                                acima ou edite{' '}
                                                <code className="text-amber-200/90">launch_apps.json</code>.
                                            </div>
                                        ) : (
                                            launchAppCatalog.map((app) => (
                                                <div
                                                    key={app.id}
                                                    className="rounded-xl border border-white/10 bg-black/35 px-4 py-3 transition-colors hover:border-white/20"
                                                >
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-zinc-200">
                                                            {app.id}
                                                        </span>
                                                        {app.label ? (
                                                            <span className="text-sm font-medium text-zinc-200">{app.label}</span>
                                                        ) : null}
                                                    </div>
                                                    {app.description ? (
                                                        <p className="mt-2 text-xs leading-relaxed text-zinc-400">{app.description}</p>
                                                    ) : null}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </section>

                                <section
                                    className={`flex min-h-0 flex-col p-5 sm:p-6 xl:min-h-[12rem] xl:flex-1 ${panelClass}`}
                                >
                                    <h3 className={sectionTitleClass}>
                                        <Wrench className="h-3.5 w-3.5" strokeWidth={2} />
                                        Confirmação de ferramentas
                                    </h3>
                                    <p className="mb-3 shrink-0 text-xs leading-relaxed text-zinc-400">
                                        Ligado = pede aprovação antes da ação. Desligado = execução direta.
                                    </p>
                                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                                        {TOOLS.map((tool) => {
                                            const isRequired = permissions[tool.id] !== false;
                                            return (
                                                <div key={tool.id} className={rowClass}>
                                                    <span className="text-sm leading-tight text-zinc-100">{tool.label}</span>
                                                    <SettingsSwitch
                                                        checked={isRequired}
                                                        onCheckedChange={(v) => togglePermission(tool.id, v)}
                                                        ariaLabel={`Confirmação: ${tool.label}`}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(ui, document.body);
};

export default React.memo(SettingsWindow);
