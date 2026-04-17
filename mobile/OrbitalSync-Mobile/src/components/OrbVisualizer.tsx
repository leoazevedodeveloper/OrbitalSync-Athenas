import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

interface OrbVisualizerProps {
  isListening: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  audioLevel?: number;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const ORB_CANVAS_SIZE = Math.min(SCREEN_W * 1.2, SCREEN_H * 0.7);

const ORB_HTML = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
      background: #000;
    }
  </style>
</head>
<body>
  <canvas id="orb"></canvas>
  <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
  <script>
    (function () {
      var canvas = document.getElementById('orb');
      var N = 4600;
      var CAMERA_BASE_Z = 108;
      var LOOK_AT_Y = 0;
      var state = 'idle';
      var externalEnergy = 0;

      var renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.setClearColor(0x000000, 1);

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
      camera.position.z = CAMERA_BASE_Z;

      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      function resize() {
        var w = Math.max(1, canvas.clientWidth || window.innerWidth || 300);
        var h = Math.max(1, canvas.clientHeight || window.innerHeight || 300);
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      resize();
      window.addEventListener('resize', resize);

      var geo = new THREE.BufferGeometry();
      var pos = new Float32Array(N * 3);
      var vel = new Float32Array(N * 3);
      var phase = new Float32Array(N);

      for (var i = 0; i < N; i++) {
        var theta = Math.random() * Math.PI * 2;
        var phi = Math.acos(2 * Math.random() - 1);
        var isOuter = Math.random() < 0.14;
        var r = isOuter ? 26 + Math.random() * 10 : Math.pow(Math.random(), 0.45) * 24;
        var stretchX = 1.0 + Math.random() * 0.55;
        var stretchY = 0.72 + Math.random() * 0.28;
        var stretchZ = 0.9 + Math.random() * 0.5;
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta) * stretchX;
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * stretchY;
        pos[i * 3 + 2] = r * Math.cos(phi) * stretchZ;
        phase[i] = Math.random() * 1000;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

      var mat = new THREE.PointsMaterial({
        color: 0x4ca8e8,
        size: 0.44,
        transparent: true,
        opacity: 0.62,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      var points = new THREE.Points(geo, mat);
      scene.add(points);

      var MAX_LINES = 10000;
      var linePos = new Float32Array(MAX_LINES * 6);
      var lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
      lineGeo.setDrawRange(0, 0);

      var lineMat = new THREE.LineBasicMaterial({
        color: 0x4ca8e8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      var lines = new THREE.LineSegments(lineGeo, lineMat);
      scene.add(lines);

      var targetRadius = 25;
      var currentRadius = 25;
      var targetSpeed = 0.3;
      var currentSpeed = 0.3;
      var targetBright = 0.6;
      var currentBright = 0.6;
      var targetSize = 0.4;
      var currentSize = 0.4;
      var lineAmount = 0;
      var targetLineAmount = 0;
      var lineDistance = 10;

      var spinX = 0;
      var spinY = 0;
      var spinZ = 0;
      var transitionEnergy = 0;
      var lastState = 'idle';

      var cloudZ = 0;
      var cloudZVel = 0;

      var smoothBass = 0;
      var smoothMid = 0;
      var smoothTreble = 0;
      var audioEnergy = 0;

      var fastBass = 0;
      var fastMid = 0;
      var fastTreble = 0;
      var fastEnergy = 0;

      var _scratchColor = new THREE.Color();
      var _baseBlue = new THREE.Color(0x4ca8e8);
      var _thinkBlue = new THREE.Color(0x6ec4ff);

      var lastTime = performance.now();
      var elapsed = 0;

      function clamp01(v) {
        return Math.max(0, Math.min(1, Number(v) || 0));
      }

      function setInput(payload) {
        if (!payload) return;
        if (payload.state) state = payload.state;
        if (payload.energy != null) externalEnergy = clamp01(payload.energy);
      }

      function onMsg(raw) {
        try {
          var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (data && data.type === 'orb_input') setInput(data);
        } catch (_) {}
      }

      window.addEventListener('message', function (event) { onMsg(event.data); });
      document.addEventListener('message', function (event) { onMsg(event.data); });

      function animate(now) {
        requestAnimationFrame(animate);

        var dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        elapsed += dt;

        var frameFactor = Math.min(3, dt * 60);
        var lerpPerFrame = function (rate) {
          return 1 - Math.pow(1 - rate, frameFactor);
        };
        var decayPerFrame = function (rate) {
          return Math.pow(rate, frameFactor);
        };

        var bass = externalEnergy;
        var mid = externalEnergy * 0.85;
        var treble = externalEnergy * 0.6;

        smoothBass += (bass - smoothBass) * lerpPerFrame(bass > smoothBass ? 0.15 : 0.04);
        smoothMid += (mid - smoothMid) * lerpPerFrame(mid > smoothMid ? 0.12 : 0.05);
        smoothTreble += (treble - smoothTreble) * lerpPerFrame(treble > smoothTreble ? 0.2 : 0.08);
        audioEnergy = smoothBass * 0.5 + smoothMid * 0.35 + smoothTreble * 0.15;

        fastBass += (bass - fastBass) * lerpPerFrame(bass > fastBass ? 0.8 : 0.38);
        fastMid += (mid - fastMid) * lerpPerFrame(mid > fastMid ? 0.75 : 0.35);
        fastTreble += (treble - fastTreble) * lerpPerFrame(treble > fastTreble ? 0.8 : 0.4);
        fastEnergy = fastBass * 0.5 + fastMid * 0.35 + fastTreble * 0.15;

        if (state === 'idle') {
          targetRadius = 24;
          targetSpeed = 0.2;
          targetBright = 0.5;
          targetSize = 0.36;
          targetLineAmount = 0.24;
        } else if (state === 'listening') {
          targetRadius = 20 + smoothBass * 2.4;
          targetSpeed = 0.3 + audioEnergy * 0.15;
          targetBright = 0.65 + audioEnergy * 0.1;
          targetSize = 0.42;
          targetLineAmount = 0.62 + audioEnergy * 0.26;
        } else if (state === 'thinking') {
          targetRadius = 14;
          targetSpeed = 0.5;
          targetBright = 0.72;
          targetSize = 0.32;
          targetLineAmount = 1.15;
        } else if (state === 'speaking') {
          targetRadius = 22;
          targetSpeed = 0.25 + audioEnergy * 0.2;
          targetBright = 0.6 + audioEnergy * 0.15;
          targetSize = 0.4;
          targetLineAmount = 0.72 + audioEnergy * 0.42;
        }

        var lerpUp = 0.04;
        var lerpDn = 0.015;
        currentRadius += (targetRadius - currentRadius) * lerpPerFrame(targetRadius > currentRadius ? lerpUp : lerpDn);
        currentSpeed += (targetSpeed - currentSpeed) * lerpPerFrame(targetSpeed > currentSpeed ? lerpUp : lerpDn);
        currentBright += (targetBright - currentBright) * lerpPerFrame(targetBright > currentBright ? lerpUp : lerpDn);
        currentSize += (targetSize - currentSize) * lerpPerFrame(targetSize > currentSize ? lerpUp : lerpDn);
        lineAmount += (targetLineAmount - lineAmount) * lerpPerFrame(targetLineAmount > lineAmount ? lerpUp : lerpDn);

        var effectiveRadius = currentRadius;
        if (state === 'speaking') effectiveRadius += fastBass * 8 + fastMid * 3;

        if (state !== lastState) {
          transitionEnergy = 1;
          lastState = state;
        }
        transitionEnergy *= decayPerFrame(0.985);

        if (transitionEnergy > 0.05) {
          spinX += transitionEnergy * 0.012 * Math.sin(elapsed * 1.7) * frameFactor;
          spinY += transitionEnergy * 0.015 * frameFactor;
          spinZ += transitionEnergy * 0.008 * Math.cos(elapsed * 1.3) * frameFactor;
        }

        var ambientRot = state === 'speaking' ? 0.0025 + audioEnergy * 0.006 : 0.0008;
        spinY += ambientRot * frameFactor;

        if (state === 'speaking') {
          spinX += fastBass * 0.003 * Math.sin(elapsed * 2.1) * frameFactor;
          spinZ += fastMid * 0.002 * Math.cos(elapsed * 1.7) * frameFactor;
        }

        var zTarget = Math.sin(elapsed * 0.12) * 5;
        if (state === 'thinking') {
          zTarget = Math.sin(elapsed * 0.3) * 12 + Math.sin(elapsed * 0.9) * 4;
        } else if (state === 'speaking') {
          zTarget = Math.sin(elapsed * 0.2) * 3 - fastBass * 2;
        }
        cloudZVel += (zTarget - cloudZ) * lerpPerFrame(0.006);
        cloudZVel *= decayPerFrame(0.96);
        cloudZ += cloudZVel * frameFactor;

        points.rotation.set(spinX, spinY, spinZ);
        lines.rotation.set(spinX, spinY, spinZ);
        points.position.z = cloudZ;
        lines.position.z = cloudZ;

        var p = geo.getAttribute('position');
        var a = p.array;

        for (var idx = 0; idx < N; idx++) {
          var i3 = idx * 3;
          var x = a[i3];
          var y = a[i3 + 1];
          var z = a[i3 + 2];
          var px = phase[idx];

          vel[i3] += (Math.sin(elapsed * 0.05 + px) + Math.sin(elapsed * 0.13 + px * 2.7) * 0.4) * 0.001 * currentSpeed * frameFactor;
          vel[i3 + 1] += (Math.cos(elapsed * 0.06 + px * 1.3) + Math.cos(elapsed * 0.11 + px * 1.9) * 0.4) * 0.001 * currentSpeed * frameFactor;
          vel[i3 + 2] += (Math.sin(elapsed * 0.055 + px * 0.7) + Math.sin(elapsed * 0.09 + px * 3.1) * 0.4) * 0.001 * currentSpeed * frameFactor;

          var dist = Math.sqrt(x * x + y * y + z * z) || 0.01;
          var nx = x / dist;
          var ny = y / dist;
          var nz = z / dist;
          var overflow = dist - effectiveRadius;
          var outerBias = (idx % 7 === 0) ? 0.35 : 1;
          var pullBase = state === 'speaking' ? 0.007 : 0.0007;
          var pull = overflow > 6 ? (overflow - 6) * pullBase * outerBias : 0;

          vel[i3] -= nx * pull * frameFactor;
          vel[i3 + 1] -= ny * pull * frameFactor;
          vel[i3 + 2] -= nz * pull * frameFactor;

          if (fastBass > 0.03) {
            var push = state === 'speaking' ? 0.05 : 0.012;
            vel[i3] += nx * fastBass * push * frameFactor;
            vel[i3 + 1] += ny * fastBass * push * frameFactor;
            vel[i3 + 2] += nz * fastBass * push * frameFactor;
          }

          if (state === 'speaking' || state === 'listening') {
            var bleed = (state === 'speaking' ? 0.012 : 0.006) * (0.35 + externalEnergy);
            vel[i3] += nx * bleed * Math.sin(elapsed * 2.4 + px * 0.7) * frameFactor;
            vel[i3 + 1] += ny * bleed * Math.cos(elapsed * 2.1 + px * 1.1) * frameFactor;
            vel[i3 + 2] += nz * bleed * Math.sin(elapsed * 2.8 + px * 1.5) * frameFactor;
          }

          var damp = state === 'speaking' ? 0.96 : 0.992;
          var frameDamp = decayPerFrame(damp);
          vel[i3] *= frameDamp;
          vel[i3 + 1] *= frameDamp;
          vel[i3 + 2] *= frameDamp;

          a[i3] += vel[i3] * frameFactor;
          a[i3 + 1] += vel[i3 + 1] * frameFactor;
          a[i3 + 2] += vel[i3 + 2] * frameFactor;
        }

        p.needsUpdate = true;

        if (lineAmount > 0.01) {
          var lp = lineGeo.getAttribute('position');
          var la = lp.array;
          var lineCount = 0;
          var maxDist = lineDistance * (1.55 + fastBass * 0.28 + (state === 'thinking' ? 0.22 : 0));
          var maxDistSq = maxDist * maxDist;
          var step = Math.max(1, Math.floor(N / 760));

          for (var ii = 0; ii < N && lineCount < MAX_LINES; ii += step) {
            var ii3 = ii * 3;
            var x1 = a[ii3];
            var y1 = a[ii3 + 1];
            var z1 = a[ii3 + 2];

            for (var jj = ii + step; jj < N && lineCount < MAX_LINES; jj += step) {
              var jj3 = jj * 3;
              var dx = a[jj3] - x1;
              var dy = a[jj3 + 1] - y1;
              var dz = a[jj3 + 2] - z1;
              if (dx * dx + dy * dy + dz * dz < maxDistSq) {
                var lidx = lineCount * 6;
                la[lidx] = x1;
                la[lidx + 1] = y1;
                la[lidx + 2] = z1;
                la[lidx + 3] = a[jj3];
                la[lidx + 4] = a[jj3 + 1];
                la[lidx + 5] = a[jj3 + 2];
                lineCount++;
              }
            }
          }

          lineGeo.setDrawRange(0, lineCount * 2);
          lp.needsUpdate = true;
          lineMat.opacity = state === 'speaking'
            ? lineAmount * 0.2 + fastBass * 0.14 + fastMid * 0.08
            : state === 'thinking'
              ? lineAmount * 0.2 + 0.03
              : lineAmount * 0.16;
        } else {
          lineGeo.setDrawRange(0, 0);
        }

        mat.opacity = currentBright + fastEnergy * 0.15;
        mat.size = currentSize + fastBass * 0.05 + (state === 'speaking' ? fastMid * 0.06 : 0);

        if (state === 'speaking') {
          _scratchColor.setHSL(
            0.555 + fastBass * 0.04 - fastTreble * 0.015,
            0.6 + fastEnergy * 0.2,
            0.5 + fastEnergy * 0.25
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

      requestAnimationFrame(animate);
      setInput({ state: 'idle', energy: 0 });
    })();
  </script>
</body>
</html>`;

export default function OrbVisualizer({
  isListening,
  isSpeaking,
  isThinking,
  audioLevel = 0,
}: OrbVisualizerProps) {
  const webRef = useRef<WebView>(null);

  const currentState = useMemo(() => {
    if (isSpeaking) return 'speaking';
    if (isThinking) return 'thinking';
    if (isListening) return 'listening';
    return 'idle';
  }, [isListening, isSpeaking, isThinking]);

  const sendInput = () => {
    const payload = {
      type: 'orb_input',
      state: currentState,
      energy: Math.max(0, Math.min(1, Number(audioLevel) || 0)),
    };
    webRef.current?.postMessage(JSON.stringify(payload));
  };

  useEffect(() => {
    sendInput();
  }, [currentState, audioLevel]);

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.orbCanvas,
          {
            width: ORB_CANVAS_SIZE,
            height: ORB_CANVAS_SIZE,
          },
        ]}
      >
        <WebView
          ref={webRef}
          source={{ html: ORB_HTML }}
          originWhitelist={['*']}
          style={styles.webview}
          onLoadEnd={sendInput}
          javaScriptEnabled
          domStorageEnabled={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          mixedContentMode="always"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  orbCanvas: {
    borderRadius: ORB_CANVAS_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
});
