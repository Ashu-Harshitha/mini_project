import os
import re
import io
import hashlib
import logging
from typing import List, Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger("agriadvisor.report_tts")


class TTSGenerationError(Exception):
    """Raised when gTTS synthesis fails or network is offline."""
    pass


def build_report_spoken_text(body_json: Dict[str, Any], lang: str = "en") -> str:
    """Builds clean, natural text to be spoken by TTS from report body_json."""
    parts = []
    what = body_json.get("what_is_happening", "").strip()
    if what:
        parts.append(what)

    next_steps = body_json.get("next_steps", [])
    if next_steps:
        if lang == "hi":
            step_intro = "अगले कदम:"
        elif lang == "kn":
            step_intro = "ಮುಂದಿನ ಹಂತಗಳು:"
        else:
            step_intro = "Next steps:"
        step_parts = [step_intro]
        for idx, s in enumerate(next_steps, 1):
            title = s.get("title", "").strip()
            detail = s.get("detail", "").strip()
            if title and detail:
                step_parts.append(f"{idx}. {title}. {detail}")
            elif title:
                step_parts.append(f"{idx}. {title}")
        parts.append(" ".join(step_parts))

    warnings = body_json.get("warnings", [])
    if warnings:
        if lang == "hi":
            warn_intro = "महत्वपूर्ण सावधानियां:"
        elif lang == "kn":
            warn_intro = "ಪ್ರಮುಖ ಎಚ್ಚರಿಕೆಗಳು:"
        else:
            warn_intro = "Important warnings:"
        warn_parts = [warn_intro]
        for w in warnings:
            if w.strip():
                warn_parts.append(w.strip())
        parts.append(" ".join(warn_parts))

    return " ".join(parts).strip()


def chunk_text_for_tts(text: str, max_chars: int = 400) -> List[str]:
    """
    Splits text into chunks of at most max_chars (default 400) on sentence boundaries.
    Handles English, Hindi (पूर्णविराम ।) and Kannada punctuation.
    """
    if not text:
        return []

    # Split by sentence end markers (. ? ! । ॥ \n)
    raw_sentences = re.split(r"(?<=[.!?।॥\n])\s+", text)
    sentences = [s.strip() for s in raw_sentences if s.strip()]

    chunks = []
    current_chunk = ""

    for s in sentences:
        if len(s) > max_chars:
            # Sentence itself is longer than max_chars; split on comma or whitespace
            sub_parts = re.split(r"(?<=[,;،])\s+|\s+", s)
            for part in sub_parts:
                if not part:
                    continue
                if len(current_chunk) + len(part) + 1 <= max_chars:
                    current_chunk = f"{current_chunk} {part}".strip()
                else:
                    if current_chunk:
                        chunks.append(current_chunk)
                    current_chunk = part[:max_chars]
        else:
            if len(current_chunk) + len(s) + 1 <= max_chars:
                current_chunk = f"{current_chunk} {s}".strip() if current_chunk else s
            else:
                if current_chunk:
                    chunks.append(current_chunk)
                current_chunk = s

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def synthesize_report_audio(body_json: Dict[str, Any], lang: str = "en") -> str:
    """
    Synthesizes MP3 audio using gTTS (en, hi, kn).
    - splits text into chunks of at most 400 chars on sentence boundaries
    - writes MP3 bytes sequentially into one file under uploads/audio/
    - caches by sha256(text+lang)
    - returns absolute file path
    - raises TTSGenerationError if gTTS fails or is offline
    """
    text = build_report_spoken_text(body_json, lang=lang)
    if not text:
        text = "Guidance report summary."

    target_lang = lang if lang in ("hi", "kn", "en") else "en"
    cache_key = hashlib.sha256(f"{text}:{target_lang}".encode("utf-8")).hexdigest()

    upload_dir = settings.UPLOAD_DIR or "uploads"
    audio_dir = os.path.join(upload_dir, "audio")
    os.makedirs(audio_dir, exist_ok=True)

    file_path = os.path.join(audio_dir, f"{cache_key}.mp3")

    # Check cache hit
    if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
        logger.info(f"TTS audio cache HIT for key={cache_key}")
        return file_path

    logger.info(f"TTS audio cache MISS for key={cache_key}. Synthesizing with gTTS...")
    chunks = chunk_text_for_tts(text, max_chars=400)
    if not chunks:
        chunks = [text[:400]]

    try:
        from gtts import gTTS
        temp_file = os.path.join(audio_dir, f"tmp_{cache_key}.mp3")
        with open(temp_file, "wb") as outfile:
            for chunk in chunks:
                tts = gTTS(text=chunk, lang=target_lang)
                fp = io.BytesIO()
                tts.write_to_fp(fp)
                fp.seek(0)
                outfile.write(fp.read())

        os.replace(temp_file, file_path)
        logger.info(f"TTS audio successfully written to {file_path}")
        return file_path
    except Exception as e:
        logger.warning(f"gTTS audio synthesis failed: {e}")
        raise TTSGenerationError(f"gTTS synthesis failed or offline: {e}") from e
