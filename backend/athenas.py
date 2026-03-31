"""
ATHENAS — assistente de voz do OrbitalSync (Gemini Live).

Implementação em `orbital.assistant`; este ficheiro é o ponto de entrada estável pelo nome do assistente.
"""
import argparse
import asyncio

from orbital.assistant import AudioLoop, DEFAULT_MODE, get_input_devices, get_output_devices

__all__ = ["AudioLoop", "DEFAULT_MODE", "get_input_devices", "get_output_devices"]

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        type=str,
        default=DEFAULT_MODE,
        help="pixels to stream from",
        choices=["camera", "screen", "none"],
    )
    args = parser.parse_args()
    main = AudioLoop(video_mode=args.mode)
    asyncio.run(main.run())
