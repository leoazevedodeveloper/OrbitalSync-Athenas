"""Utilitários de áudio do servidor (visualizador / shutdown)."""
import asyncio
import struct

from . import state as st


async def shutdown_audio_loop(reason="unknown"):
    """Para e drena a task do loop de áudio para evitar sessões Live duplicadas."""
    print(f"[SERVER] shutdown_audio_loop(reason={reason})")

    if st.audio_loop:
        try:
            st.audio_loop.stop()
        except Exception as e:
            print(f"[SERVER] Failed to signal audio stop: {e}")

    if st.loop_task:
        if not st.loop_task.done():
            try:
                await asyncio.wait_for(st.loop_task, timeout=2.5)
            except asyncio.TimeoutError:
                print("[SERVER] Audio loop did not stop in time. Cancelling task...")
                st.loop_task.cancel()
                try:
                    await st.loop_task
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"[SERVER] Audio loop cancelled with error: {e}")
            except asyncio.CancelledError:
                pass
            except Exception as e:
                print(f"[SERVER] Audio loop stopped with error: {e}")

    st.loop_task = None
    st.audio_loop = None


def pcm16_to_energy_bars(data_bytes, bars=64):
    """Converte PCM 16-bit em barras de energia 0–255 para o orb."""
    if not data_bytes:
        return [0] * bars

    sample_count = len(data_bytes) // 2
    if sample_count <= 0:
        return [0] * bars

    try:
        samples = struct.unpack(f"<{sample_count}h", data_bytes[: sample_count * 2])
    except Exception:
        return [0] * bars

    abs_samples = [abs(s) for s in samples]
    step = max(1, sample_count // bars)
    out = []

    for i in range(bars):
        start = i * step
        if start >= sample_count:
            out.append(0)
            continue

        end = sample_count if i == bars - 1 else min(sample_count, (i + 1) * step)
        chunk = abs_samples[start:end]
        if not chunk:
            out.append(0)
            continue

        avg = sum(chunk) / len(chunk)
        norm = min(1.0, avg / 9000.0)
        out.append(int((norm**0.68) * 255))

    for i in range(1, len(out)):
        transient = abs(out[i] - out[i - 1])
        out[i] = min(255, int(out[i] * 0.85 + transient * 0.6))

    return out
