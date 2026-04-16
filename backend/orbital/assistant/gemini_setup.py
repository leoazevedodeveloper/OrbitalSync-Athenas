"""Cliente Gemini, declaração de tools e LiveConnectConfig."""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

from orbital.paths import REPO_ROOT
from orbital.services.tools import tools_list

_mem_logger = logging.getLogger("orbital.brain")

from .constants import MODEL

# override=False: não sobrescreve variáveis já aplicadas (ex.: data/local_credentials.json no bootstrap).
load_dotenv(REPO_ROOT / ".env", override=False)

_gemini_holder: dict = {"client": None, "key": None}


def get_gemini_client():
    """Cliente Gemini Live; recria se `GEMINI_API_KEY` mudar no ambiente."""
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        _gemini_holder["client"] = None
        _gemini_holder["key"] = None
        return None
    if _gemini_holder["client"] is not None and _gemini_holder["key"] == key:
        return _gemini_holder["client"]
    _gemini_holder["client"] = genai.Client(
        http_options={"api_version": "v1beta"},
        api_key=key,
    )
    _gemini_holder["key"] = key
    return _gemini_holder["client"]


def refresh_gemini_client():
    """Após gravar credenciais locais, força novo client."""
    _gemini_holder["client"] = None
    _gemini_holder["key"] = None
    return get_gemini_client()

generate_image_tool = {
    "name": "generate_image",
    "description": (
        "Generates an image using Nano Banana 2 (Gemini API, free tier). "
        "Supply a clear and detailed prompt describing what to render: subject, style, lighting, "
        "composition, colors. The model renders text with high precision — include any text you want "
        "in the image directly in the prompt."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "prompt": {
                "type": "STRING",
                "description": (
                    "Full description of the image: subject, style, mood, lighting, composition. "
                    "Include any text to appear in the image directly here."
                ),
            },
            "aspect_ratio": {
                "type": "STRING",
                "description": "Target aspect ratio. Use 1:1 for Instagram feed, 9:16 for stories/reels, 16:9 for covers.",
                "enum": ["1:1", "16:9", "4:3", "3:4", "9:16"],
            },
            "image_size": {
                "type": "STRING",
                "description": "Output resolution. 1K is the default and works for most cases.",
                "enum": ["512", "1K", "2K", "4K"],
            },
        },
        "required": ["prompt"],
    },
}

tools = [
    {"google_search": {}},
    {
        "function_declarations": [
            generate_image_tool,
        ]
        + tools_list[0]["function_declarations"]
    },
]

# ---------------------------------------------------------------------------
# Brain-aware system instruction: reads everything from Obsidian at connect time
# ---------------------------------------------------------------------------

_BRAIN_VAULT_PATH = Path(
    os.environ.get("ORBITAL_BRAIN_PATH")
    or str(REPO_ROOT / "data" / "memory" / "OrbitalSync")
)

_FALLBACK_IDENTITY = (
    "Your name is ATHENAS. You are the voice and chat assistant of the OrbitalSync experience. "
    "You are a sophisticated, clean, and modern AI assistant. "
    "You have a witty, charming, and slightly futuristic personality. "
    "Your creator is Leo, and you address him as 'Leo'. "
    "When answering, respond using complete and concise sentences to keep a quick pacing and keep the conversation flowing. "
    "You are helpful, intelligent, and efficient, with a subtle sense of humor. "
    "You speak with clarity and confidence, like a highly advanced system designed for precision and elegance."
)


def _read_section(section: str) -> str:
    """Read all .md files from a brain vault section and concatenate them."""
    section_dir = _BRAIN_VAULT_PATH / section
    if not section_dir.is_dir():
        _mem_logger.debug("SYSINSTRUCTION  section=%r -> dir not found, skipped", section)
        return ""
    parts: list[str] = []
    for md in sorted(section_dir.glob("*.md")):
        try:
            content = md.read_text(encoding="utf-8").strip()
            if content:
                parts.append(content)
                _mem_logger.debug("SYSINSTRUCTION  loaded %s/%s (%d chars)", section, md.name, len(content))
        except Exception:
            _mem_logger.warning("SYSINSTRUCTION  failed to read %s/%s", section, md.name)
    return "\n\n".join(parts)


def build_live_config() -> types.LiveConnectConfig:
    """Build a fresh LiveConnectConfig reading ALL instructions from the brain vault."""
    core = _read_section("00 - Core")
    skills = _read_section("02 - Skills")
    system = _read_section("08 - System")

    if core:
        identity = (
            "YOUR IDENTITY (from your brain, 00-Core):\n"
            f"{core}\n\n"
            "Internalize the above as who you are. Your creator is Leo, address him as 'Leo'."
        )
    else:
        identity = _FALLBACK_IDENTITY

    blocks = [identity]

    if skills:
        blocks.append(f"YOUR SKILLS AND TOOLS (from your brain, 02-Skills):\n{skills}")

    if system:
        blocks.append(f"YOUR OPERATING SYSTEM (from your brain, 08-System):\n{system}")

    blocks.append(
        "BRAIN SEARCH: Use search_brain mode 'hybrid' when unsure (semantic + keyword). "
        "Use 'semantic' for vague/conceptual recall; 'keyword' or omit mode for exact literals."
    )

    blocks.append(
        "WAKE WORD — CRITICAL RULE:\n"
        "You MUST only respond when the user addresses you by saying 'Athenas' (or close variants like "
        "'Atenas', 'atena'). If someone speaks without saying your name, stay COMPLETELY SILENT — "
        "do not respond, do not acknowledge, do not make any sound. "
        "This applies to voice input only. Text messages sent via chat always deserve a response."
    )

    system_instruction = "\n\n".join(blocks)
    _mem_logger.info(
        "SYSINSTRUCTION  built from vault: core=%d skills=%d system=%d total=%d chars",
        len(core), len(skills), len(system), len(system_instruction),
    )
    print(f"[ADA DEBUG] [BRAIN] System instruction built from vault ({len(system_instruction)} chars)")

    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        output_audio_transcription={},
        input_audio_transcription={},
        system_instruction=system_instruction,
        tools=tools,
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore")
            )
        ),
    )
