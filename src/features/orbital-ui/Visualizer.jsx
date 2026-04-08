import React, { useEffect, useRef, useMemo } from 'react';

const Visualizer = ({
    audioData,
    aiAudioSpectrumRef = null,
    userAudioData,
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

    const particles = useMemo(() => {
        const pts = [];
        const N_CLOUD = 4500;
        for (let i = 0; i < N_CLOUD; i++) {
            const u = Math.random(), v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            const rFrac = Math.pow(Math.random(), 0.65);
            pts.push({
                theta, phi, rFrac,
                size: 0.3 + Math.random() * 1.1,
                bright: Math.random(),
                speed: 0.2 + Math.random() * 0.6,
                layer: 0,
            });
        }
        const N_RINGS = 6;
        const DOTS_PER_RING = 480;
        for (let ring = 0; ring < N_RINGS; ring++) {
            const tiltA = (ring * 0.55) + Math.random() * 0.35;
            const tiltB = (ring * 0.40) + Math.random() * 0.55;
            const rBase = 0.75 + ring * 0.055;
            for (let j = 0; j < DOTS_PER_RING; j++) {
                const angle = (j / DOTS_PER_RING) * Math.PI * 2;
                pts.push({
                    ringAngle: angle,
                    ringIdx: ring,
                    tiltA, tiltB,
                    rBase,
                    size: 0.25 + Math.random() * 0.85,
                    bright: 0.5 + Math.random() * 0.5,
                    speed: 0.35 + Math.random() * 0.4 + ring * 0.07,
                    layer: 1,
                });
            }
        }
        return pts;
    }, []);

    useEffect(() => {
        if (!aiAudioSpectrumRef) audioDataRef.current = audioData;
        if (!userAudioSpectrumRef) userAudioDataRef.current = userAudioData;
    }, [audioData, userAudioData, userAudioSpectrumRef, aiAudioSpectrumRef]);

    useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
    useEffect(() => { intensityRef.current = intensity; }, [intensity]);
    useEffect(() => { isInitializingRef.current = isInitializing; }, [isInitializing]);
    useEffect(() => { micMutedRef.current = micMuted; }, [micMuted]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        let animId;
        let smoothAvg = 0;
        let smoothTone = 0;
        let smoothRipple = 0;
        let smoothListeningGain = 1;
        let prevAiEnergy = 0;
        let globalRot = 0;

        const getBandEnergy = (arr, sR, eR) => {
            if (!arr || !arr.length) return 0;
            const si = Math.max(0, Math.floor(arr.length * sR));
            const ei = Math.max(si + 1, Math.floor(arr.length * eR));
            let sum = 0;
            for (let i = si; i < ei; i++) sum += arr[i] || 0;
            return (sum / (ei - si)) / 255;
        };

        const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
        const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

        const draw = () => {
            const w = canvas.width;
            const h = canvas.height;
            const cx = w / 2;
            const cy = h / 2;
            const baseR = Math.min(w, h) * 0.32;
            const focalLen = 480;
            const t = Date.now() * 0.001;

            const genBoost = clamp(Number(intensityRef.current) || 0);
            const genActive = genBoost > 0.01;
            const muted = micMutedRef.current;
            const boot = isInitializingRef.current;

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);

            const aiBands = aiAudioSpectrumRef ? aiAudioSpectrumRef.current : audioDataRef.current;
            const aiLow = getBandEnergy(aiBands, 0, 0.33);
            const aiMid = getBandEnergy(aiBands, 0.33, 0.66);
            const aiHigh = getBandEnergy(aiBands, 0.66, 1);
            const aiEnergy = Math.min((aiLow * 0.4 + aiMid * 0.82 + aiHigh * 1.05) * 0.9, 0.72);

            const userBands = userAudioSpectrumRef ? userAudioSpectrumRef.current : userAudioDataRef.current;
            const userLow = getBandEnergy(userBands, 0, 0.33);
            const userMid = getBandEnergy(userBands, 0.33, 0.66);
            const userHigh = getBandEnergy(userBands, 0.66, 1);
            const userEnergy = (userLow * 0.4 + userMid * 1.15 + userHigh * 1.25) * 1.35;

            const aiDelta = Math.abs(aiEnergy - prevAiEnergy);
            prevAiEnergy = aiEnergy;
            const aiSpread = Math.abs(aiHigh - aiMid) + Math.abs(aiMid - aiLow);
            const aiActive = aiEnergy > 0.1 || aiMid > 0.1 || aiHigh > 0.11;
            const userActive = userEnergy > 0.11;
            const aiPause = !userActive && !(aiActive || genActive);

            let targetAvg = Math.max(aiEnergy, userEnergy);
            const listenTarget = isListeningRef.current ? 1 : 0.22;
            smoothListeningGain += (listenTarget - smoothListeningGain) * 0.08;
            targetAvg *= smoothListeningGain;

            let initBoost = 0;
            if (boot) {
                initBoost = 0.18 + Math.sin(t * 1.15) * 0.1 + Math.sin(t * 2.8 + 0.7) * 0.06 + Math.sin(t * 4.2) * 0.03;
                targetAvg = Math.min(targetAvg + initBoost, 0.62);
            }
            if (muted && !boot) targetAvg = Math.max(targetAvg, 0.10);
            if (genActive) targetAvg = Math.min(targetAvg + genBoost * 0.45, 0.72);
            if (aiPause) { targetAvg *= 0.72; targetAvg = Math.max(targetAvg, smoothAvg * 0.78); }
            if (targetAvg < 0.045) {
                targetAvg = aiPause ? Math.max(targetAvg, smoothAvg * 0.9) : targetAvg * 0.55;
            }

            const toneBase = clamp(aiHigh - aiLow * 0.62, 0, 0.22);
            const toneTarget = Math.min(toneBase + genBoost * 0.1, 0.22);
            smoothTone += (toneTarget - smoothTone) * (toneTarget > smoothTone ? 0.14 : aiPause ? 0.24 : 0.2);

            const ripBase = aiActive ? Math.min(0.28, aiDelta * 1.7 + aiSpread * 0.65 + aiHigh * 0.2) : 0;
            const ripTarget = Math.min(0.33, ripBase + (genActive ? genBoost * 0.22 : 0));
            smoothRipple += (ripTarget - smoothRipple) * (ripTarget > smoothRipple ? 0.34 : 0.22);

            const smF = targetAvg > smoothAvg ? 0.18 : aiPause ? 0.09 : 0.06;
            smoothAvg += (targetAvg - smoothAvg) * smF;

            const avg = smoothAvg;
            const tone = smoothTone;
            const ripple = smoothRipple;

            // Tiny core glow — density of particles does the heavy lifting
            const coreR = baseR * (0.18 + avg * 0.08);
            const coreA = boot ? 0.03 + initBoost * 0.02 : muted ? 0.015 : 0.012 + avg * 0.025;
            const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
            if (muted && !boot) {
                g1.addColorStop(0, `rgba(255, 120, 140, ${coreA})`);
            } else if (boot) {
                g1.addColorStop(0, `rgba(100, 220, 170, ${coreA})`);
            } else {
                g1.addColorStop(0, `rgba(180, 215, 255, ${coreA})`);
            }
            g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g1;
            ctx.fillRect(0, 0, w, h);

            // Rotation
            const rotSpeed = boot ? 0.006 + initBoost * 0.008 : 0.003 * (1 + avg * 5 + ripple * 3);
            globalRot += rotSpeed;
            const tiltX = Math.sin(t * 0.18) * (0.35 + avg * 0.15);
            const tiltZ = Math.sin(t * 0.12 + 1.2) * 0.1;

            const breathe = boot
                ? 1 + Math.sin(t * 1.4) * 0.07 + initBoost * 0.12
                : 1 + avg * 0.22 + Math.sin(t * 0.6) * 0.03;
            const sR = baseR * breathe;

            const cosRY = Math.cos(globalRot), sinRY = Math.sin(globalRot);
            const cosRX = Math.cos(tiltX), sinRX = Math.sin(tiltX);
            const cosRZ = Math.cos(tiltZ), sinRZ = Math.sin(tiltZ);

            const rot3d = (x, y, z) => {
                let x1 = x * cosRY - z * sinRY;
                let z1 = x * sinRY + z * cosRY;
                let y1 = y * cosRX - z1 * sinRX;
                let z2 = y * sinRX + z1 * cosRX;
                let x2 = x1 * cosRZ - y1 * sinRZ;
                let y2 = x1 * sinRZ + y1 * cosRZ;
                return [x2, y2, z2];
            };

            const project = (x, y, z) => {
                const sc = focalLen / (focalLen + z * sR);
                return [cx + x * sR * sc, cy + y * sR * sc, sc, (z + 1) * 0.5];
            };

            const colorForDepth = (depth01, pulse, isMuted, isBoot) => {
                let r, g, b;
                if (isBoot) {
                    r = clamp255(150 + depth01 * 70 + pulse * 40);
                    g = clamp255(220 + depth01 * 35 + pulse * 25);
                    b = clamp255(190 + depth01 * 40 + pulse * 20);
                } else if (isMuted) {
                    r = clamp255(210 + depth01 * 45 + pulse * 25);
                    g = clamp255(70 + depth01 * 50 + pulse * 35);
                    b = clamp255(90 + depth01 * 60 + pulse * 45);
                } else {
                    const mix = clamp(avg * 1.2 + tone);
                    r = clamp255(140 + depth01 * 65 + pulse * 55 + mix * 20);
                    g = clamp255(190 + depth01 * 50 + pulse * 40 + mix * 10);
                    b = clamp255(250 + depth01 * 5 + pulse * 5);
                    if (genBoost > 0.02) {
                        r = clamp255(r + genBoost * 30);
                        g = clamp255(g + genBoost * 18);
                    }
                }
                return [r, g, b];
            };

            // Collect all drawable items
            const items = [];

            // Cloud particles
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                if (p.layer !== 0) continue;

                const r = p.rFrac * (0.7 + avg * 0.5 + ripple * 0.2);
                const wobble = Math.sin(t * p.speed * 1.5 + p.theta * 3) * 0.04;
                const pR = (r + wobble) * sR / baseR;

                const x0 = Math.sin(p.phi) * Math.cos(p.theta + t * p.speed * 0.15) * pR;
                const y0 = Math.cos(p.phi) * pR;
                const z0 = Math.sin(p.phi) * Math.sin(p.theta + t * p.speed * 0.15) * pR;

                const [rx, ry, rz] = rot3d(x0, y0, z0);
                const [sx, sy, sc, d01] = project(rx, ry, rz);

                const distFromCenter = Math.sqrt(rx * rx + ry * ry + rz * rz);
                const coreBright = Math.max(0, 1 - distFromCenter * 1.8) * 0.4;

                const dotSz = p.size * sc * (0.45 + avg * 1.15 + coreBright * 1.6);
                const op = clamp(0.04 + d01 * 0.38 + avg * 0.18 + coreBright * 0.55 + p.bright * 0.14);

                items.push({ sx, sy, z: rz, dotSz, op, d01, pulse: coreBright, type: 'cloud' });
            }

            // Ring particles
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                if (p.layer !== 1) continue;

                const angle = p.ringAngle + t * p.speed * 0.4;
                const ringR = p.rBase + avg * 0.15 + Math.sin(t * 0.8 + p.ringIdx) * 0.04;
                const ringPulse = Math.sin(angle * 3 - t * 2.5 + p.ringIdx * 1.3) * 0.5 + 0.5;

                let x0 = Math.cos(angle) * ringR;
                let y0 = Math.sin(angle) * ringR;
                let z0 = 0;

                const ca = Math.cos(p.tiltA), sa = Math.sin(p.tiltA);
                let y1 = y0 * ca - z0 * sa;
                let z1 = y0 * sa + z0 * ca;

                const cb = Math.cos(p.tiltB), sb = Math.sin(p.tiltB);
                let x1 = x0 * cb - z1 * sb;
                let z2 = x0 * sb + z1 * cb;

                const [rx, ry, rz] = rot3d(x1, y1, z2);
                const [sx, sy, sc, d01] = project(rx, ry, rz);

                const energy = avg * 0.6 + ripple * 0.4 + tone * 0.2;
                const dotSz = p.size * sc * (0.4 + energy * 1.8 + ringPulse * 0.7);
                const op = clamp(0.035 + d01 * 0.38 + energy * 0.32 + ringPulse * 0.22);

                items.push({ sx, sy, z: rz, dotSz, op, d01, pulse: ringPulse * energy, type: 'ring', ringIdx: p.ringIdx });
            }

            items.sort((a, b) => a.z - b.z);

            // Draw
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                const [r, g, b] = colorForDepth(it.d01, it.pulse, muted, boot);

                if (it.pulse > 0.25 && it.d01 > 0.35) {
                    const hR = it.dotSz * (1.6 + it.pulse * 1.2);
                    const hA = it.op * 0.035 * (1 + it.pulse * 0.5);
                    ctx.beginPath();
                    ctx.arc(it.sx, it.sy, hR, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${hA})`;
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(it.sx, it.sy, Math.max(0.15, it.dotSz), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${it.op})`;
                ctx.fill();
            }

            // Sweeping arc highlights
            const arcCount = boot ? 3 : 5;
            for (let a = 0; a < arcCount; a++) {
                const phase = t * (0.3 + a * 0.12) + a * 1.4;
                const arcR = sR * (0.8 + a * 0.06) + Math.sin(phase * 1.5) * (3 + avg * 6);
                const sweep = Math.PI * (0.5 + avg * 0.4 + ripple * 0.2);
                const arcA = boot
                    ? 0.04 + Math.sin(phase) * 0.03 + initBoost * 0.06
                    : muted
                        ? 0.025 + avg * 0.04
                        : 0.02 + avg * 0.08 + tone * 0.03 + ripple * 0.03;

                ctx.beginPath();
                ctx.arc(cx, cy, arcR, phase, phase + sweep);
                ctx.strokeStyle = boot
                    ? `rgba(74, 222, 128, ${clamp(arcA, 0.03, 0.3)})`
                    : muted
                        ? `rgba(255, 170, 185, ${clamp(arcA, 0.02, 0.2)})`
                        : `rgba(160, 210, 255, ${clamp(arcA, 0.02, 0.22)})`;
                ctx.lineWidth = 0.6 + avg * 0.6;
                ctx.lineCap = 'round';
                ctx.stroke();
            }

            animId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animId);
    }, [width, height, particles]);

    return (
        <div
            className="relative overflow-hidden rounded-none border-0 bg-black outline-none"
            style={{ width, height }}
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
