import os
import time
import json
import logging
import hashlib
import threading
from typing import List, Optional, Dict, Any, Type, TypeVar, Union
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.models import LLMCall

logger = logging.getLogger("agriadvisor.gemini")

T = TypeVar("T", bound=BaseModel)


class QuotaExceededError(Exception):
    """Raised when Gemini API quota or rate limit is exhausted after max retries."""
    pass


class RateLimiter:
    """Thread-safe sliding window rate limiter."""
    def __init__(self, max_rpm: int = 8):
        self.max_rpm = max(1, max_rpm)
        self.interval = 60.0
        self.timestamps = []
        self.lock = threading.Lock()

    def acquire(self):
        with self.lock:
            now = time.time()
            # Purge timestamps older than 60s
            self.timestamps = [t for t in self.timestamps if now - t < self.interval]
            if len(self.timestamps) >= self.max_rpm:
                sleep_time = self.interval - (now - self.timestamps[0]) + 0.05
                if sleep_time > 0:
                    logger.info(f"Gemini rate limit reached ({self.max_rpm} RPM). Waiting {sleep_time:.2f}s...")
                    time.sleep(sleep_time)
                now = time.time()
                self.timestamps = [t for t in self.timestamps if now - t < self.interval]
            self.timestamps.append(time.time())


def compute_cache_key(model: str, step: str, prompt_version: int, canonical_inputs: Any) -> str:
    """Computes sha256(model + step + prompt_version + canonical inputs)."""
    canonical_str = json.dumps(canonical_inputs, sort_keys=True, default=str)
    raw_key = f"{model}:{step}:{prompt_version}:{canonical_str}"
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


class GeminiClient:
    """
    Shared Gemini wrapper using google-genai SDK with:
    - Structured JSON output validated by Pydantic
    - Global rate limiter (GEMINI_MAX_RPM, default 8)
    - Retries with exponential backoff (max 4) on 429/503, raising QuotaExceededError on exhaustion
    - Response CACHE in the llm_calls table keyed by cache_key
    - Call logging into llm_calls (case_id, step, prompt_version, model, tokens_in, tokens_out, latency_ms, output_json)
    """
    def __init__(self):
        self.ai_mode = settings.AI_MODE.lower()
        self.api_key = settings.GEMINI_API_KEY
        self._model_name = settings.GEMINI_MODEL or "gemini-2.5-flash-lite"
        self.rate_limiter = RateLimiter(max_rpm=settings.GEMINI_MAX_RPM)
        self._client = None

    @property
    def model_name(self) -> str:
        try:
            from app.core.database import SessionLocal
            from app.models.models import SystemSetting
            with SessionLocal() as db:
                setting = db.query(SystemSetting).filter(SystemSetting.key == "active_model").first()
                if setting and isinstance(setting.value, dict) and setting.value.get("model"):
                    return setting.value["model"]
                elif setting and isinstance(setting.value, str):
                    return setting.value
        except Exception:
            pass
        return getattr(self, "_model_name", settings.GEMINI_MODEL or "gemini-2.5-flash-lite")

    @model_name.setter
    def model_name(self, value: str):
        self._model_name = value


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
        """
        Executes a callable with rate limiting and exponential backoff on 429/503.
        Max 4 retries, then raises QuotaExceededError.
        """
        max_retries = 4
        backoff = 1.0
        last_error = None

        for attempt in range(max_retries + 1):
            self.rate_limiter.acquire()
            try:
                return fn(*args, **kwargs)
            except Exception as e:
                last_error = e
                err_str = str(e).lower()
                is_transient = (
                    "429" in err_str
                    or "503" in err_str
                    or "quota" in err_str
                    or "resource_exhausted" in err_str
                    or "rate limit" in err_str
                    or "unavailable" in err_str
                )
                if is_transient and attempt < max_retries:
                    logger.warning(
                        f"Gemini API transient/quota error: {e}. Retrying in {backoff}s (attempt {attempt+1}/{max_retries})..."
                    )
                    time.sleep(backoff)
                    backoff *= 2.0
                elif is_transient:
                    logger.error(f"Gemini API retries exhausted ({max_retries}): {e}")
                    raise QuotaExceededError(f"Gemini quota/rate limit exceeded after {max_retries} retries: {e}") from e
                else:
                    raise

        raise QuotaExceededError(f"Gemini quota exceeded after retries: {last_error}")

    def generate_structured(
        self,
        step: str,
        prompt: str,
        response_schema: Type[T],
        case_id: Optional[int] = None,
        prompt_version: int = 1,
        canonical_inputs: Optional[Dict[str, Any]] = None,
        images: Optional[List[Union[bytes, str]]] = None,
        db: Optional[Session] = None,
    ) -> T:
        """
        Structured JSON output validated by Pydantic (response_mime_type="application/json", response_schema).
        Caches responses in llm_calls table. Cache hits make no API call.
        Every real call is logged.
        """
        # 1. Build canonical input representation with images represented by sha256
        inputs_for_hash = dict(canonical_inputs or {})
        inputs_for_hash["prompt"] = prompt

        image_hashes = []
        image_parts = []
        if images:
            from google.genai import types
            for img in images:
                if isinstance(img, str) and os.path.exists(img):
                    with open(img, "rb") as f:
                        img_bytes = f.read()
                    mime = "image/png" if img.lower().endswith(".png") else "image/jpeg"
                    image_hashes.append(hashlib.sha256(img_bytes).hexdigest())
                    image_parts.append(types.Part.from_bytes(data=img_bytes, mime_type=mime))
                elif isinstance(img, bytes):
                    image_hashes.append(hashlib.sha256(img).hexdigest())
                    image_parts.append(types.Part.from_bytes(data=img, mime_type="image/jpeg"))
                elif isinstance(img, str):
                    # string token or path that doesn't exist
                    image_hashes.append(hashlib.sha256(img.encode("utf-8")).hexdigest())
        inputs_for_hash["image_hashes"] = image_hashes

        cache_key = compute_cache_key(self.model_name, step, prompt_version, inputs_for_hash)

        # 2. Check Cache
        session = db or SessionLocal()
        should_close_session = (db is None)

        try:
            cached_call = session.query(LLMCall).filter(LLMCall.cache_key == cache_key).first()
            if cached_call:
                logger.info(f"LLM cache HIT for step='{step}', cache_key='{cache_key}'")
                return response_schema.model_validate(cached_call.output_json)

            logger.info(f"LLM cache MISS for step='{step}', cache_key='{cache_key}'. Making API call...")

            # 3. Handle Mock Mode fallback if real client not available
            if self.ai_mode == "mock" or not self._client:
                # In mock mode, construct a default instance if schema allows or minimal dict
                mock_json = self._build_mock_response(step, response_schema)
                validated = response_schema.model_validate(mock_json)
                
                # Persist to llm_calls cache
                llm_row = LLMCall(
                    case_id=case_id,
                    step=step,
                    prompt_version=prompt_version,
                    model="mock-gemini",
                    tokens_in=10,
                    tokens_out=25,
                    latency_ms=5,
                    output_json=validated.model_dump(),
                    cache_key=cache_key,
                )
                session.add(llm_row)
                session.commit()
                return validated

            # 4. Real Gemini API Call with Structured JSON
            from google.genai import types

            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=response_schema,
            )

            contents = []
            if image_parts:
                contents.extend(image_parts)
            contents.append(prompt)

            start_t = time.time()
            response = self._execute_with_retry(
                self._client.models.generate_content,
                model=self.model_name,
                contents=contents,
                config=config,
            )
            latency_ms = int((time.time() - start_t) * 1000)

            raw_text = response.text.strip() if response and response.text else "{}"
            if raw_text.startswith("```"):
                lines = raw_text.splitlines()
                raw_text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

            output_dict = json.loads(raw_text)
            validated = response_schema.model_validate(output_dict)

            tokens_in = 0
            tokens_out = 0
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                tokens_in = getattr(response.usage_metadata, "prompt_token_count", 0) or 0
                tokens_out = getattr(response.usage_metadata, "candidates_token_count", 0) or 0

            # 5. Log and cache in llm_calls table
            llm_row = LLMCall(
                case_id=case_id,
                step=step,
                prompt_version=prompt_version,
                model=self.model_name,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                latency_ms=latency_ms,
                output_json=validated.model_dump(),
                cache_key=cache_key,
            )
            session.add(llm_row)
            session.commit()

            return validated

        finally:
            if should_close_session:
                session.close()

    def generate_structured_from_image(
        self,
        prompt: str,
        image_bytes: bytes,
        mime_type: str = "image/png",
    ) -> List[Dict[str, Any]]:
        """
        Extracts structured JSON table rows from an image using Gemini.
        Returns list of row dicts.
        """
        if self.ai_mode == "mock" or not self._client:
            return []
        try:
            from google.genai import types
            image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
            )
            response = self._execute_with_retry(
                self._client.models.generate_content,
                model=self.model_name,
                contents=[image_part, prompt],
                config=config,
            )
            raw_text = response.text.strip() if response and response.text else "[]"
            if raw_text.startswith("```"):
                lines = raw_text.splitlines()
                raw_text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
            data = json.loads(raw_text)
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                for k in ("readings", "rows", "data"):
                    if isinstance(data.get(k), list):
                        return data[k]
            return []
        except Exception as e:
            logger.warning(f"generate_structured_from_image failed: {e}")
            return []

    def _build_mock_response(self, step: str, response_schema: Type[T]) -> Dict[str, Any]:
        """Provides realistic mock structured output matching required response schema."""
        if step == "image_analysis":
            return {
                "observations": [
                    {
                        "text": "Interveinal chlorosis visible on lower leaves",
                        "confidence": 78.0,
                        "note": "Visible evidence only",
                    },
                    {
                        "text": "Yellowing pattern consistent with N or S deficiency",
                        "confidence": 65.0,
                        "note": "Texture artifacts reduce certainty",
                    },
                    {
                        "text": "No visible lesions, spots, or pest damage",
                        "confidence": 91.0,
                        "note": "High confidence — clear negative",
                    },
                    {
                        "text": "Canopy density appears normal for V8 stage",
                        "confidence": 82.0,
                        "note": "Compared to reference imagery",
                    },
                ],
                "uncertainty_level": "Medium",
                "image_quality_notes": "Good focus and lighting on leaf canopy",
                "issue_hint": "nitrogen_deficiency",
            }
        elif step == "recommendation":
            return {
                "issue_label": "Nitrogen Deficiency chlorosis",
                "issue_category": "nitrogen_deficiency",
                "crop_recommendations": [
                    {
                        "action": "Perform in-field tissue nitrate test before rescue application",
                        "why": "Distinguish between nitrogen and sulfur deficiency under current vegetative stage.",
                        "evidence": "Interveinal chlorosis on lower leaves with marginal soil nitrate.",
                        "assumptions": "Agronomist can collect leaf samples within 48 hours.",
                        "model_confidence": 88.0,
                        "chunk_ids": [],
                    },
                    {
                        "action": "Scout neighboring field sectors for uniform discoloration",
                        "why": "Confirm if symptom is widespread or localized to drainage depressions.",
                        "evidence": "Visual yellowing patterns observed on lower leaves.",
                        "assumptions": "Field terrain allows vehicular or walking scouting.",
                        "model_confidence": 75.0,
                        "chunk_ids": [],
                    },
                    {
                        "action": "Verify planting date and hybrid nitrogen response curve",
                        "why": "Calibrate nutrient uptake rate against vegetative maturity index.",
                        "evidence": "Growth stage correlates with rapid vegetative nitrogen demand.",
                        "assumptions": "Seed hybrid documentation is on file.",
                        "model_confidence": 68.0,
                        "chunk_ids": [],
                    },
                ],
                "fertilizer_recommendations": [
                    {
                        "action": "Apply foliar urea solution at 20 lb N/ac",
                        "why": "Rapid canopy uptake to address acute nitrogen chlorosis at V8 rapid growth window.",
                        "evidence": "Soil nitrate testing marginal and yellowing leaves present.",
                        "assumptions": "Weather window is clear of imminent heavy downpours.",
                        "model_confidence": 82.0,
                        "chunk_ids": [],
                    },
                    {
                        "action": "Side-dress UAN 32% liquid nitrogen at 30 lb N/ac",
                        "why": "Replenish root zone nitrogen reservoir for upcoming reproductive tassel stage.",
                        "evidence": "Early season leaching risk reduced, crop entering high uptake.",
                        "assumptions": "Side-dress toolbar clearance is adequate for canopy height.",
                        "model_confidence": 74.0,
                        "chunk_ids": [],
                    },
                    {
                        "action": "Apply slow-release polymer-coated urea at 25 lb N/ac",
                        "why": "Mitigate leaching risk while supplying sustained nitrogen.",
                        "evidence": "Precipitation forecast shows variable moisture conditions.",
                        "assumptions": "Soil moisture is sufficient to initiate granule diffusion.",
                        "model_confidence": 62.0,
                        "chunk_ids": [],
                    },
                ],
                "irrigation_recommendations": [
                    {
                        "action": "Maintain soil moisture at 65% field capacity if soil moisture is depleted",
                        "why": "Adequate soil water is required to solubilize nitrate for root transpiration stream.",
                        "evidence": "Recent weather indicates moderate evapotranspiration.",
                        "assumptions": "Irrigation system is functional and calibrated.",
                        "model_confidence": 80.0,
                        "chunk_ids": [],
                    },
                    {
                        "action": "Inspect soil moisture before applying next irrigation cycle",
                        "why": "Avoid over-irrigation that leaches mobile nitrate past the active root zone.",
                        "evidence": "Precipitation events forecast within 5-7 days.",
                        "assumptions": "Moisture probe or hand-feel test available.",
                        "model_confidence": 70.0,
                        "chunk_ids": [],
                    },
                    {
                        "action": "Schedule fertigation with 10 lb N/ac if irrigation runs this week",
                        "why": "Combine water delivery with micro-dosing of soluble nitrogen.",
                        "evidence": "Fertigation injector port available on center pivot.",
                        "assumptions": "Backflow preventer is certified.",
                        "model_confidence": 60.0,
                        "chunk_ids": [],
                    },
                ],
            }
        elif step == "soil_pdf":
            return {
                "n_ppm": 18.0,
                "p_ppm": 24.0,
                "k_ppm": 170.0,
                "ph": 6.4,
                "sample_date": "2026-05-12",
                "needs_confirmation": False,
            }
        elif step == "groundedness_judge":
            return {
                "score": 0.95,
                "unsupported_claims": [],
            }
        return {}



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
