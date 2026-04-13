/**
 * Orb 3D — partículas, linhas, "electrons" e núcleo luminoso.
 * Adaptado para OrbitalSync: tamanho pelo canvas, espectro opcional via getSpectrum().
 */

import * as THREE from 'three';

const CAMERA_BASE_Z = 122;
const LOOK_AT_Y = -8;

/** @typedef {'idle' | 'listening' | 'thinking' | 'speaking'} OrbState */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ getSpectrum?: () => (Uint8Array | number[] | null) | null }} [options]
 */
export function createOrb(canvas, options = {}) {
    let destroyed = false;
    const { getSpectrum } = options;
    const N = 3500;

    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
    });
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);

    const readSize = () => {
        const w = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || 300));
        const h = Math.max(1, Math.floor(canvas.clientHeight || canvas.height || 300));
        return { w, h };
    };

    const applySize = () => {
        const { w, h } = readSize();
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };

    const rendererSize = readSize();
    renderer.setPixelRatio(dpr);
    renderer.setSize(rendererSize.w, rendererSize.h, false);
    renderer.setClearColor(0x000000, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, rendererSize.w / rendererSize.h, 1, 1000);
    camera.position.z = CAMERA_BASE_Z;

    // ─── Particles ───────────────────────────────────────────

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    const phase = new Float32Array(N);

    for (let i = 0; i < N; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.pow(Math.random(), 0.45) * 25;
        const stretch = 0.8 + Math.random() * 0.4;
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta) * stretch;
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * (0.85 + Math.random() * 0.3);
        pos[i * 3 + 2] = r * Math.cos(phi) * stretch;
        phase[i] = Math.random() * 1000;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
        color: 0x4ca8e8,
        size: 0.4,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // ─── Lines ───────────────────────────────────────────────

    const MAX_LINES = 8000;
    const linePos = new Float32Array(MAX_LINES * 6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    lineGeo.setDrawRange(0, 0);

    const lineMat = new THREE.LineBasicMaterial({
        color: 0x4ca8e8,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const lines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lines);

    // ─── Electrons ───────────────────────────────────────────

    const MAX_ELECTRONS = 200;
    const electronGeo = new THREE.BufferGeometry();
    const electronPos = new Float32Array(MAX_ELECTRONS * 3);
    electronGeo.setAttribute('position', new THREE.BufferAttribute(electronPos, 3));
    electronGeo.setDrawRange(0, 0);

    const electronMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.8,
        transparent: true,
        opacity: 1.0,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const electrons = new THREE.Points(electronGeo, electronMat);
    scene.add(electrons);

    // ─── State & dynamics ────────────────────────────────────

    /** @type {{ sx: number; sy: number; sz: number; ex: number; ey: number; ez: number; t: number; speed: number }[]} */
    const activeElectrons = [];
    let electronSpawnRate = 0;
    let targetElectronRate = 0;
    let lastElectronSpawn = 0;

    /** @type {{ x1: number; y1: number; z1: number; x2: number; y2: number; z2: number }[]} */
    let activeConnections = [];

    /** @type {OrbState} */
    let state = 'idle';
    let targetRadius = 25;
    let currentRadius = 25;
    let targetSpeed = 0.3;
    let currentSpeed = 0.3;
    let targetBright = 0.6;
    let currentBright = 0.6;
    let targetSize = 0.4;
    let currentSize = 0.4;
    let lineAmount = 0;
    let targetLineAmount = 0;
    const lineDistance = 8;

    let spinX = 0;
    let spinY = 0;
    let spinZ = 0;
    let transitionEnergy = 0;
    /** @type {OrbState} */
    let lastState = 'idle';

    let cloudZ = 0;
    let cloudZVel = 0;

    let analyser = null;
    let freqData = new Uint8Array(64);
    let bass = 0;
    let mid = 0;
    let smoothBass = 0;
    let smoothMid = 0;
    let smoothTreble = 0;
    let audioEnergy = 0;

    let fastBass = 0;
    let fastMid = 0;
    let fastTreble = 0;
    let fastEnergy = 0;

    const _scratchColor = new THREE.Color();
    const _baseBlue = new THREE.Color(0x4ca8e8);
    const _thinkBlue = new THREE.Color(0x6ec4ff);

    const clock = new THREE.Clock();
    let elapsed = 0;

    const resizeObserver =
        typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => {
                  applySize();
              })
            : null;
    if (resizeObserver) resizeObserver.observe(canvas);
    const onWinResize = () => applySize();
    window.addEventListener('resize', onWinResize);

    function animate() {
        if (destroyed) return;
        requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        elapsed += dt;
        const t = elapsed;
        const frameFactor = Math.min(3, dt * 60);
        const lerpPerFrame = (rate) => 1 - Math.pow(1 - rate, frameFactor);
        const decayPerFrame = (rate) => Math.pow(rate, frameFactor);

        // ─── State targets ───────────────────────────────────

        switch (state) {
            case 'idle':
                targetRadius = 28;
                targetSpeed = 0.2;
                targetBright = 0.5;
                targetSize = 0.35;
                targetLineAmount = 0.15;
                targetElectronRate = 0;
                break;
            case 'listening':
                targetRadius = 22 + smoothBass * 3;
                targetSpeed = 0.3 + audioEnergy * 0.15;
                targetBright = 0.65 + audioEnergy * 0.1;
                targetSize = 0.4;
                targetLineAmount = 0.4 + audioEnergy * 0.2;
                targetElectronRate = 0;
                break;
            case 'thinking':
                targetRadius = 16;
                targetSpeed = 0.5;
                targetBright = 0.7;
                targetSize = 0.3;
                targetLineAmount = 1.0;
                targetElectronRate = 0.015;
                break;
            case 'speaking':
                targetRadius = 26;
                targetSpeed = 0.25 + audioEnergy * 0.2;
                targetBright = 0.6 + audioEnergy * 0.15;
                targetSize = 0.38;
                targetLineAmount = 0.45 + audioEnergy * 0.3;
                targetElectronRate = audioEnergy > 0.15 ? 0.01 : 0;
                break;
            default:
                break;
        }

        // ─── Smooth transitions (asymmetric: fast rise, soft fall) ────

        const lerpUp = 0.04;
        const lerpDn = 0.015;
        currentRadius += (targetRadius - currentRadius) * lerpPerFrame(targetRadius > currentRadius ? lerpUp : lerpDn);
        currentSpeed += (targetSpeed - currentSpeed) * lerpPerFrame(targetSpeed > currentSpeed ? lerpUp : lerpDn);
        currentBright += (targetBright - currentBright) * lerpPerFrame(targetBright > currentBright ? lerpUp : lerpDn);
        currentSize += (targetSize - currentSize) * lerpPerFrame(targetSize > currentSize ? lerpUp : lerpDn);
        lineAmount += (targetLineAmount - lineAmount) * lerpPerFrame(targetLineAmount > lineAmount ? lerpUp : lerpDn);
        electronSpawnRate += (targetElectronRate - electronSpawnRate) * lerpPerFrame(0.02);

        let effectiveRadius = currentRadius;
        if (state === 'speaking') {
            effectiveRadius += fastBass * 8 + fastMid * 3;
        }

        // ─── Transition energy ───────────────────────────────

        if (state !== lastState) {
            transitionEnergy = 1.0;
            lastState = state;
        }
        transitionEnergy *= decayPerFrame(0.985);
        if (transitionEnergy > 0.05) {
            spinX += transitionEnergy * 0.012 * Math.sin(t * 1.7) * frameFactor;
            spinY += transitionEnergy * 0.015 * frameFactor;
            spinZ += transitionEnergy * 0.008 * Math.cos(t * 1.3) * frameFactor;
        }

        const ambientRotSpeed = state === 'speaking' ? 0.0025 + audioEnergy * 0.006 : 0.0008;
        spinY += ambientRotSpeed * frameFactor;
        if (state === 'speaking') {
            spinX += fastBass * 0.003 * Math.sin(t * 2.1) * frameFactor;
            spinZ += fastMid * 0.002 * Math.cos(t * 1.7) * frameFactor;
        }

        // ─── Audio analysis ──────────────────────────────────

        bass = 0;
        mid = 0;
        let rawTreble = 0;

        if (getSpectrum) {
            const raw = getSpectrum();
            if (raw && raw.length) {
                const n = Math.min(freqData.length, raw.length);
                for (let i = 0; i < n; i++) freqData[i] = raw[i];
                for (let i = n; i < freqData.length; i++) freqData[i] = 0;
                let bSum = 0, mSum = 0, tSum = 0;
                for (let i = 0; i < 8; i++) bSum += freqData[i];
                for (let i = 8; i < 24; i++) mSum += freqData[i];
                for (let i = 24; i < 48; i++) tSum += freqData[i];
                bass = bSum / (8 * 255);
                mid = mSum / (16 * 255);
                rawTreble = tSum / (24 * 255);
            }
        } else if (analyser) {
            analyser.getByteFrequencyData(freqData);
            let bSum = 0, mSum = 0, tSum = 0;
            for (let i = 0; i < 8; i++) bSum += freqData[i];
            for (let i = 8; i < 24; i++) mSum += freqData[i];
            for (let i = 24; i < 48; i++) tSum += freqData[i];
            bass = bSum / (8 * 255);
            mid = mSum / (16 * 255);
            rawTreble = tSum / (24 * 255);
        }

        smoothBass += (bass - smoothBass) * lerpPerFrame(bass > smoothBass ? 0.15 : 0.04);
        smoothMid += (mid - smoothMid) * lerpPerFrame(mid > smoothMid ? 0.12 : 0.05);
        smoothTreble += (rawTreble - smoothTreble) * lerpPerFrame(rawTreble > smoothTreble ? 0.2 : 0.08);
        audioEnergy = smoothBass * 0.5 + smoothMid * 0.35 + smoothTreble * 0.15;

        fastBass += (bass - fastBass) * lerpPerFrame(bass > fastBass ? 0.8 : 0.38);
        fastMid += (mid - fastMid) * lerpPerFrame(mid > fastMid ? 0.75 : 0.35);
        fastTreble += (rawTreble - fastTreble) * lerpPerFrame(rawTreble > fastTreble ? 0.8 : 0.4);
        fastEnergy = fastBass * 0.5 + fastMid * 0.35 + fastTreble * 0.15;

        // ─── Cloud Z (depth movement) ───────────────────────

        let zTarget = Math.sin(t * 0.12) * 5;
        if (state === 'thinking') zTarget = Math.sin(t * 0.3) * 12 + Math.sin(t * 0.9) * 4;
        else if (state === 'speaking') zTarget = Math.sin(t * 0.2) * 3 - fastBass * 2;
        cloudZVel += (zTarget - cloudZ) * lerpPerFrame(0.006);
        cloudZVel *= decayPerFrame(0.96);
        cloudZ += cloudZVel * frameFactor;

        points.rotation.x = spinX;
        points.rotation.y = spinY;
        points.rotation.z = spinZ;
        points.position.z = cloudZ;
        lines.rotation.x = spinX;
        lines.rotation.y = spinY;
        lines.rotation.z = spinZ;
        lines.position.z = cloudZ;

        // ─── Particle physics ────────────────────────────────

        const p = geo.getAttribute('position');
        const a = p.array;

        for (let i = 0; i < N; i++) {
            const i3 = i * 3;
            let x = a[i3];
            let y = a[i3 + 1];
            let z = a[i3 + 2];
            const px = phase[i];

            vel[i3] += (Math.sin(t * 0.05 + px) + Math.sin(t * 0.13 + px * 2.7) * 0.4) * 0.001 * currentSpeed * frameFactor;
            vel[i3 + 1] += (Math.cos(t * 0.06 + px * 1.3) + Math.cos(t * 0.11 + px * 1.9) * 0.4) * 0.001 * currentSpeed * frameFactor;
            vel[i3 + 2] += (Math.sin(t * 0.055 + px * 0.7) + Math.sin(t * 0.09 + px * 3.1) * 0.4) * 0.001 * currentSpeed * frameFactor;
            vel[i3] += Math.sin(t * 0.02 + px * 2.1 + y * 0.1) * 0.0008 * currentSpeed * frameFactor;
            vel[i3 + 1] += Math.cos(t * 0.025 + px * 1.7 + z * 0.1) * 0.0008 * currentSpeed * frameFactor;
            vel[i3 + 2] += Math.sin(t * 0.022 + px * 0.9 + x * 0.1) * 0.0008 * currentSpeed * frameFactor;

            const dist = Math.sqrt(x * x + y * y + z * z) || 0.01;
            const nx = x / dist;
            const ny = y / dist;
            const nz = z / dist;
            const overflow = dist - effectiveRadius;
            const pullK = state === 'speaking' ? 0.012 : 0.001;
            const pull = overflow > 0 ? overflow * pullK : 0;
            vel[i3] -= nx * pull * frameFactor;
            vel[i3 + 1] -= ny * pull * frameFactor;
            vel[i3 + 2] -= nz * pull * frameFactor;

            if (fastBass > 0.03) {
                const pushStr = state === 'speaking' ? 0.05 : 0.012;
                vel[i3] += nx * fastBass * pushStr * frameFactor;
                vel[i3 + 1] += ny * fastBass * pushStr * frameFactor;
                vel[i3 + 2] += nz * fastBass * pushStr * frameFactor;

                if (state === 'speaking') {
                    const scatter = fastBass * 0.025;
                    vel[i3] += Math.sin(px * 3.7 + t * 5) * scatter * frameFactor;
                    vel[i3 + 1] += Math.cos(px * 2.3 + t * 4) * scatter * frameFactor;
                    vel[i3 + 2] += Math.sin(px * 1.9 + t * 6) * scatter * frameFactor;
                }
            }

            if (state === 'speaking') {
                if (fastMid > 0.03) {
                    const midWave = Math.sin(t * 14 + dist * 0.5 + px * 0.8);
                    vel[i3] += Math.cos(px * 2.1 + t * 3) * fastMid * 0.02 * midWave * frameFactor;
                    vel[i3 + 1] += Math.sin(px * 1.4 + t * 3.5) * fastMid * 0.02 * midWave * frameFactor;
                    vel[i3 + 2] += Math.cos(px * 0.9 + t * 2.8) * fastMid * 0.014 * midWave * frameFactor;
                }
                if (fastTreble > 0.04) {
                    vel[i3] += (Math.random() - 0.5) * fastTreble * 0.008 * frameFactor;
                    vel[i3 + 1] += (Math.random() - 0.5) * fastTreble * 0.008 * frameFactor;
                    vel[i3 + 2] += (Math.random() - 0.5) * fastTreble * 0.006 * frameFactor;
                }
            }

            const damp = state === 'speaking' ? 0.96 : 0.992;
            const frameDamp = decayPerFrame(damp);
            vel[i3] *= frameDamp;
            vel[i3 + 1] *= frameDamp;
            vel[i3 + 2] *= frameDamp;
            a[i3] += vel[i3] * frameFactor;
            a[i3 + 1] += vel[i3 + 1] * frameFactor;
            a[i3 + 2] += vel[i3 + 2] * frameFactor;
        }
        p.needsUpdate = true;

        // ─── Lines ───────────────────────────────────────────

        if (lineAmount > 0.01) {
            const lp = lineGeo.getAttribute('position');
            const la = lp.array;
            let lineCount = 0;
            const maxDist = lineDistance * (1 + fastBass * 0.15);
            const maxDistSq = maxDist * maxDist;
            const step = Math.max(1, Math.floor(N / 600));

            for (let i = 0; i < N && lineCount < MAX_LINES; i += step) {
                const i3 = i * 3;
                const x1 = a[i3];
                const y1 = a[i3 + 1];
                const z1 = a[i3 + 2];
                for (let j = i + step; j < N && lineCount < MAX_LINES; j += step) {
                    const j3 = j * 3;
                    const dx = a[j3] - x1;
                    const dy = a[j3 + 1] - y1;
                    const dz = a[j3 + 2] - z1;
                    if (dx * dx + dy * dy + dz * dz < maxDistSq) {
                        const idx = lineCount * 6;
                        la[idx] = x1;
                        la[idx + 1] = y1;
                        la[idx + 2] = z1;
                        la[idx + 3] = a[j3];
                        la[idx + 4] = a[j3 + 1];
                        la[idx + 5] = a[j3 + 2];
                        lineCount++;
                    }
                }
            }
            lineGeo.setDrawRange(0, lineCount * 2);
            lp.needsUpdate = true;

            const lineOpBase = lineAmount * 0.12;
            lineMat.opacity = state === 'speaking'
                ? lineOpBase + fastBass * 0.1 + fastMid * 0.06
                : lineOpBase;

            activeConnections = [];
            for (let c = 0; c < Math.min(lineCount, 500); c++) {
                const ci = c * 6;
                activeConnections.push({
                    x1: la[ci],
                    y1: la[ci + 1],
                    z1: la[ci + 2],
                    x2: la[ci + 3],
                    y2: la[ci + 4],
                    z2: la[ci + 5],
                });
            }
        } else {
            lineGeo.setDrawRange(0, 0);
            activeConnections = [];
        }

        // ─── Electrons ───────────────────────────────────────

        const maxElectrons = state === 'speaking' ? 10 : 5;
        const spawnCooldown = state === 'speaking' ? 0.15 : 0.6;
        if (activeConnections.length > 0 && electronSpawnRate > 0.005) {
            if (activeElectrons.length < maxElectrons && t - lastElectronSpawn > spawnCooldown) {
                const conn = activeConnections[Math.floor(Math.random() * activeConnections.length)];
                activeElectrons.push({
                    sx: conn.x1,
                    sy: conn.y1,
                    sz: conn.z1,
                    ex: conn.x2,
                    ey: conn.y2,
                    ez: conn.z2,
                    t: 0,
                    speed: 0.004 + Math.random() * 0.006,
                });
                lastElectronSpawn = t;
            }
        }

        const ep = electronGeo.getAttribute('position');
        const ea = ep.array;
        let aliveCount = 0;

        for (let e = activeElectrons.length - 1; e >= 0; e--) {
            const el = activeElectrons[e];
            el.t += el.speed * frameFactor;
            if (el.t >= 1) {
                activeElectrons.splice(e, 1);
                continue;
            }
            const ei = aliveCount * 3;
            ea[ei] = el.sx + (el.ex - el.sx) * el.t;
            ea[ei + 1] = el.sy + (el.ey - el.sy) * el.t;
            ea[ei + 2] = el.sz + (el.ez - el.sz) * el.t;
            aliveCount++;
        }

        electronGeo.setDrawRange(0, aliveCount);
        ep.needsUpdate = true;

        electrons.rotation.x = spinX;
        electrons.rotation.y = spinY;
        electrons.rotation.z = spinZ;
        electrons.position.z = cloudZ;

        // ─── Particle appearance ─────────────────────────────

        mat.opacity = currentBright + fastEnergy * 0.15;
        mat.size = currentSize + fastBass * 0.05 + (state === 'speaking' ? fastMid * 0.06 : 0);

        // ─── Color dynamics ──────────────────────────────────

        if (state === 'speaking') {
            _scratchColor.setHSL(
                0.555 + fastBass * 0.04 - fastTreble * 0.015,
                0.6 + fastEnergy * 0.2,
                0.5 + fastEnergy * 0.25,
            );
            mat.color.lerp(_scratchColor, lerpPerFrame(0.08));
            lineMat.color.lerp(_scratchColor, lerpPerFrame(0.08));
        } else if (state === 'thinking') {
            mat.color.lerp(_thinkBlue, lerpPerFrame(0.015));
            lineMat.color.lerp(_thinkBlue, lerpPerFrame(0.015));
        } else {
            mat.color.lerp(_baseBlue, lerpPerFrame(0.015));
            lineMat.color.lerp(_baseBlue, lerpPerFrame(0.015));
        }

        camera.position.set(0, 0, CAMERA_BASE_Z);
        camera.lookAt(0, LOOK_AT_Y, 0);

        renderer.render(scene, camera);
    }

    applySize();
    animate();

    return {
        /** @param {OrbState} s */
        setState(s) {
            state = s;
        },
        /** @param {AnalyserNode | null} a */
        setAnalyser(a) {
            analyser = a;
            if (a) freqData = new Uint8Array(a.frequencyBinCount);
        },
        destroy() {
            destroyed = true;
            window.removeEventListener('resize', onWinResize);
            resizeObserver?.disconnect();
            renderer.dispose();
        },
    };
}
