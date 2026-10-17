import time
import json
import logging
import threading
from typing import List, Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger("agriadvisor.gemini")


class RateLimiter:
    """Thread-safe sliding window rate limiter."""
    def __init__(self, max_rpm: int = 8):
        self.max_rpm = max_rpm
        self.interval = 60.0
        self.timestamps = []
        self.lock = threading.Lock()

    def acquire(self):
        with self.lock:
            now = time.time()
            # Purge timestamps older than 60s
            self.timestamps = [t for t in self.timestamps if now - t < self.interval]
            if len(self.timestamps) >= self.max_rpm:
                sleep_time = self.interval - (now - self.timestamps[0]) + 0.1
                if sleep_time > 0:
                    logger.info(f"Gemini rate limit reached ({self.max_rpm} RPM). Waiting {sleep_time:.2f}s...")
                    time.sleep(sleep_time)
                now = time.time()
                self.timestamps = [t for t in self.timestamps if now - t < self.interval]
            self.timestamps.append(time.time())


class GeminiClient:
    """
    Shared Gemini wrapper using google-genai SDK with rate limiting and exponential backoff retry.
    Automatically falls back to mock mode if AI_MODE=mock or GEMINI_API_KEY is not configured.
    """
    def __init__(self):
        self.ai_mode = settings.AI_MODE.lower()
        self.api_key = settings.GEMINI_API_KEY
        self.model_name = settings.GEMINI_MODEL or "gemini-2.5-flash-lite"
        self.rate_limiter = RateLimiter(max_rpm=settings.GEMINI_MAX_RPM)
        self._client = None

        if self.ai_mode == "gemini" and self.api_key:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
                logger.info(f"Initialized Gemini Client with model {self.model_name}")
            except Exception as e:
                logger.warning(f"Failed to initialize google-genai Client: {e}. Falling back to mock mode.")
                self.ai_mode = "mock"
        else:
            self.ai_mode = "mock"

    def _execute_with_retry(self, fn, *args, **kwargs) -> Any:
        max_retries = 3
        backoff = 2.0
        for attempt in range(max_retries):
            self.rate_limiter.acquire()
            try:
                return fn(*args, **kwargs)
            except Exception as e:
                err_str = str(e).lower()
                is_transient = "429" in err_str or "503" in err_str or "quota" in err_str or "resource_exhausted" in err_str
                if is_transient and attempt < max_retries - 1:
                    logger.warning(f"Gemini API transient error: {e}. Retrying in {backoff}s (attempt {attempt+1}/{max_retries})...")
                    time.sleep(backoff)
                    backoff *= 2.0
                else:
                    raise

    def translate(self, text: str, target_lang: str) -> str:
        """Translates text into target_lang (en, hi, kn)."""
        if not text or not text.strip():
            return text

        if self.ai_mode == "mock" or not self._client:
            return f"[{target_lang}] {text}"

        prompt = (
            f"You are a professional agricultural translator. Translate the following text into "
            f"{'Hindi' if target_lang == 'hi' else 'Kannada' if target_lang == 'kn' else 'English'}. "
            f"Preserve technical agronomic and crop terms accurately. Output ONLY the translated text.\n\n"
            f"Text: {text}"
        )
        try:
            response = self._execute_with_retry(
                self._client.models.generate_content,
                model=self.model_name,
                contents=prompt,
            )
            return response.text.strip() if response and response.text else f"[{target_lang}] {text}"
        except Exception as e:
            logger.error(f"Gemini translation failed: {e}. Falling back to mock format.")
            return f"[{target_lang}] {text}"

    def batch_translate(self, texts: List[str], target_lang: str) -> List[str]:
        """Translates multiple texts in ONE call."""
        if not texts:
            return []

        if self.ai_mode == "mock" or not self._client:
            return [f"[{target_lang}] {t}" for t in texts]

        payload = [{"id": i, "text": t} for i, t in enumerate(texts)]
        prompt = (
            f"Translate each item in this JSON array into "
            f"{'Hindi' if target_lang == 'hi' else 'Kannada' if target_lang == 'kn' else 'English'}. "
            f"Return a strict JSON array of objects with 'id' and 'translated_text'.\n\n"
            f"Input JSON: {json.dumps(payload, ensure_ascii=False)}"
        )
        try:
            response = self._execute_with_retry(
                self._client.models.generate_content,
                model=self.model_name,
                contents=prompt,
            )
            raw = response.text.strip()
            # Clean markdown codeblocks if returned
            if raw.startswith("```"):
                lines = raw.splitlines()
                raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
            data = json.loads(raw)
            result_map = {item["id"]: item.get("translated_text", "") for item in data}
            return [result_map.get(i, f"[{target_lang}] {texts[i]}") for i in range(len(texts))]
        except Exception as e:
            logger.error(f"Gemini batch translation failed: {e}. Falling back to individual mock format.")
            return [f"[{target_lang}] {t}" for t in texts]

    def transcribe(self, file_path: str, lang_hint: Optional[str] = None) -> str:
        """Transcribes an audio file into text."""
        if self.ai_mode == "mock" or not self._client:
            return "(voice note, mock transcript)"

        try:
            from google.genai import types
            with open(file_path, "rb") as f:
                audio_bytes = f.read()

            hint_text = f" Language hint: {lang_hint}." if lang_hint else ""
            prompt = (
                f"Transcribe the spoken speech in this audio accurately into text.{hint_text} "
                f"Return ONLY the transcription text with no additional commentary."
            )
            part = types.Part.from_bytes(data=audio_bytes, mime_type="audio/wav")
            response = self._execute_with_retry(
                self._client.models.generate_content,
                model=self.model_name,
                contents=[part, prompt],
            )
            return response.text.strip() if response and response.text else "(voice note, mock transcript)"
        except Exception as e:
            logger.error(f"Gemini audio transcription failed: {e}. Falling back to mock format.")
            return "(voice note, mock transcript)"

    def generate_farmer_summary(
        self,
        crop: str,
        approved_actions: List[str],
        final_suggestion: Optional[str],
        lang: str = "en"
    ) -> str:
        """
        Rewrites approved advice in simple words, max 120 words, in the farmer's language.
        """
        if self.ai_mode == "mock" or not self._client:
            actions_text = "; ".join(approved_actions) if approved_actions else "Follow standard agronomic practices"
            sugg_text = f" Note: {final_suggestion}" if final_suggestion else ""
            mock_text = f"For your {crop}: {actions_text}.{sugg_text} Apply as recommended for healthy crop recovery."
            if lang != "en":
                return f"[{lang}] {mock_text}"
            return mock_text

        prompt = (
            f"You are a friendly agricultural advisor. Rewrite the following approved advice for a farmer "
            f"growing {crop} using simple, empathetic language without complex jargon. "
            f"Target language: {'Hindi' if lang == 'hi' else 'Kannada' if lang == 'kn' else 'English'}. "
            f"Length: MAXIMUM 120 words.\n\n"
            f"Approved Recommendations:\n" + "\n".join(f"- {a}" for a in approved_actions) + "\n"
            f"Expert's Personal Note: {final_suggestion or 'None'}\n\n"
            f"Summary in farmer's language:"
        )
        try:
            response = self._execute_with_retry(
                self._client.models.generate_content,
                model=self.model_name,
                contents=prompt,
            )
            return response.text.strip() if response and response.text else (
                f"[{lang}] Treatment approved for {crop}: {', '.join(approved_actions)}"
            )
        except Exception as e:
            logger.error(f"Gemini farmer summary generation failed: {e}. Falling back to template.")
            return f"[{lang}] Treatment approved for {crop}: {', '.join(approved_actions)}"


_gemini_client = GeminiClient()

def get_gemini_client() -> GeminiClient:
    return _gemini_client
