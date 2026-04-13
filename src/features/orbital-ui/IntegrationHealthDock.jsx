import React from 'react';
import { Database, Sparkles, Webhook } from 'lucide-react';

const iconSize = 16;
const stroke = 1.35;

/**
 * Indicadores compactos alinhados ao ToolsModule (canto inferior direito).
 * Verde = tier "up"; vermelho = down/degraded ou erro; cinza = ainda sem teste.
 */
function IntegrationHealthDock({ health, onOpenSettings }) {
    const base =
        'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-out outline-none';

    const tone = (tier) => {
        if (tier === 'up') {
            return {
                wrap: `${base} text-emerald-300/95`,
                glow: 'opacity-100 bg-emerald-400/[0.12]',
                title: 'Conexão OK (último teste automático)',
            };
        }
        if (tier === 'pending') {
            return {
                wrap: `${base} text-zinc-500`,
                glow: 'opacity-0',
                title: 'A aguardar primeiro teste de conexão…',
            };
        }
        /* down, degraded ou desconhecido → vermelho */
        return {
            wrap: `${base} text-rose-300/90`,
            glow: 'opacity-100 bg-rose-500/[0.12]',
            title:
                tier === 'degraded'
                    ? 'Parcial / aviso no último teste — ver detalhes em Configurações'
                    : 'Sem resposta ou erro no último teste — ver Configurações',
        };
    };

    const row = (key, Icon, label) => {
        const t = tone(health?.[key]?.tier ?? 'pending');
        return (
            <button
                key={key}
                type="button"
                onClick={onOpenSettings}
                title={`${label}: ${t.title}`}
                className={`${t.wrap} hover:bg-white/[0.06] focus-visible:ring-1 focus-visible:ring-white/20`}
            >
                <span
                    className={`pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300 ${t.glow}`}
                />
                <Icon size={iconSize} strokeWidth={stroke} className="relative z-[1]" />
            </button>
        );
    };

    return (
        <div
            className="fixed z-[38] pointer-events-none transition-opacity duration-300"
            style={{ right: 20, bottom: 28 }}
            aria-label="Estado das integrações (teste a cada minuto)"
        >
            <div className="pointer-events-auto flex flex-row items-center gap-0.5 rounded-full border border-white/[0.08] bg-zinc-950/35 px-1 py-1 shadow-[0_4px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl">
                {row('supabase', Database, 'Supabase')}
                <span className="mx-0.5 h-4 w-px bg-white/[0.06]" aria-hidden />
                {row('comfyui', Sparkles, 'ComfyUI')}
                <span className="mx-0.5 h-4 w-px bg-white/[0.06]" aria-hidden />
                {row('webhooks', Webhook, 'n8n / webhooks')}
            </div>
        </div>
    );
}

export default IntegrationHealthDock;
