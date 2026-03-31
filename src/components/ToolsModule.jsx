import React from 'react';
import { Mic, MicOff, Settings, Power, Video, VideoOff, Hand } from 'lucide-react';

const iconSize = 17;
const stroke = 1.35;

const ToolsModule = ({
    isConnected,
    isMuted,
    isVideoOn,
    isHandTrackingEnabled,
    showSettings,
    onTogglePower,
    onToggleMute,
    onToggleVideo,
    onToggleSettings,
    onToggleHand,
    activeDragElement: _activeDragElement,
    position,
    onMouseDown
}) => {
    const base =
        'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-out outline-none focus-visible:ring-1 focus-visible:ring-white/20';

    const idle = `${base} text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.07]`;

    return (
        <div
            id="tools"
            onMouseDown={onMouseDown}
            className={`fixed z-[38] pointer-events-none transition-opacity duration-300 ${
                _activeDragElement === 'tools' ? 'opacity-100' : ''
            }`}
            style={{
                left: position.x,
                bottom: position.y,
            }}
            aria-label="Controles ATHENAS · OrbitalSync"
        >
            <div
                className={`pointer-events-auto flex flex-row items-center gap-0.5 rounded-full border border-white/[0.08] bg-zinc-950/35 px-1 py-1 shadow-[0_4px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl ${
                    _activeDragElement === 'tools' ? 'ring-1 ring-white/12' : ''
                }`}
            >
                <button
                    type="button"
                    onClick={onTogglePower}
                    title={isConnected ? 'Desligar sessão' : 'Ligar sessão'}
                    className={`${base} ${
                        isConnected
                            ? 'text-emerald-300/95 hover:bg-emerald-400/[0.1]'
                            : idle
                    }`}
                >
                    <span
                        className={`pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 ${
                            isConnected ? 'opacity-100 bg-emerald-400/[0.08]' : ''
                        }`}
                    />
                    <Power size={iconSize} strokeWidth={stroke} className="relative z-[1]" />
                </button>

                <span className="mx-0.5 h-4 w-px bg-white/[0.06]" aria-hidden />

                <button
                    type="button"
                    onClick={onToggleMute}
                    disabled={!isConnected}
                    title={isMuted ? 'Ativar microfone' : 'Silenciar'}
                    className={`${base} ${
                        !isConnected
                            ? 'cursor-not-allowed text-zinc-700 opacity-50'
                            : isMuted
                              ? 'text-rose-300/90 bg-rose-500/[0.08] hover:bg-rose-500/[0.12]'
                              : idle
                    }`}
                >
                    {isMuted ? (
                        <MicOff size={iconSize} strokeWidth={stroke} />
                    ) : (
                        <Mic size={iconSize} strokeWidth={stroke} />
                    )}
                </button>

                <button
                    type="button"
                    onClick={onToggleVideo}
                    title={isVideoOn ? 'Desligar câmera' : 'Ligar câmera'}
                    className={`${base} ${
                        isVideoOn
                            ? 'text-indigo-200/95 bg-indigo-500/[0.1] hover:bg-indigo-500/[0.14]'
                            : idle
                    }`}
                >
                    {isVideoOn ? (
                        <Video size={iconSize} strokeWidth={stroke} />
                    ) : (
                        <VideoOff size={iconSize} strokeWidth={stroke} />
                    )}
                </button>

                <button
                    type="button"
                    onClick={onToggleSettings}
                    title="Configurações"
                    className={`${base} ${
                        showSettings
                            ? 'text-zinc-100 bg-white/[0.1] border border-white/10'
                            : idle
                    }`}
                >
                    <Settings size={iconSize} strokeWidth={stroke} />
                </button>

                <button
                    type="button"
                    onClick={onToggleHand}
                    title={isHandTrackingEnabled ? 'Desativar gestos' : 'Ativar gestos'}
                    className={`${base} ${
                        isHandTrackingEnabled
                            ? 'text-amber-200/90 bg-amber-400/[0.09] hover:bg-amber-400/[0.13]'
                            : idle
                    }`}
                >
                    <Hand size={iconSize} strokeWidth={stroke} />
                </button>
            </div>
        </div>
    );
};

export default ToolsModule;
