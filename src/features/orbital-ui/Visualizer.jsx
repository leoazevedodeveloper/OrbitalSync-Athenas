import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { createOrb } from './orbThree';

function computeOrbState({
    isInitializing,
    isListening,
    micMuted,
    intensity,
    isAiSpeaking,
}) {
    if (isInitializing) return 'idle';
    const gen = Number(intensity) || 0;
    if (gen > 0.01) return 'thinking';
    if (isAiSpeaking) return 'speaking';
    if (isListening && !micMuted) return 'listening';
    return 'idle';
}

const Visualizer = ({
    audioData,
    aiAudioSpectrumRef = null,
    userAudioData,
    userAudioSpectrumRef = null,
    isListening,
    isInitializing = false,
    intensity = 0,
    micMuted = false,
    isAiSpeaking = false,
    /** Preenche o pai (ex.: viewport inteiro); sem dimensões fixas em px */
    fillScreen = false,
    width = 600,
    height = 400,
}) => {
    const canvasRef = useRef(null);
    const orbRef = useRef(null);
    const audioDataRef = useRef(audioData);
    const userAudioDataRef = useRef(userAudioData);
    const isListeningRef = useRef(isListening);
    const isInitializingRef = useRef(isInitializing);
    const intensityRef = useRef(intensity);
    const micMutedRef = useRef(micMuted);
    const isAiSpeakingRef = useRef(isAiSpeaking);

    const spectrumScratch = useMemo(() => new Uint8Array(64), []);

    useEffect(() => {
        if (!aiAudioSpectrumRef) audioDataRef.current = audioData;
        if (!userAudioSpectrumRef) userAudioDataRef.current = userAudioData;
    }, [audioData, userAudioData, userAudioSpectrumRef, aiAudioSpectrumRef]);

    useEffect(() => {
        isListeningRef.current = isListening;
    }, [isListening]);
    useEffect(() => {
        intensityRef.current = intensity;
    }, [intensity]);
    useEffect(() => {
        isInitializingRef.current = isInitializing;
    }, [isInitializing]);
    useEffect(() => {
        micMutedRef.current = micMuted;
    }, [micMuted]);
    useEffect(() => {
        isAiSpeakingRef.current = isAiSpeaking;
    }, [isAiSpeaking]);

    const getSpectrum = useCallback(() => {
        const ai = aiAudioSpectrumRef ? aiAudioSpectrumRef.current : audioDataRef.current;
        const mic = userAudioSpectrumRef ? userAudioSpectrumRef.current : userAudioDataRef.current;
        const buf = spectrumScratch;
        if ((!ai || !ai.length) && (!mic || !mic.length)) return null;
        for (let i = 0; i < buf.length; i++) {
            const a = ai?.[i] ?? 0;
            const m = mic?.[i] ?? 0;
            buf[i] = Math.max(a, m);
        }
        return buf;
    }, [aiAudioSpectrumRef, userAudioSpectrumRef, spectrumScratch]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const orb = createOrb(canvas, { getSpectrum });
        orbRef.current = orb;
        orb.setState(
            computeOrbState({
                isInitializing: isInitializingRef.current,
                isListening: isListeningRef.current,
                micMuted: micMutedRef.current,
                intensity: intensityRef.current,
                isAiSpeaking: isAiSpeakingRef.current,
            })
        );
        return () => {
            orb.destroy();
            orbRef.current = null;
        };
    }, [getSpectrum]);

    useEffect(() => {
        const orb = orbRef.current;
        if (!orb) return;
        orb.setState(
            computeOrbState({
                isInitializing,
                isListening,
                micMuted,
                intensity,
                isAiSpeaking,
            })
        );
    }, [isInitializing, isListening, micMuted, intensity, isAiSpeaking]);

    return (
        <div
            className={`overflow-hidden rounded-none border-0 bg-black outline-none ${
                fillScreen ? 'absolute inset-0 h-full w-full min-h-0 min-w-0' : 'relative'
            }`}
            style={fillScreen ? undefined : { width, height }}
        >
            <canvas
                ref={canvasRef}
                tabIndex={-1}
                className="block h-full max-h-full w-full max-w-full border-0 outline-none"
            />
        </div>
    );
};

export default Visualizer;
