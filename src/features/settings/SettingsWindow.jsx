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
    Smartphone,
    Star,
    Trash2,
    Plus,
    MessageCircle,
    QrCode,
    LogOut,
    Wifi,
    WifiOff,
} from 'lucide-react';
import { BACKEND_ORIGIN } from '../../constants/appConfig';

const TOOLS = [
    { id: 'create_directory', label: 'Criar pasta' },
    { id: 'write_file', label: 'Escrever arquivo' },
    { id: 'read_directory', label: 'Listar diretório' },
    { id: 'read_file', label: 'Ler arquivo' },
    { id: 'create_project', label: 'Criar projeto' },
    { id: 'switch_project', label: 'Trocar projeto' },
    { id: 'list_projects', label: 'Listar projetos' },
    { id: 'generate_image', label: 'Gerar imagem (Nano Banana 2)' },
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

/** Título dentro de um hub (sub-bloco) */
const subsectionTitleClass =
    'flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300/95 mb-3';

/**
 * Cartão de configurações no mesmo padrão visual do bloco «Cérebro · ATHENAS»:
 * gradiente, header com título + badge opcional + descrição, corpo com padding.
 */
function SettingsHubCard({
    icon: Icon,
    title,
    badge,
    description,
    gradientClass,
    children,
    headerRight,
    rootClassName = '',
    bodyClassName = 'px-4 py-4 sm:px-6 sm:py-5',
}) {
    return (
        <div className={`flex min-h-0 flex-col ${rootClassName}`.trim()}>
            <div
                className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br shadow-[0_16px_48px_rgba(0,0,0,0.35)] ${gradientClass}`}
            >
                <div className="border-b border-white/[0.06] bg-black/25 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <h3 className={`${sectionTitleClass} mb-0`}>
                                    <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                                    {title}
                                </h3>
                                {badge ? (
                                    <span className="inline-flex items-center rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-300/90">
                                        {badge}
                                    </span>
                                ) : null}
                            </div>
                            {description ? (
                                <p className="mt-3 max-w-2xl text-xs leading-relaxed text-zinc-400">{description}</p>
                            ) : null}
                        </div>
                        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
                    </div>
                </div>
                <div className={bodyClassName}>{children}</div>
            </div>
        </div>
    );
}

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
function IntegrationModalCard({ summary, credentials, modalTitle, modalSubtitle, expandMode = 'credentials', buttonLabel }) {
    const [open, setOpen] = useState(false);
    const isInfoOnly = expandMode === 'info';
    const btnLabel = buttonLabel || (isInfoOnly ? 'Como funcionam os webhooks' : 'Editar credenciais');

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
 * Memória & contexto — seção removida (legado Supabase chat embeddings).
 * Agora a memória é 100% vault Obsidian local + pgvector para RAG.
 */
function SemanticMemoryHubSection() {
    return null;
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
 * Núcleo (cérebro): Obsidian + Supabase + Gemini — não são integrações opcionais.
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
        integrations && meta ? [true, !!supabase?.configured, !!meta.gemini_configured].filter(Boolean).length : 0;

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
                                    {brainReadyCount}/3 núcleo
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-3 max-w-2xl text-xs leading-relaxed text-zinc-400">
                            O núcleo é composto por <strong className="font-medium text-zinc-300">Obsidian</strong>,{' '}
                            <strong className="font-medium text-zinc-300">Supabase</strong> e{' '}
                            <strong className="font-medium text-zinc-300">Gemini (ATHENAS)</strong>. Este bloco reúne o estado dos três e os
                            atalhos principais de operação. Credenciais continuam em{' '}
                            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-zinc-400">
                                data/local_credentials.json
                            </code>
                            ; o teste HTTP do Supabase permanece neste cartão e no botão «Testar ligações».
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
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
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

                            <IntegrationModalCard
                                modalTitle="Obsidian (Vault de memória)"
                                modalSubtitle="Vault local e override por .env"
                                buttonLabel="Ver caminhos"
                                summary={
                                    <>
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200">
                                                    <FolderOpen className="h-4 w-4" strokeWidth={2} />
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold leading-tight text-zinc-100">
                                                        Obsidian Vault
                                                    </div>
                                                    <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                                                        Memória local
                                                    </div>
                                                </div>
                                            </div>
                                            <IntegrationStatusPill active>
                                                Ativo
                                            </IntegrationStatusPill>
                                        </div>
                                        <p className="line-clamp-3 text-[11px] leading-relaxed text-zinc-400">
                                            Cérebro local da OrbitalSync. Caminho padrão no projeto:{' '}
                                            <code className="rounded bg-black/30 px-1 text-zinc-500">data/memory/OrbitalSync</code>.
                                        </p>
                                        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                                            Para trocar a pasta do vault, define{' '}
                                            <code className="rounded bg-black/30 px-1 text-zinc-400">ORBITAL_BRAIN_PATH</code> no{' '}
                                            <code className="text-zinc-400">.env</code>.
                                        </p>
                                    </>
                                }
                                credentials={
                                    <div className="flex flex-col gap-2.5 text-xs text-zinc-300">
                                        <p className="text-[11px] leading-relaxed text-zinc-400">
                                            <strong className="font-semibold text-zinc-200">Padrão do projeto</strong>
                                        </p>
                                        <code className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-[11px] text-zinc-200">
                                            data/memory/OrbitalSync
                                        </code>
                                        <p className="text-[11px] leading-relaxed text-zinc-400">
                                            <strong className="font-semibold text-zinc-200">Override opcional</strong> no{' '}
                                            <code className="text-zinc-300">.env</code>:
                                        </p>
                                        <code className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-[11px] text-zinc-200">
                                            ORBITAL_BRAIN_PATH=C:/caminho/para/seu/vault
                                        </code>
                                        <p className="text-[10px] leading-relaxed text-zinc-500">
                                            O backend usa esse valor no arranque; se não existir, cai automaticamente no caminho padrão do
                                            projeto.
                                        </p>
                                    </div>
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
 * Integrações opcionais: Nano Banana 2 (geração de imagem), n8n/webhooks.
 */
// ─────────────────────────────────────────────────────────────
// WhatsApp Section
// ─────────────────────────────────────────────────────────────

const EVOLUTION_BASE = 'http://localhost:8085';
const EVOLUTION_KEY = 'e49c9e30-b6b2-48f4-9781-b4e7093747a5';

function WhatsAppSection({ embedded = false }) {
    // Instances
    const [instances, setInstances] = useState([]);
    const [loadingInstances, setLoadingInstances] = useState(true);
    const [evolutionOk, setEvolutionOk] = useState(null);
    const [qrData, setQrData] = useState(null); // { instanceName, base64 }
    const [qrLoading, setQrLoading] = useState(null);
    const [newInstanceName, setNewInstanceName] = useState('');
    const [creatingInstance, setCreatingInstance] = useState(false);
    const [showNewInstance, setShowNewInstance] = useState(false);
    // Pending
    const [pending, setPending] = useState([]);
    const [loadingPending, setLoadingPending] = useState(true);
    const [clearing, setClearing] = useState(false);
    const [clearFeedback, setClearFeedback] = useState(null);
    // VIP
    const [vipContacts, setVipContacts] = useState([]);
    const [newVip, setNewVip] = useState({ name: '', phone: '', relation: '' });
    const [addingVip, setAddingVip] = useState(false);
    const [showAddVip, setShowAddVip] = useState(false);

    // ── Evolution API helpers ──────────────────────────────────────────────
    const evoFetch = useCallback(async (path, opts = {}) => {
        try {
            const res = await fetch(`${EVOLUTION_BASE}${path}`, {
                ...opts,
                headers: { apikey: EVOLUTION_KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) },
                signal: AbortSignal.timeout(8000),
            });
            return res.ok ? res.json() : null;
        } catch {
            return null;
        }
    }, []);

    const loadInstances = useCallback(async () => {
        setLoadingInstances(true);
        const data = await evoFetch('/instance/fetchInstances');
        if (Array.isArray(data)) {
            setInstances(data);
            setEvolutionOk(true);
        } else {
            setEvolutionOk(false);
            setInstances([]);
        }
        setLoadingInstances(false);
    }, [evoFetch]);

    const connectInstance = async (instanceName) => {
        setQrLoading(instanceName);
        setQrData(null);
        const data = await evoFetch(`/instance/connect/${instanceName}`);
        if (data?.base64) {
            setQrData({ instanceName, base64: data.base64 });
        } else if (data?.code) {
            // fallback: pairing code
            setQrData({ instanceName, base64: null, pairingCode: data.code });
        }
        setQrLoading(null);
    };

    const disconnectInstance = async (instanceName) => {
        await evoFetch(`/instance/logout/${instanceName}`, { method: 'DELETE' });
        await loadInstances();
    };

    const createInstance = async () => {
        if (!newInstanceName.trim()) return;
        setCreatingInstance(true);
        await evoFetch('/instance/create', {
            method: 'POST',
            body: JSON.stringify({ instanceName: newInstanceName.trim(), integration: 'WHATSAPP-BAILEYS' }),
        });
        setNewInstanceName('');
        setShowNewInstance(false);
        setCreatingInstance(false);
        await loadInstances();
    };

    // Poll connection state while QR modal is open
    useEffect(() => {
        if (!qrData) return;
        const interval = setInterval(async () => {
            const state = await evoFetch(`/instance/connectionState/${qrData.instanceName}`);
            if (state?.instance?.state === 'open') {
                setQrData(null);
                loadInstances();
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [qrData, evoFetch, loadInstances]);

    // ── Brain helpers ──────────────────────────────────────────────────────
    const brainFetch = useCallback(async (action, body) => {
        try {
            const res = await fetch(`${BACKEND_ORIGIN}/api/brain/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return res.ok ? res.json() : null;
        } catch {
            return null;
        }
    }, []);

    const loadPending = useCallback(async () => {
        setLoadingPending(true);
        const data = await brainFetch('read', { note: '06 - State/WhatsApp_pendente' });
        if (data?.content) {
            const lines = data.content.split('\n').filter(l => l.startsWith('- '));
            setPending(lines.map(l => l.replace(/^- /, '')));
        } else {
            setPending([]);
        }
        setLoadingPending(false);
    }, [brainFetch]);

    const loadVip = useCallback(async () => {
        const data = await brainFetch('read', { note: '05 - Integrations/WhatsApp' });
        if (!data?.content) return;
        const rows = data.content.split('\n').filter(l => l.startsWith('|') && !l.includes('---') && !l.toLowerCase().includes('nome'));
        setVipContacts(rows.map(row => {
            const cols = row.split('|').map(c => c.trim()).filter(Boolean);
            return { name: cols[0] || '', phone: cols[1] || '', relation: cols[2] || '' };
        }).filter(c => c.name && c.phone));
    }, [brainFetch]);

    useEffect(() => {
        loadInstances();
        loadPending();
        loadVip();
    }, [loadInstances, loadPending, loadVip]);

    const clearPending = async () => {
        setClearing(true);
        const marker = '## Mensagens não respondidas';
        const data = await brainFetch('read', { note: '06 - State/WhatsApp_pendente' });
        const current = typeof data?.content === 'string' ? data.content : '';
        const markerIdx = current.indexOf(marker);
        const lineEnd = markerIdx >= 0 ? current.indexOf('\n', markerIdx) : -1;

        let cleared;
        if (markerIdx >= 0) {
            const end = lineEnd >= 0 ? lineEnd + 1 : current.length;
            const prefix = current.slice(0, end).replace(/\s*$/, '\n');
            cleared = `${prefix}\n`;
        } else {
            cleared = `${marker}\n\n`;
        }

        await brainFetch('write', { note: '06 - State/WhatsApp_pendente', content: cleared, mode: 'overwrite' });
        setPending([]);
        setClearing(false);
        setClearFeedback('Pendentes limpas.');
        setTimeout(() => setClearFeedback(null), 3000);
    };

    const addVipContact = async () => {
        if (!newVip.name.trim() || !newVip.phone.trim()) return;
        setAddingVip(true);
        const line = `| ${newVip.name} | +${newVip.phone.replace(/^\+/, '')} | ${newVip.relation || '—'} | Tom prioritário. |\n`;
        await brainFetch('write', { note: '05 - Integrations/WhatsApp', content: line, mode: 'append' });
        setNewVip({ name: '', phone: '', relation: '' });
        setShowAddVip(false);
        setAddingVip(false);
        await loadVip();
    };

    // ── Helpers ────────────────────────────────────────────────────────────
    const stateColor = (s) => ({
        open:       'border-green-500/30 bg-green-950/20 text-green-300',
        connecting: 'border-yellow-500/30 bg-yellow-950/20 text-yellow-300',
        close:      'border-zinc-600/30 bg-zinc-900/40 text-zinc-500',
    }[s] ?? 'border-zinc-600/30 bg-zinc-900/40 text-zinc-500');

    const stateLabel = (s) => ({ open: 'Conectado', connecting: 'Conectando…', close: 'Desconectado' }[s] ?? s);

    const instanceState = (inst) =>
        inst.connectionStatus ?? inst.instance?.state ?? inst.state ?? 'close';

    const inner = (
        <>
            {/* QR Code modal */}
            {qrData && createPortal(
                <div
                    className="fixed inset-0 z-[400] flex items-center justify-center bg-black/75 backdrop-blur-sm"
                    onClick={() => setQrData(null)}
                >
                    <div
                        className="relative mx-4 w-full max-w-xs rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setQrData(null)}
                            className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            <X size={16} />
                        </button>
                        <h4 className="mb-1 text-sm font-bold text-zinc-100">Escanear QR Code</h4>
                        <p className="mb-4 text-[11px] text-zinc-400">
                            Instância: <span className="font-mono text-zinc-200">{qrData.instanceName}</span>
                        </p>
                        {qrData.base64 ? (
                            <div className="flex justify-center rounded-xl bg-white p-3">
                                <img src={qrData.base64} alt="QR Code WhatsApp" className="h-52 w-52 object-contain" />
                            </div>
                        ) : qrData.pairingCode ? (
                            <div className="flex justify-center rounded-xl border border-white/10 bg-black/40 p-4">
                                <span className="font-mono text-2xl font-bold tracking-widest text-green-300">{qrData.pairingCode}</span>
                            </div>
                        ) : (
                            <div className="flex h-52 items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
                            </div>
                        )}
                        <p className="mt-3 text-center text-[10px] text-zinc-500">
                            Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
                        </p>
                        <p className="mt-1 text-center text-[9px] text-zinc-600">
                            Aguardando conexão… fecha ao conectar automaticamente
                        </p>
                    </div>
                </div>,
                document.body
            )}

            <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-green-950/[0.16] via-zinc-950/50 to-black/80 shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
                {/* Header */}
                <div className="border-b border-white/[0.06] bg-black/25 px-4 py-4 sm:px-6 sm:py-5">
                    <div className="flex flex-wrap items-center gap-3">
                        <h3 className={`${sectionTitleClass} mb-0`}>
                            <Smartphone className="h-3.5 w-3.5" strokeWidth={2} />
                            WhatsApp
                        </h3>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${evolutionOk === true ? 'border-green-500/25 bg-black/40 text-green-200/85' : evolutionOk === false ? 'border-rose-500/25 bg-black/40 text-rose-200/85' : 'border-zinc-500/25 bg-black/40 text-zinc-400'}`}>
                            {evolutionOk === true ? <Wifi className="h-2.5 w-2.5" /> : evolutionOk === false ? <WifiOff className="h-2.5 w-2.5" /> : <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                            {evolutionOk === null ? 'verificando…' : evolutionOk ? 'Evolution API online' : 'Evolution API offline'}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                            <span className="font-mono text-zinc-400">:8085</span>
                        </span>
                        <button
                            onClick={loadInstances}
                            disabled={loadingInstances}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] text-zinc-300 transition-colors hover:bg-white/10 disabled:opacity-50"
                        >
                            <RefreshCw className={`h-3 w-3 ${loadingInstances ? 'animate-spin' : ''}`} />
                            Atualizar
                        </button>
                    </div>
                </div>

                {/* Instances panel */}
                <div className="border-b border-white/[0.05] px-4 py-4 sm:px-6 sm:py-5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h4 className={subsectionTitleClass}>
                            <Smartphone className="h-3.5 w-3.5" strokeWidth={2} />
                            Instâncias
                        </h4>
                        <button
                            onClick={() => setShowNewInstance(v => !v)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-950/20 px-2.5 py-1 text-[10px] font-bold text-green-200 transition-colors hover:bg-green-500/20"
                        >
                            <Plus className="h-3 w-3" />
                            Nova instância
                        </button>
                    </div>

                    {showNewInstance && (
                        <div className="mb-4 flex gap-2">
                            <input
                                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-green-500/40"
                                placeholder="Nome da instância (ex: Athenas-WPP)"
                                value={newInstanceName}
                                onChange={e => setNewInstanceName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && createInstance()}
                            />
                            <button
                                onClick={createInstance}
                                disabled={creatingInstance || !newInstanceName.trim()}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/15 px-3 py-1.5 text-[10px] font-bold text-green-100 disabled:opacity-50"
                            >
                                {creatingInstance ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                Criar
                            </button>
                        </div>
                    )}

                    {loadingInstances ? (
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando instâncias…
                        </div>
                    ) : instances.length === 0 ? (
                        <p className="text-[11px] text-zinc-500">
                            {evolutionOk === false ? 'Evolution API offline — verifique se está rodando em :8085.' : 'Nenhuma instância encontrada.'}
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {instances.map((inst) => {
                                const name = inst.name ?? inst.instanceName ?? '?';
                                const state = instanceState(inst);
                                const isConnected = state === 'open';
                                const loadingQr = qrLoading === name;
                                return (
                                    <div key={name} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2.5">
                                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                            <span className="truncate font-mono text-[11px] font-semibold text-zinc-100">{name}</span>
                                            <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${stateColor(state)}`}>
                                                {stateLabel(state)}
                                            </span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1.5">
                                            {!isConnected && (
                                                <button
                                                    onClick={() => connectInstance(name)}
                                                    disabled={loadingQr}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-950/20 px-2.5 py-1 text-[10px] font-bold text-green-200 transition-colors hover:bg-green-500/20 disabled:opacity-50"
                                                >
                                                    {loadingQr ? <Loader2 className="h-3 w-3 animate-spin" /> : <QrCode className="h-3 w-3" />}
                                                    Conectar
                                                </button>
                                            )}
                                            {isConnected && (
                                                <button
                                                    onClick={() => disconnectInstance(name)}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/20 px-2.5 py-1 text-[10px] font-bold text-rose-200 transition-colors hover:bg-rose-500/20"
                                                >
                                                    <LogOut className="h-3 w-3" />
                                                    Desconectar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Pending + VIP */}
                <div className="grid grid-cols-1 gap-0 divide-y divide-white/[0.05] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                    {/* Mensagens pendentes */}
                    <div className="px-4 py-4 sm:px-6 sm:py-5">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className={subsectionTitleClass}>
                                <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />
                                Mensagens pendentes
                                {pending.length > 0 && (
                                    <span className="ml-1 rounded-full bg-green-500/20 px-2 py-0.5 text-[9px] font-bold text-green-300">
                                        {pending.length}
                                    </span>
                                )}
                            </h4>
                            <div className="flex items-center gap-1.5">
                                <button onClick={loadPending} className="rounded-lg p-1 text-zinc-500 transition-colors hover:text-zinc-300">
                                    <RefreshCw className={`h-3 w-3 ${loadingPending ? 'animate-spin' : ''}`} />
                                </button>
                                {pending.length > 0 && (
                                    <button
                                        onClick={clearPending}
                                        disabled={clearing}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/20 px-2.5 py-1 text-[10px] font-bold text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                                    >
                                        {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                        Limpar
                                    </button>
                                )}
                            </div>
                        </div>
                        {clearFeedback && <p className="mb-2 text-[10px] text-green-400">{clearFeedback}</p>}
                        {loadingPending ? (
                            <p className="text-[11px] text-zinc-500">A carregar…</p>
                        ) : pending.length === 0 ? (
                            <p className="text-[11px] text-zinc-500">Nenhuma mensagem pendente.</p>
                        ) : (
                            <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                                {pending.map((msg, i) => {
                                    const match = msg.match(/^(.+?)\s*\|\s*(.+?)\s*\(([^)]+)\):\s*(.+)$/);
                                    const time = match?.[1] ?? '';
                                    const name = match?.[2] ?? '';
                                    const text = match?.[4] ?? msg;
                                    return (
                                        <li key={i} className="rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-2">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-[9px] text-zinc-500">{time}</span>
                                                <span className="text-[10px] font-semibold text-zinc-200">{name}</span>
                                            </div>
                                            <p className="mt-0.5 text-[10px] leading-snug text-zinc-400">{text}</p>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* Contatos VIP */}
                    <div className="px-4 py-4 sm:px-6 sm:py-5">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className={subsectionTitleClass}>
                                <Star className="h-3.5 w-3.5" strokeWidth={2} />
                                Contatos VIP
                            </h4>
                            <button
                                onClick={() => setShowAddVip(v => !v)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-950/20 px-2.5 py-1 text-[10px] font-bold text-green-200 transition-colors hover:bg-green-500/20"
                            >
                                <Plus className="h-3 w-3" />
                                Adicionar
                            </button>
                        </div>

                        {vipContacts.length === 0 ? (
                            <p className="text-[11px] text-zinc-500">Nenhum contato VIP configurado.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {vipContacts.map((c, i) => (
                                    <li key={i} className="rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-2">
                                        <span className="text-[10px] font-semibold text-zinc-100">{c.name}</span>
                                        {c.relation && <span className="ml-2 text-[9px] text-green-300/80">{c.relation}</span>}
                                        <p className="font-mono text-[9px] text-zinc-500">{c.phone}</p>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {showAddVip && (
                            <div className="mt-3 space-y-2 rounded-xl border border-white/[0.08] bg-black/30 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Novo contato VIP</p>
                                <input
                                    className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-green-500/40"
                                    placeholder="Nome"
                                    value={newVip.name}
                                    onChange={e => setNewVip(v => ({ ...v, name: e.target.value }))}
                                />
                                <input
                                    className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-green-500/40"
                                    placeholder="Número (ex: 5511999999999)"
                                    value={newVip.phone}
                                    onChange={e => setNewVip(v => ({ ...v, phone: e.target.value }))}
                                />
                                <input
                                    className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-[11px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-green-500/40"
                                    placeholder="Relação (ex: Namorada, Chefe…)"
                                    value={newVip.relation}
                                    onChange={e => setNewVip(v => ({ ...v, relation: e.target.value }))}
                                />
                                <button
                                    onClick={addVipContact}
                                    disabled={addingVip || !newVip.name.trim() || !newVip.phone.trim()}
                                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/15 px-3 py-1.5 text-[10px] font-bold text-green-100 transition-colors hover:bg-green-500/25 disabled:opacity-50"
                                >
                                    {addingVip ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                    Salvar
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );

    if (embedded) return inner;

    return <section className="mb-6 sm:mb-8">{inner}</section>;
}

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
    const n8n = integrations?.n8n;
    const meta = credentialsMeta;

    const integrationsReadyCount =
        integrations && meta
            ? [(n8n?.hooks_count ?? 0) > 0].filter(Boolean).length
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
                                        {integrationsReadyCount}/1 ligadas
                                    </span>
                                ) : null}
                            </div>
                            <p className="mt-3 max-w-2xl text-xs leading-relaxed text-zinc-400">
                                Serviços à volta do núcleo: imagens (Nano Banana 2 via Gemini API) e automações HTTP (n8n / webhooks).{' '}
                                <strong className="font-medium text-zinc-300">Testar ligações</strong> cobre Supabase
                                e webhooks (o Supabase também está no cérebro).
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

                            </div>
                        </>
                    )}
                </div>
                <WhatsAppSection embedded />
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
            title: 'Cérebro local (Obsidian)',
            icon: Brain,
            keys: [
                ['ORBITAL_BRAIN_PATH', 'Override da pasta do vault. Padrão: data/memory/OrbitalSync.'],
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
            title: 'Integrações',
            icon: Plug2,
            keys: [
                ['ATHENA_GOOGLE_CALENDAR_WEBHOOK_URL', 'Webhook padrão de calendário (opcional).'],
                ['ORBITAL_DISABLE_DEFAULT_CALENDAR_WEBHOOK', 'Desliga injeção do webhook padrão.'],
                ['ORBITAL_INTEGRATION_TEST_LOG', 'Logs extras no teste de integrações.'],
                ['ORBITAL_SKIP_WEBHOOK_POST_PROBE', 'Não faz POST de probe em /webhook/.'],
            ],
        },
        {
            title: 'Docker / extras',
            icon: FileText,
            keys: [
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
            className={`fixed inset-0 z-[250] flex h-[100dvh] w-full flex-col overflow-hidden border-0 bg-zinc-950 text-zinc-100 shadow-[inset_0_0_120px_rgba(0,0,0,0.35)] backdrop-blur-[0.5px] pointer-events-auto outline-none ring-0 ${settingsType}`}
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

            <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-white/15 bg-zinc-950 px-6 py-4 sm:px-10 sm:py-5">
                <div className="min-w-0 flex-1">
                    <h2
                        id="settings-title"
                        className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-50 sm:text-base"
                    >
                        Configurações
                    </h2>
                    <p className="mt-1 max-w-2xl text-xs text-zinc-400">
                        Áudio, câmera, cérebro (Supabase + Gemini), integrações (Nano Banana 2, n8n), apps e ATHENAS.
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
                        </BrainAndIntegrationsPanels>
                        <EnvReferenceSection />
                        <DotEnvFileSection socket={socket} />
                        <div className="grid min-h-0 grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8 xl:[grid-template-rows:1fr] xl:items-stretch">
                            <div className="flex flex-col gap-6 xl:h-full xl:min-h-0 xl:justify-start xl:py-1">
                                <SettingsHubCard
                                    icon={SlidersHorizontal}
                                    title="Sessão & dispositivos"
                                    badge="Local"
                                    description="Microfone, saída de áudio, câmera, cursor orbital e preferências de interface. Tudo corre neste PC — sem depender do Supabase."
                                    gradientClass="from-sky-950/[0.2] via-cyan-950/14 to-zinc-950/90"
                                >
                                    <div className="space-y-8">
                                        <div>
                                            <h4 className={subsectionTitleClass}>
                                                <Shield className="h-3.5 w-3.5" strokeWidth={2} />
                                                Segurança
                                            </h4>
                                            <div className={rowClass}>
                                                <span className="text-zinc-100">Autenticação facial</span>
                                                <SettingsSwitch
                                                    checked={faceAuthEnabled}
                                                    onCheckedChange={setFaceAuth}
                                                    ariaLabel="Alternar autenticação facial"
                                                />
                                            </div>
                                        </div>

                                        <div className="border-t border-white/[0.06] pt-8">
                                            <h4 className={subsectionTitleClass}>
                                                <Mic className="h-3.5 w-3.5" strokeWidth={2} />
                                                Áudio e câmera
                                            </h4>
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
                                        </div>

                                        <div className="border-t border-white/[0.06] pt-8">
                                            <h4 className={subsectionTitleClass}>
                                                <MousePointer2 className="h-3.5 w-3.5" strokeWidth={2} />
                                                Cursor
                                            </h4>
                                            <div className="mb-2 flex items-center justify-between">
                                                <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                                                    Sensibilidade
                                                </span>
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
                                        </div>

                                        <div className="border-t border-white/[0.06] pt-8">
                                            <h4 className={subsectionTitleClass}>
                                                <Hand className="h-3.5 w-3.5" strokeWidth={2} />
                                                Gestos
                                            </h4>
                                            <div className={rowClass}>
                                                <span className="text-zinc-100">Espelhar câmera (horizontal)</span>
                                                <SettingsSwitch
                                                    checked={isCameraFlipped}
                                                    onCheckedChange={setCameraFlip}
                                                    ariaLabel="Espelhar câmera"
                                                />
                                            </div>
                                        </div>

                                        <div className="border-t border-white/[0.06] pt-8">
                                            <h4 className={subsectionTitleClass}>
                                                <Palette className="h-3.5 w-3.5" strokeWidth={2} />
                                                Interface
                                            </h4>
                                            <div className={rowClass}>
                                                <span className="text-zinc-100">Mostrar histórico do chat</span>
                                                <SettingsSwitch
                                                    checked={showChatVisualization}
                                                    onCheckedChange={setShowChatVisualization}
                                                    ariaLabel="Mostrar histórico do chat (a barra de mensagem permanece)"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </SettingsHubCard>
                            </div>

                            <div className="flex flex-col gap-6 xl:h-full xl:min-h-0">
                                <SettingsHubCard
                                    icon={AppWindow}
                                    title="Apps abertos pela voz"
                                    badge={
                                        launchAppCatalog.length > 0
                                            ? `${launchAppCatalog.length} na lista`
                                            : 'Lista vazia'
                                    }
                                    description={
                                        <>
                                            Cadastre executáveis na lista branca. A assistente usa o campo{' '}
                                            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-zinc-200">
                                                id
                                            </code>{' '}
                                            ao abrir (ex.: “abre o bloco de notas”).
                                        </>
                                    }
                                    gradientClass="from-emerald-950/[0.2] via-teal-950/14 to-zinc-950/90"
                                    rootClassName="xl:min-h-0 xl:flex-1"
                                    bodyClassName="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5"
                                    headerRight={
                                        <button
                                            type="button"
                                            onClick={refreshCatalog}
                                            disabled={catalogRefreshing}
                                            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                                            title="Recarregar lista do arquivo JSON"
                                            style={{ WebkitAppRegion: 'no-drag' }}
                                        >
                                            <RefreshCw className={`h-3.5 w-3.5 ${catalogRefreshing ? 'animate-spin' : ''}`} />
                                            Atualizar
                                        </button>
                                    }
                                >
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
                                </SettingsHubCard>

                                <SettingsHubCard
                                    icon={Wrench}
                                    title="Confirmação de ferramentas"
                                    badge="Tools"
                                    description="Ligado = pede aprovação antes da ação. Desligado = execução direta."
                                    gradientClass="from-amber-950/[0.18] via-orange-950/12 to-zinc-950/90"
                                    rootClassName="xl:min-h-0 xl:flex-1"
                                    bodyClassName="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5"
                                >
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
                                </SettingsHubCard>
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
