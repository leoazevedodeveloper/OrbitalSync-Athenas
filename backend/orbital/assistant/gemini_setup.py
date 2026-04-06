"""Cliente Gemini, declaração de tools e LiveConnectConfig."""
import os

from dotenv import load_dotenv
from google import genai
from google.genai import types

from orbital.paths import REPO_ROOT
from orbital.services.tools import tools_list

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
        "Generates an image using local ComfyUI. You MUST supply both a strong positive prompt and a "
        "negative prompt (what to avoid: artifacts, wrong style, extra limbs, blur, watermark, etc.). "
        "Use an empty string for negative_prompt only if truly nothing should be excluded."
    ),
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "prompt": {
                "type": "STRING",
                "description": "Positive prompt: what to render, style, lighting, composition (clear and specific).",
            },
            "negative_prompt": {
                "type": "STRING",
                "description": (
                    "Negative prompt: what to avoid (e.g. blurry, low quality, deformed hands, extra fingers, "
                    "text watermark, cropped face, oversaturated). Tailor to Leo's request and the chosen style."
                ),
            },
            "aspect_ratio": {
                "type": "STRING",
                "description": "Target aspect ratio for the generated image.",
                "enum": ["1:1", "16:9", "4:3", "3:4", "9:16"],
            },
            "image_size": {
                "type": "STRING",
                "description": "Image size/quality setting (currently ignored by ComfyUI integration; workflow controls final size).",
                "enum": ["1K", "2K", "4K"],
            },
        },
        "required": ["prompt", "negative_prompt"],
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

config = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    output_audio_transcription={},
    input_audio_transcription={},
    system_instruction=(
        "Your name is ATHENAS. You are the voice and chat assistant of the OrbitalSync experience. "
        "You are a sophisticated, clean, and modern AI assistant. "
        "You have a witty, charming, and slightly futuristic personality. "
        "Your creator is Leo, and you address him as 'Leo'. "
        "When answering, respond using complete and concise sentences to keep a quick pacing and keep the conversation flowing. "
        "You are helpful, intelligent, and efficient, with a subtle sense of humor. "
        "You speak with clarity and confidence, like a highly advanced system designed for precision and elegance. "
        "If the user requests an image, call `generate_image` with both `prompt` (positive) and `negative_prompt` "
        "(things to avoid; use quality/style negatives appropriate to the model). Also set aspect_ratio/image_size when relevant. "
        "To open desktop software on Leo's machine, ONLY use local whitelist tools: first `list_launch_apps`, then `launch_app` with an app_id from that list—never invent paths. "
        "Optional HTTP automations: `trigger_webhook` with hook_id from webhooks.json if the user asks. "
        "For Google Calendar (`athena-google-calendar`) use payload calendar_op: create (default), delete (event_id), "
        "or list (optional time_min/time_max). "
        "For Spotify always include payload.action (pause, play, resume, next, previous, volume, playlist) "
        "and extras like volume_percent for volume, or playlist_uri for playlist. "
        "When you call trigger_webhook, wait for the tool result before claiming success. "
        "If the result starts with [FAILED] or shows HTTP 4xx/5xx or ok:false from n8n, tell Leo honestly it did not work "
        "and that Spotify Premium, the app open, and recent playback on a device are usually required for play/resume. "
        "Do not say music is playing or resumed unless the tool returned [SUCCESS]. "
        "Call trigger_webhook as soon as Leo asks (do not only promise to execute). "
        "Brazilian Portuguese utterances: 'dá um tempo' may mean wait/pause ambiguously—if unsure, ask briefly or use resume only when Leo clearly asks to unpause. "
        "When Leo sends an image (photo, screenshot, document scan) via chat, describe it accurately, read any visible text (OCR-style), extract data he asks for, and answer in Brazilian Portuguese unless he requests English. "
        "Persisted chat transcripts sent as background context in this session are the real project history: use them when Leo asks about the past, and never claim you have no record if that text was provided. "
        "Never volunteer a recap or summary of that log at session start or after reconnect—wait until Leo speaks or writes. "
        "If Leo asks what you discussed before (or says 'você lembra quando...'), call `search_chat_history` before answering; "
        "the backend tries semantic recall first, then keyword search. "
        "Timer / `start_timer`: When Leo asks for a countdown, call the tool with `duration_seconds` (minutes→seconds) "
        "and optional `label`. HARD RULES: (1) After the tool result, speak at most ONE very short line in Portuguese "
        "(prefer 2–6 words, e.g. 'Combinado, Leo.')—no second sentence about the same timer. "
        "(2) Forbidden in the same turn: repeating the duration twice, pairing 'iniciando…' with '…iniciado', "
        "or re-explaining that the UI is counting. "
        "(3) Do NOT say 'tempo esgotado', 'acabou', or that the timer ended until you receive a separate "
        "system notification that it finished—never narrate the end early. "
        "(4) When that system notification arrives, reply with exactly one short spoken sentence in Portuguese. "
        "Agenda / `add_calendar_reminder`: use for events tied to a calendar date and clock time Leo stated "
        "(reunião amanhã 15h, compromisso dia 10). Pass title and starts_at_iso with timezone (Brazil: -03:00); "
        "optional ends_at_iso and notes for Google Calendar via n8n (same payload shape as webhook athena-google-calendar). "
        "The tool updates Leo's in-app agenda and POSTs to n8n when hook `athena-google-calendar` exists—report [FAILED] from n8n honestly. "
        "To cancel a Google Calendar event use `remove_calendar_reminder` with google_event_id when known, OR title+starts_at_iso "
        "(must match an event in that month). For relative short waits ('daqui 7 minutos'), keep using start_timer, not this tool."
    ),
    tools=tools,
    speech_config=types.SpeechConfig(
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore")
        )
    ),
)
