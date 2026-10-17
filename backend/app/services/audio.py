import os
import shutil
import logging
import subprocess
from typing import Optional
from fastapi import HTTPException, UploadFile, status
from app.core.config import settings

logger = logging.getLogger("agriadvisor.audio")

MAX_AUDIO_BYTES = 2 * 1024 * 1024  # 2 MB limit


def process_voice_upload(upload_file: UploadFile, subfolder: str = "voice") -> str:
    """
    Validates audio file size (<= 2 MB), saves it to uploads/voice/,
    and converts it to 16 kHz mono WAV using ffmpeg if available.
    Returns the absolute path to the processed audio file.
    """
    voice_dir = os.path.join(settings.UPLOAD_DIR, subfolder)
    os.makedirs(voice_dir, exist_ok=True)

    # Read and check size
    content = upload_file.file.read()
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Audio file exceeds maximum allowed size of 2 MB ({len(content)} bytes uploaded).",
        )

    # Temporary raw file
    raw_filename = f"raw_{os.urandom(8).hex()}_{upload_file.filename or 'audio.wav'}"
    raw_path = os.path.join(voice_dir, raw_filename)
    with open(raw_path, "wb") as f:
        f.write(content)

    final_filename = f"voice_{os.urandom(8).hex()}.wav"
    final_path = os.path.join(voice_dir, final_filename)

    # Convert with ffmpeg: 16 kHz mono WAV
    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-i", raw_path,
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            final_path,
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
        if result.returncode == 0 and os.path.exists(final_path):
            try:
                os.remove(raw_path)
            except Exception:
                pass
            return final_path
        else:
            logger.warning(f"ffmpeg conversion exited with code {result.returncode}. Keeping raw file as final.")
            shutil.copy(raw_path, final_path)
            return final_path
    except Exception as e:
        logger.info(f"ffmpeg not available or failed ({e}). Saving audio directly.")
        shutil.copy(raw_path, final_path)
        return final_path
