import React, { useEffect, useRef } from 'react';

const Visualizer = ({
    audioData,
    /** Espectro TTS da IA por ref (mutável). Se definido, substitui `audioData` nas bandas da orb. */
    aiAudioSpectrumRef = null,
    userAudioData,
    /** Quando definido, o espectro do microfone vem deste ref (mutável) — evita re-render da App a 60 Hz. */
    userAudioSpectrumRef = null,
    isListening,
    isInitializing = false,
    intensity = 0,
    micMuted = false,
    width = 600,
    height = 400,
}) => {
    const canvasRef = useRef(null);
    const audioDataRef = useRef(audioData);
    const userAudioDataRef = useRef(userAudioData);
    const isListeningRef = useRef(isListening);
    const isInitializingRef = useRef(isInitializing);
    const intensityRef = useRef(intensity);
    const micMutedRef = useRef(micMuted);
    const particlesRef = useRef([]);

    useEffect(() => {
        if (!aiAudioSpectrumRef) {
            audioDataRef.current = audioData;
        }
        if (!userAudioSpectrumRef) {
            userAudioDataRef.current = userAudioData;
        }
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

    // Initialize particles
    useEffect(() => {
        const particles = [];
        const count = 480;
        for (let i = 0; i < count; i++) {
            particles.push({
                angle: Math.random() * Math.PI * 2,
                radius: Math.random() * 170 + 55,
                baseRadius: Math.random() * 170 + 55,
                speed: 0.15 + Math.random() * 0.45,
                size: Math.random() * 2.5 + 0.5,
                noise: Math.random() * 100,
                opacity: 0.15 + Math.random() * 0.6,
                z: Math.random() * 1,
            });
        }
        particlesRef.current = particles;
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        let animationId;
        const particles = particlesRef.current;
        let smoothAvg = 0;
        let smoothTone = 0;
        let smoothRipple = 0;
        let smoothListeningGain = 1;
        let prevAiEnergy = 0;

        const getBandEnergy = (arr, startRatio, endRatio) => {
            if (!arr || arr.length === 0) return 0;
            const start = Math.max(0, Math.floor(arr.length * startRatio));
            const end = Math.max(start + 1, Math.floor(arr.length * endRatio));
            let sum = 0;
            for (let i = start; i < end; i++) sum += arr[i] || 0;
            return (sum / (end - start)) / 255;
        };

        const draw = () => {
            const w = canvas.width;
            const h = canvas.height;
            const cx = w / 2;
            const cy = h / 2;
            const maxVisualRadius = Math.max(20, (Math.min(w, h) / 2) - 10);

            const genBoost = Math.min(Math.max(Number(intensityRef.current) || 0, 0), 1);
            const genIsActive = genBoost > 0.01;
            const micMutedNow = micMutedRef.current;

            // Fundo opaco — se usar só clearRect, o canvas fica transparente no “buraco” do anel
            // e o gradiente do App aparece por baixo (parece um vulto/sombra sob a orb).
            ctx.fillStyle = '#020202';
            ctx.fillRect(0, 0, w, h);

            // Frequency-aware energy: boosts speech presence and highlights AI high frequencies.
            const aiBands = aiAudioSpectrumRef ? aiAudioSpectrumRef.current : audioDataRef.current;
            const aiLow = getBandEnergy(aiBands, 0.0, 0.33);
            const aiMid = getBandEnergy(aiBands, 0.33, 0.66);
            const aiHigh = getBandEnergy(aiBands, 0.66, 1.0);
            const aiEnergyRaw = (aiLow * 0.4) + (aiMid * 0.82) + (aiHigh * 1.05);
            const aiEnergy = Math.min(aiEnergyRaw * 0.9, 0.72);

            const userBands = userAudioSpectrumRef ? userAudioSpectrumRef.current : userAudioDataRef.current;
            const userLow = getBandEnergy(userBands, 0.0, 0.33);
            const userMid = getBandEnergy(userBands, 0.33, 0.66);
            const userHigh = getBandEnergy(userBands, 0.66, 1.0);
            const userEnergy = ((userLow * 0.4) + (userMid * 1.15) + (userHigh * 1.25)) * 1.35;

            const aiDelta = Math.abs(aiEnergy - prevAiEnergy);
            prevAiEnergy = aiEnergy;
            const aiSpectralSpread = Math.abs(aiHigh - aiMid) + Math.abs(aiMid - aiLow);

            const aiIsActive = aiEnergy > 0.1 || aiMid > 0.1 || aiHigh > 0.11;
            const userIsActive = userEnergy > 0.11;
            const isAiPause = !userIsActive && !(aiIsActive || genIsActive);

            let targetAvg = Math.max(aiEnergy, userEnergy);
            const listeningTargetGain = isListeningRef.current ? 1 : 0.22;
            smoothListeningGain += (listeningTargetGain - smoothListeningGain) * 0.08;
            targetAvg *= smoothListeningGain;

            const boot = isInitializingRef.current;
            let initBoost = 0;
            if (boot) {
                const t = Date.now() * 0.001;
                // Pulso orgânico + “respiração” lenta (orb viva antes do primeiro áudio)
                initBoost =
                    0.18 +
                    Math.sin(t * 1.15) * 0.1 +
                    Math.sin(t * 2.8 + 0.7) * 0.06 +
                    Math.sin(t * 4.2) * 0.03;
                targetAvg = Math.min(targetAvg + initBoost, 0.62);
            }

            // Se o microfone estiver desligado, mantemos uma “presença” mínima
            // para a orb vermelha continuar visível mesmo com baixo avg.
            if (micMutedNow && !boot) {
                targetAvg = Math.max(targetAvg, 0.10);
            }

            // Boost the orb animation while image generation is running (audio may be idle).
            if (genIsActive) {
                targetAvg = Math.min(targetAvg + (genBoost * 0.45), 0.72);
            }

            // During short AI pauses, keep some inertia so the orb does not collapse abruptly.
            if (isAiPause) {
                targetAvg *= 0.72;
                targetAvg = Math.max(targetAvg, smoothAvg * 0.78);
            }

            // Soft silence floor prevents abrupt collapse at phrase boundaries.
            if (targetAvg < 0.045) {
                targetAvg = isAiPause
                    ? Math.max(targetAvg, smoothAvg * 0.9)
                    : targetAvg * 0.55;
            }

            // Tonal movement accentuates treble peaks during AI responses.
            const toneBase = Math.min(Math.max(0, aiHigh - aiLow * 0.62), 0.22);
            const toneTarget = Math.min(toneBase + (genBoost * 0.10), 0.22);
            const toneSmoothing = toneTarget > smoothTone ? 0.14 : (isAiPause ? 0.24 : 0.2);
            smoothTone += (toneTarget - smoothTone) * toneSmoothing;

            // Fast ripple keeps visible undulation during continuous AI speech.
            const rippleBase = aiIsActive
                ? Math.min(0.28, (aiDelta * 1.7) + (aiSpectralSpread * 0.65) + (aiHigh * 0.2))
                : 0;
            const rippleTarget = Math.min(0.33, rippleBase + (genIsActive ? genBoost * 0.22 : 0));
            const rippleSmoothing = rippleTarget > smoothRipple ? 0.34 : 0.22;
            smoothRipple += (rippleTarget - smoothRipple) * rippleSmoothing;

            // Asymmetric Smoothing - Cresce rápido quando há áudio, desce lentamente quando acaba
            // Quando cresce (targetAvg > smoothAvg): faster response (0.25)
            // Quando desce (targetAvg < smoothAvg): slower decay (0.04)
            const smoothing = targetAvg > smoothAvg ? 0.18 : (isAiPause ? 0.09 : 0.06);
            smoothAvg += (targetAvg - smoothAvg) * smoothing;
            const avg = smoothAvg;
            const tone = smoothTone;
            const ripple = smoothRipple;

            // Core Glow (Removed as per user request for a cleaner background)
            /*
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
            grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
            */

            // Update & Draw Particles
            const spinMul = boot ? 1.85 + initBoost * 2.2 : 1;
            particles.forEach((p, i) => {
                p.angle += (p.speed * 0.015) * spinMul * (1 + avg * 5 + ripple * 2.1);
                p.noise += boot ? 0.016 : 0.01;

                // Organic Spherical Expansion - Crescimento suave e contido
                const idlePulse = Math.sin(Date.now() / (boot ? 900 : 1500) + i) * (boot ? 16 : 10);
                const noiseFactor = Math.sin(p.noise + i) * (10 + avg * 26 + tone * 12 + ripple * 16);
                const dynamicRadiusRaw = (p.baseRadius * (0.92 + avg * 1.02)) + noiseFactor + idlePulse;
                const dynamicRadius = Math.min(dynamicRadiusRaw, maxVisualRadius - 6);

                // 3D-ish projection
                const x = cx + Math.cos(p.angle) * dynamicRadius;
                const y = cy + Math.sin(p.angle) * dynamicRadius;

                // Render particle - crescimento mais equilibrado
                const pSize = p.size * (0.86 + avg * 2.0 + tone * 0.7 + ripple * 0.9);
                const pOpacity = Math.min(1, p.opacity * (0.45 + avg * 0.52 + tone * 0.16 + ripple * 0.2));

                ctx.beginPath();
                ctx.arc(x, y, pSize, 0, Math.PI * 2);
                // Modo inicialização: paleta OrbitalSync (branco/zinc + glow esmeralda)
                if (boot) {
                    const br = 246 + p.z * 10;
                    const bgCol = 248 + p.z * 7;
                    const bb = 252;
                    ctx.fillStyle = `rgba(${br}, ${bgCol}, ${bb}, ${pOpacity})`;
                } else {
                    if (micMutedNow) {
                        // Mic off -> orb vermelha (indicador visual)
                        ctx.fillStyle = `rgba(244, 63, 94, ${pOpacity})`; // rose-500
                    } else {
                        ctx.fillStyle = `rgba(255, 255, 255, ${pOpacity})`;
                    }
                }

                // Sem shadowBlur: o brilho branco se acumula entre partículas e forma um "vulto"/mancha
                // ovalada abaixo do anel (artefato típico de canvas 2D com muitos glows sobrepostos).
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';

                ctx.fill();

                // Raios do centro: podem somar alpha e parecer mancha clara — só no boot.
                if (boot && i % 38 === 0) {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(x, y);
                    const lineA = 0.06 + initBoost * 0.12;
                    ctx.strokeStyle = `rgba(255, 255, 255, ${lineA * 0.85})`;
                    ctx.stroke();
                }
            });

            if (boot) {
                const t = Date.now() * 0.001;
                const rings = 3;
                for (let r = 0; r < rings; r += 1) {
                    const phase = t * (0.55 + r * 0.22) + r * 1.7;
                    const rad = maxVisualRadius * (0.38 + r * 0.14) + Math.sin(phase * 2) * 6;
                    const alpha = 0.05 + Math.sin(phase) * 0.04 + initBoost * 0.08;
                    ctx.beginPath();
                    ctx.arc(cx, cy, rad, phase, phase + Math.PI * 1.85);
                    ctx.strokeStyle = `rgba(74, 222, 128, ${Math.min(0.38, Math.max(0.06, alpha))})`;
                    ctx.lineWidth = 1.25;
                    ctx.stroke();
                }
            }

            // Outer ethereal ring - expansion moderada
            animationId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animationId);
    }, [width, height]);

    return (
        <div className="relative rounded-none bg-[#020202]" style={{ width, height }}>
            <canvas
                ref={canvasRef}
                className="block h-full w-full"
            />
        </div>
    );
};

export default Visualizer;
