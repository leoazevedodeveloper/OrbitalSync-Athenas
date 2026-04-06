/**
 * Alarme do cronómetro (Web Audio): repete até `stopTimerAlarm()`.
 * Respeita `setSinkId` quando disponível (altifalante das definições).
 */

let _alarmStop = null;

export function stopTimerAlarm() {
    if (typeof _alarmStop === 'function') {
        try {
            _alarmStop();
        } catch {
            /* ignore */
        }
        _alarmStop = null;
    }
}

/**
 * Inicia bipes contínuos até `stopTimerAlarm()`.
 * @param {string|undefined} sinkDeviceId
 */
export function startTimerAlarm(sinkDeviceId) {
    stopTimerAlarm();

    void (async () => {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;

            const ctx = new Ctx();
            const sink = typeof sinkDeviceId === 'string' && sinkDeviceId.trim() ? sinkDeviceId.trim() : '';
            if (sink && typeof ctx.setSinkId === 'function') {
                try {
                    await ctx.setSinkId(sink);
                } catch (err) {
                    console.warn('[timerAlertSound] setSinkId falhou:', err);
                }
            }
            if (ctx.state === 'suspended') {
                await ctx.resume().catch(() => {});
            }

            let stopped = false;
            let step = 0;

            const playBeep = () => {
                if (stopped || ctx.state === 'closed') return;
                const t = ctx.currentTime + 0.02;
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.connect(g);
                g.connect(ctx.destination);
                osc.frequency.value = step % 2 === 0 ? 920 : 640;
                osc.type = 'sine';
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(0.17, t + 0.012);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
                osc.start(t);
                osc.stop(t + 0.18);
                step += 1;
            };

            playBeep();
            const intervalId = window.setInterval(() => {
                if (stopped) return;
                playBeep();
            }, 380);

            _alarmStop = () => {
                stopped = true;
                window.clearInterval(intervalId);
                try {
                    ctx.close();
                } catch {
                    /* ignore */
                }
            };
        } catch (e) {
            console.warn('[timerAlertSound]', e);
        }
    })();
}

/** @deprecated usar startTimerAlarm */
export function playTimerFinishedAlert(sinkDeviceId) {
    startTimerAlarm(sinkDeviceId);
}
