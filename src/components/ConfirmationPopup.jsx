import React from 'react';

const ConfirmationPopup = ({ request, onConfirm, onDeny }) => {
    if (!request) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-lg p-8 bg-black/90 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-2xl transform transition-all scale-100">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none mix-blend-overlay rounded-3xl"></div>

                {/* Header with Icon */}
                <div className="flex items-center gap-4 mb-6 relative z-10">
                    <div className="p-3 rounded-full bg-white/5 border border-white/10 text-white shadow-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-zinc-100 tracking-wider font-sans drop-shadow-sm">
                            AUTHORIZATION REQUIRED
                        </h2>
                        <p className="text-[10px] text-zinc-500 font-sans tracking-widest uppercase">
                            AI Logic Core Request
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="mb-8 space-y-4 relative z-10">
                    <p className="text-gray-300 leading-relaxed text-sm">
                        The system is requesting permission to execute an autonomous function. Please review the parameters below.
                    </p>

                    <div className="space-y-2">
                        <div className="bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden">
                            <div className="bg-white/5 px-4 py-2 border-b border-white/5 flex justify-between items-center">
                                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Function</span>
                                <span className="text-[10px] text-zinc-600 font-mono">system.call</span>
                            </div>
                            <div className="p-4">
                                <div className="text-zinc-100 font-mono text-lg font-medium">{request.tool}</div>
                            </div>
                        </div>

                        <div className="bg-zinc-900/50 border border-white/5 rounded-xl overflow-hidden">
                            <div className="bg-white/5 px-4 py-2 border-b border-white/5 flex justify-between items-center">
                                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Parameters</span>
                                <span className="text-[10px] text-zinc-600 font-mono">json.payload</span>
                            </div>
                            <div className="p-4 bg-black/20">
                                <pre className="text-xs text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                    {JSON.stringify(request.args, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4 relative z-10">
                    <button
                        onClick={onDeny}
                        className="flex-1 px-4 py-3.5 rounded-xl border border-red-500/30 bg-red-950/40 text-red-400 hover:bg-red-900/60 hover:border-red-500 hover:text-red-300 transition-all duration-200 font-bold tracking-wider uppercase text-xs"
                    >
                        Deny Request
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 px-4 py-3.5 rounded-xl border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all duration-200 font-bold tracking-wider uppercase text-xs relative overflow-hidden group shadow-lg"
                    >
                        <span className="relative z-10">Authorize Execution</span>
                        <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationPopup;
