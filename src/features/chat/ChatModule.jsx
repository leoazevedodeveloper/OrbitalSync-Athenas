import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Bot, Send, Sparkles, UserRound, ImagePlus, X } from 'lucide-react';

/** Quicksand (font-sans) em negrito — legível sobre fundo preto. */
const chatFont = 'font-sans font-bold antialiased';
const MAX_RENDER_MESSAGES = 220;

const ChatModule = ({
    messages,
    inputValue,
    setInputValue,
    handleSend,
    chatImageAttachment = null,
    onChatImageAttachmentChange,
    status,
    isConnected,
    isMuted,
    currentProject,
    isModularMode,
    activeDragElement,
    position: _position,
    width: _width,
    height: _height,
    /** pixels — alinha bolhas da ATHENAS à esquerda (borda) */
    messagesLeftInset = 14,
    /** pixels — margem mínima da borda direita */
    messagesRightInset = 14,
    isImageGenerating = false,
    imageGeneratingCaption,
    onMouseDown,
    /** Se false, oculta bolhas/histórico; barra de digitar e cabeçalho ATHENAS permanecem. */
    showMessageTranscript = true
}) => {
    const fileInputRef = useRef(null);
    const chatTextareaRef = useRef(null);
    const messagesEndRef = useRef(null);
    const [imageModal, setImageModal] = React.useState(null); // { mimeType, data?, url?, caption }

    const mimeTypeToExt = (mimeType) => {
        const mt = String(mimeType || '').toLowerCase();
        if (mt.includes('png')) return 'png';
        if (mt.includes('jpeg') || mt.includes('jpg')) return 'jpg';
        if (mt.includes('webp')) return 'webp';
        return 'png';
    };

    const imageMessageSrc = (img, mimeType) => {
        if (!img) return '';
        if (img.url) return img.url;
        const mt = img.mime_type || img.mimeType || mimeType || 'image/png';
        if (img.data) return `data:${mt};base64,${img.data}`;
        return '';
    };

    /**
     * Redimensiona e exporta JPEG para caber no limite do Socket.IO (antes ~1MB no Engine.IO).
     * Mantém preview nítido até maxSide px no maior lado.
     */
    const buildChatAttachmentFromFile = (file) =>
        new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                try {
                    URL.revokeObjectURL(url);
                    const maxSide = 1600;
                    let w = img.naturalWidth || img.width;
                    let h = img.naturalHeight || img.height;
                    if (!w || !h) throw new Error('dim');
                    const scale = Math.min(1, maxSide / Math.max(w, h));
                    w = Math.max(1, Math.round(w * scale));
                    h = Math.max(1, Math.round(h * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('ctx');
                    ctx.drawImage(img, 0, 0, w, h);
                    const quality = 0.86;
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    const comma = dataUrl.indexOf(',');
                    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
                    resolve({
                        b64,
                        mime: 'image/jpeg',
                        preview: dataUrl,
                        name: file.name || 'imagem.jpg',
                    });
                } catch (e) {
                    reject(e);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('load'));
            };
            img.src = url;
        });

    const handleSaveImage = async () => {
        if (!imageModal?.data && !imageModal?.url) return;
        const mimeType = imageModal.mimeType || 'image/png';
        const ext = mimeTypeToExt(mimeType);
        const filename = `imagem_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;

        try {
            let blob;
            if (imageModal.url) {
                const res = await fetch(imageModal.url);
                if (!res.ok) throw new Error('fetch');
                blob = await res.blob();
            } else {
                const dataUrl = `data:${mimeType};base64,${imageModal.data}`;
                const res = await fetch(dataUrl);
                blob = await res.blob();
            }
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            console.error('Falha ao salvar imagem:', e);
            alert('Falha ao salvar a imagem. Verifique permissões/ambiente.');
        }
    };

    const renderedMessages =
        messages.length > MAX_RENDER_MESSAGES ? messages.slice(-MAX_RENDER_MESSAGES) : messages;

    /** Inclui crescimento do último balão (streaming) — antes só reagia à contagem de mensagens. */
    const scrollSignature = useMemo(() => {
        if (!messages.length) return '0';
        const last = messages[messages.length - 1];
        return `${messages.length}:${String(last?.text || '').length}`;
    }, [messages]);

    useLayoutEffect(() => {
        if (!showMessageTranscript) return;
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }, [scrollSignature, showMessageTranscript]);

    const adjustChatTextareaHeight = () => {
        const el = chatTextareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
    };

    useEffect(() => {
        adjustChatTextareaHeight();
    }, [inputValue]);

    const sendFromButton = () => {
        if (!inputValue.trim() && !chatImageAttachment) return;
        handleSend({ key: 'Enter' });
    };

    const onPickImage = (ev) => {
        const f = ev.target.files?.[0];
        ev.target.value = '';
        if (!f?.type?.startsWith('image/')) return;
        buildChatAttachmentFromFile(f)
            .then((att) => onChatImageAttachmentChange?.(att))
            .catch(() => {
                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = String(reader.result || '');
                    const comma = dataUrl.indexOf(',');
                    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
                    const head = comma >= 0 ? dataUrl.slice(0, comma) : '';
                    const mime = head.match(/data:([^;]+)/)?.[1] || f.type || 'image/jpeg';
                    onChatImageAttachmentChange?.({ b64, mime, preview: dataUrl, name: f.name });
                };
                reader.readAsDataURL(f);
            });
    };

    /** Print / captura colada com Ctrl+V no campo de chat */
    const attachImageFromClipboardBlob = (blob, suggestedName = 'colagem.png') => {
        if (!blob?.type?.startsWith('image/')) return;
        const ext = mimeTypeToExt(blob.type || 'image/png');
        const name =
            blob instanceof File && blob.name
                ? blob.name
                : `print_${Date.now()}.${ext}`;
        let file;
        try {
            file = blob instanceof File ? blob : new File([blob], name, { type: blob.type || 'image/png' });
        } catch {
            file = null;
        }
        const fallbackDataUrl = () => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = String(reader.result || '');
                const comma = dataUrl.indexOf(',');
                const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
                const head = comma >= 0 ? dataUrl.slice(0, comma) : '';
                const mime = head.match(/data:([^;]+)/)?.[1] || blob.type || 'image/png';
                onChatImageAttachmentChange?.({ b64, mime, preview: dataUrl, name });
            };
            reader.readAsDataURL(blob);
        };
        if (file) {
            buildChatAttachmentFromFile(file)
                .then((att) => onChatImageAttachmentChange?.({ ...att, name: att.name || name }))
                .catch(fallbackDataUrl);
        } else {
            fallbackDataUrl();
        }
    };

    const onChatPaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items?.length) return;
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.kind === 'file' && it.type.startsWith('image/')) {
                const blob = it.getAsFile();
                if (blob) {
                    e.preventDefault();
                    attachImageFromClipboardBlob(blob);
                }
                return;
            }
        }
    };

    const statusLabel = !isConnected ? 'Offline' : isMuted ? 'Conectado (Mudo)' : 'Ativo por Voz';
    const leftInset = Number(messagesLeftInset) || 14;
    const rightInset = Number(messagesRightInset) || 14;
    const messageMotionStyle = (msg) => {
        const id = String(msg?.id || '');
        if (!id || id.startsWith('history-')) return undefined;
        return { animation: 'chatBubbleEnter 180ms cubic-bezier(0.2, 0.75, 0.25, 1) both' };
    };

    return (
        <>
            <style>{`
                @keyframes chatBubbleEnter {
                    0% { opacity: 0; transform: translateY(7px) scale(0.992); filter: blur(0.4px); }
                    100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
                }
            `}</style>
            {/* Mensagens em toda a largura: ATHENAS à esquerda, tu à direita */}
            {showMessageTranscript ? (
            <div
                id="chat"
                onMouseDown={onMouseDown}
                className={`fixed left-0 right-0 z-[30] pointer-events-none transition-all duration-300 top-14 sm:top-16 bottom-[13.5rem] sm:bottom-[14rem] ${
                    activeDragElement === 'chat' ? 'ring-2 ring-inset ring-white/15' : ''
                }`}
            >
                <div
                    className="h-full overflow-y-auto overflow-x-hidden pt-3 pb-6 custom-scrollbar pointer-events-auto"
                    style={{ paddingLeft: leftInset, paddingRight: rightInset }}
                >
                <div className="flex flex-col gap-5">
                {renderedMessages.map((msg, i) => {
                    const snd = msg.sender?.toLowerCase() || '';
                    const isAssistant =
                        snd.includes('athenas') || snd.includes('ada') || snd.includes('jarvis');
                    const isSystem = snd.includes('system');
                    const isUser = !isAssistant && !isSystem;

                    if (msg?.image?.data || msg?.image?.url) {
                        const mimeType = msg?.image?.mime_type || msg?.image?.mimeType || 'image/png';
                        const thumbSrc = imageMessageSrc(msg.image, mimeType);
                        const rowAlign = isSystem
                            ? 'justify-center px-2'
                            : isUser
                              ? 'justify-end'
                              : 'justify-start';
                        const capAlign = isUser ? 'text-right' : isSystem ? 'text-center' : 'text-left';
                        const openModal = (e) => {
                            if (e) {
                                e.stopPropagation();
                                e.preventDefault();
                            }
                            setImageModal({
                                mimeType,
                                data: msg.image.data,
                                url: msg.image.url,
                                caption: msg.text || 'Imagem gerada'
                            });
                        };
                        return (
                            <div
                                key={msg.id || `img-${i}`}
                                className={`flex w-full ${rowAlign}`}
                                style={messageMotionStyle(msg)}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={openModal}
                                onPointerUp={openModal}
                            >
                                <div
                                    className={`flex min-w-0 max-w-[min(100%,26rem)] flex-col ${
                                        isUser ? 'items-end' : 'items-start'
                                    }`}
                                >
                                    {(isAssistant || isUser) && (
                                        <div
                                            className={`mb-2.5 flex items-center gap-2 px-1 ${chatFont} ${
                                                isUser ? 'flex-row-reverse' : 'flex-row'
                                            }`}
                                        >
                                            {isUser ? (
                                                <UserRound size={13} className="text-emerald-300/90 shrink-0" strokeWidth={2.5} />
                                            ) : (
                                                <Bot size={13} className="text-cyan-300 shrink-0" strokeWidth={2.5} />
                                            )}
                                            <span
                                                className={`text-[11px] uppercase tracking-[0.14em] ${
                                                    isUser ? 'text-emerald-200/95' : 'text-cyan-200/95'
                                                }`}
                                            >
                                                {msg.sender}
                                            </span>
                                            <span className="text-[10px] tracking-wide text-zinc-300 tabular-nums">
                                                {msg.time}
                                            </span>
                                        </div>
                                    )}
                                    <div
                                        className={`w-full min-w-0 max-w-full rounded-2xl p-2.5 shadow-lg ring-1 ${
                                            isUser
                                                ? 'rounded-tr-none border border-white/20 bg-zinc-100 ring-white/10'
                                                : isAssistant
                                                  ? 'rounded-tl-none border border-cyan-500/25 bg-gradient-to-br from-zinc-800/95 via-zinc-900/95 to-black/90 ring-cyan-500/10'
                                                  : 'border border-white/10 bg-zinc-900/90 ring-white/5'
                                        }`}
                                    >
                                        {msg.text ? (
                                            <div
                                                className={`${chatFont} mb-2 whitespace-pre-wrap break-words px-2 text-[15px] leading-snug sm:text-base ${
                                                    isUser ? 'text-zinc-950' : 'text-zinc-50'
                                                } ${capAlign}`}
                                            >
                                                {msg.text}
                                            </div>
                                        ) : null}
                                        <img
                                            src={thumbSrc}
                                            alt="Imagem gerada"
                                            className="max-h-[min(55vh,420px)] max-w-full rounded-xl border border-white/10 object-contain shadow-[0_10px_30px_rgba(0,0,0,0.35)] cursor-zoom-in"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                            }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onTouchStart={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (isSystem) {
                        return (
                            <div
                                key={msg.id || `sys-${i}`}
                                className="flex justify-center px-2"
                                style={messageMotionStyle(msg)}
                            >
                                <span
                                    className={`${chatFont} max-w-[min(100%,28rem)] whitespace-pre-wrap break-words text-center rounded-full border border-white/20 bg-white/[0.08] px-4 py-1.5 text-[10px] uppercase tracking-[0.16em] text-zinc-200 shadow-[0_4px_20px_rgba(0,0,0,0.35)]`}
                                >
                                    {msg.text}
                                </span>
                            </div>
                        );
                    }

                    const rowAlign = isUser ? 'justify-end' : 'justify-start';

                    return (
                        <div
                            key={msg.id || `msg-${i}`}
                            className={`w-full flex ${rowAlign}`}
                            style={messageMotionStyle(msg)}
                        >
                            <div
                                className={`flex min-w-0 max-w-[min(100%,26rem)] flex-col ${
                                    isUser ? 'items-end text-right' : 'items-start text-left'
                                }`}
                            >
                                <div
                                    className={`mb-2.5 flex items-center gap-2 px-1 ${chatFont} ${
                                        isUser ? 'flex-row-reverse' : 'flex-row'
                                    }`}
                                >
                                    {isUser ? (
                                        <UserRound size={13} className="text-emerald-300/90 shrink-0" strokeWidth={2.5} />
                                    ) : (
                                        <Bot size={13} className="text-cyan-300 shrink-0" strokeWidth={2.5} />
                                    )}
                                    <span
                                        className={`text-[11px] uppercase tracking-[0.14em] ${
                                            isUser ? 'text-emerald-200/95' : 'text-cyan-200/95'
                                        }`}
                                    >
                                        {msg.sender}
                                    </span>
                                    <span className="text-[10px] tracking-wide text-zinc-300 tabular-nums">
                                        {msg.time}
                                    </span>
                                </div>
                                <div
                                    className={`${chatFont} w-full min-w-0 max-w-full whitespace-pre-wrap break-words px-4 py-3.5 text-[15px] leading-snug sm:text-base transition-all shadow-lg ring-1
                                    ${
                                        isUser
                                            ? 'rounded-2xl rounded-tr-none border border-white/20 bg-zinc-100 text-zinc-950 ring-white/10'
                                            : 'rounded-2xl rounded-tl-none border border-cyan-500/25 bg-gradient-to-br from-zinc-800/95 via-zinc-900/95 to-black/90 text-zinc-50 ring-cyan-500/10'
                                    }`}
                                >
                                    {msg.text}
                                </div>
                            </div>
                        </div>
                    );
                })}
                    <div ref={messagesEndRef} className="h-0 shrink-0" aria-hidden />
                </div>
                </div>
            </div>
            ) : null}

            {isImageGenerating && (
                <div className="fixed inset-0 z-[45] flex items-center justify-center pointer-events-none bg-black/20">
                    <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/55 px-8 py-6 backdrop-blur-md shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
                        <div className="relative w-20 h-20 rounded-full bg-white/5 border border-white/10 shadow-[0_0_70px_rgba(255,255,255,0.10)] flex items-center justify-center">
                            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.18),transparent_60%)] animate-pulse" />
                            <div className="absolute inset-0 rounded-full border border-white/20 animate-ping" />
                            <div className="relative w-14 h-14 rounded-full border border-white/30 border-t-white/80 animate-spin" />
                        </div>
                        <div className={`text-center ${chatFont}`}>
                            <div className="text-xs uppercase tracking-[0.14em] text-zinc-100">
                                Gerando imagem...
                            </div>
                            <div className="text-[11px] text-zinc-400 max-w-[260px] mt-1.5 leading-snug">
                                {imageGeneratingCaption || 'Aguarde um instante.'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Cabeçalho + input: centro inferior (acima da toolbar de ferramentas) */}
            <div className="fixed bottom-6 left-1/2 z-[40] flex w-full max-w-2xl -translate-x-1/2 flex-col items-stretch gap-2 px-3 sm:px-4 pointer-events-none">
                <div className="w-full pointer-events-auto rounded-2xl border border-white/15 bg-black/65 px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl ring-1 ring-white/5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
                                <Bot size={18} strokeWidth={2.25} />
                            </div>
                            <div className={`min-w-0 ${chatFont}`}>
                                <p className="text-[12px] uppercase tracking-[0.16em] text-zinc-100 truncate">
                                    ATHENAS
                                </p>
                                <p className="text-[11px] text-zinc-400 truncate">
                                    {statusLabel} • {status || 'Aguardando'}
                                </p>
                            </div>
                        </div>
                        <div
                            className={`hidden shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-zinc-200 sm:flex ${chatFont}`}
                        >
                            <Sparkles size={12} className="text-cyan-300/90" />
                            {currentProject || 'Sem Projeto'}
                        </div>
                    </div>
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickImage}
                />
                {chatImageAttachment?.preview ? (
                    <div className="flex w-full items-center gap-2 rounded-xl border border-white/15 bg-black/60 px-2 py-1.5 shadow-lg backdrop-blur-md pointer-events-auto">
                        <img
                            src={chatImageAttachment.preview}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover border border-white/10"
                        />
                        <span className={`min-w-0 flex-1 truncate text-[11px] text-zinc-300 ${chatFont}`}>
                            {chatImageAttachment.name || 'Imagem'} — a IA vai ler e responder
                        </span>
                        <button
                            type="button"
                            onClick={() => onChatImageAttachmentChange?.(null)}
                            className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                            title="Remover imagem"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ) : null}
                <div className="flex w-full items-end gap-2 rounded-2xl border border-white/15 bg-black/75 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl pointer-events-auto ring-1 ring-white/5">
                    <textarea
                        ref={chatTextareaRef}
                        rows={1}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleSend}
                        onPaste={onChatPaste}
                        placeholder="Mensagem… Enter envia · Shift+Enter nova linha · Ctrl+V imagem"
                        className={`min-h-[44px] max-h-[168px] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-transparent bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-zinc-50 outline-none transition-all placeholder:text-zinc-500 placeholder:font-bold focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20 ${chatFont}`}
                    />
                    <div className="flex shrink-0 gap-1 pb-0.5">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition-all hover:bg-white/10 hover:text-zinc-100"
                            title="Anexar imagem para a IA ler"
                        >
                            <ImagePlus size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={sendFromButton}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!inputValue.trim() && !chatImageAttachment}
                            title="Enviar"
                        >
                            <Send size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {isModularMode && (
                <div
                    className={`fixed top-16 left-3 z-[35] rounded-xl border border-white/10 px-3 py-1 text-[9px] font-bold tracking-[0.2em] uppercase backdrop-blur-xl bg-black/50 pointer-events-none ${
                        activeDragElement === 'chat' ? 'text-zinc-100' : 'text-zinc-600'
                    }`}
                >
                    CHAT_MODULE_V2
                </div>
            )}

            {imageModal && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setImageModal(null)}
                >
                    <div
                        className="w-[min(96vw,1400px)] h-[min(92vh,900px)] rounded-2xl border border-white/10 bg-black/55 shadow-[0_30px_120px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
                            <div className={`min-w-0 flex-1 ${chatFont}`}>
                                <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-400 truncate">
                                    Imagem gerada
                                </p>
                                <p className="text-[13px] text-zinc-100 truncate">
                                    {imageModal.caption || 'Imagem gerada'}
                                </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleSaveImage}
                                    className="rounded-lg bg-zinc-100 text-zinc-900 text-xs px-3 py-2 hover:bg-white transition-colors"
                                >
                                    Salvar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setImageModal(null)}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
                                >
                                    <X size={14} aria-hidden />
                                    Fechar
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden">
                            <img
                                src={
                                    imageModal.url
                                        ? imageModal.url
                                        : `data:${imageModal.mimeType};base64,${imageModal.data}`
                                }
                                alt="Imagem gerada em tela cheia"
                                className="max-h-full max-w-full object-contain rounded-xl border border-white/10 shadow-[0_15px_70px_rgba(0,0,0,0.55)]"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

function areChatPropsEqual(prev, next) {
    return (
        prev.messages === next.messages &&
        prev.inputValue === next.inputValue &&
        prev.chatImageAttachment === next.chatImageAttachment &&
        prev.status === next.status &&
        prev.isConnected === next.isConnected &&
        prev.isMuted === next.isMuted &&
        prev.currentProject === next.currentProject &&
        prev.isModularMode === next.isModularMode &&
        prev.activeDragElement === next.activeDragElement &&
        prev.messagesLeftInset === next.messagesLeftInset &&
        prev.messagesRightInset === next.messagesRightInset &&
        prev.isImageGenerating === next.isImageGenerating &&
        prev.imageGeneratingCaption === next.imageGeneratingCaption &&
        prev.showMessageTranscript === next.showMessageTranscript
    );
}

export default React.memo(ChatModule, areChatPropsEqual);
