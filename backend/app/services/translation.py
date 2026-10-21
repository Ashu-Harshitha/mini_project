import os
import json
import logging
import yaml
from typing import List, Dict, Any, Optional

from app.core.config import settings
from app.services.ai.gemini_client import get_gemini_client

logger = logging.getLogger("agriadvisor.translation")

_GLOSSARY_CACHE: Optional[Dict[str, Any]] = None


def load_glossary() -> List[Dict[str, str]]:
    """Loads agricultural glossary from data/glossary.yaml."""
    global _GLOSSARY_CACHE
    if _GLOSSARY_CACHE is not None:
        return _GLOSSARY_CACHE

    glossary_path = os.path.join(settings.BASE_DIR if hasattr(settings, "BASE_DIR") else ".", "data", "glossary.yaml")
    if not os.path.exists(glossary_path):
        # Try backend/data/glossary.yaml relative to current working directory
        glossary_path = os.path.join("data", "glossary.yaml")

    if os.path.exists(glossary_path):
        try:
            with open(glossary_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                _GLOSSARY_CACHE = data.get("terms", [])
                return _GLOSSARY_CACHE
        except Exception as e:
            logger.warning(f"Failed to load glossary from {glossary_path}: {e}")

    return []


def format_glossary_for_prompt(target_lang: str) -> str:
    """Formats glossary terms into prompt instructions for target_lang."""
    terms = load_glossary()
    if not terms:
        return ""

    lines = []
    for item in terms:
        en_term = item.get("en")
        target_term = item.get(target_lang)
        if en_term and target_term:
            lines.append(f"- {en_term} -> {target_term}")

    if not lines:
        return ""

    return "Agricultural Glossary (use these exact terms where applicable):\n" + "\n".join(lines)


def batch_translate_texts(texts: List[str], target_lang: str) -> List[str]:
    """
    Translates a list of texts in ONE batched LLM call with agricultural glossary injection.
    In mock mode, returns texts prefixed with '[hi] ' or '[kn] '.
    """
    if not texts:
        return []
    if target_lang == "en":
        return texts

    client = get_gemini_client()
    if client.ai_mode == "mock" or not client._client:
        return [f"[{target_lang}] {t}" for t in texts]

    glossary_prompt = format_glossary_for_prompt(target_lang)
    lang_name = "Hindi" if target_lang == "hi" else "Kannada" if target_lang == "kn" else target_lang

    payload = [{"id": i, "text": t} for i, t in enumerate(texts)]
    prompt = (
        f"You are a professional agricultural translator translating farmer guidance into {lang_name}.\n"
        f"{glossary_prompt}\n\n"
        f"Translate each item in this JSON array accurately and clearly for farmers. "
        f"Return a strict JSON array of objects with 'id' and 'translated_text'. Output JSON only.\n\n"
        f"Input JSON: {json.dumps(payload, ensure_ascii=False)}"
    )

    try:
        response = client._execute_with_retry(
            client._client.models.generate_content,
            model=client.model_name,
            contents=prompt,
        )
        raw = response.text.strip() if response and response.text else "[]"
        if raw.startswith("```"):
            lines = raw.splitlines()
            raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        data = json.loads(raw)
        result_map = {item["id"]: item.get("translated_text", "") for item in data}
        return [result_map.get(i, f"[{target_lang}] {texts[i]}") for i in range(len(texts))]
    except Exception as e:
        logger.error(f"Batch translation with glossary failed: {e}. Falling back to mock format.")
        return [f"[{target_lang}] {t}" for t in texts]


def translate_report_body(body_json: Dict[str, Any], target_lang: str) -> Dict[str, Any]:
    """
    Translates an entire report body in ONE single batched call.
    body_json: {what_is_happening, next_steps: [{title, detail}], warnings: [...], reviewed_by, reviewed_at}
    """
    if target_lang == "en":
        return body_json

    # Collect texts
    what_happening = body_json.get("what_is_happening", "")
    next_steps = body_json.get("next_steps", [])
    warnings = body_json.get("warnings", [])

    texts_to_translate = [what_happening]
    for s in next_steps:
        texts_to_translate.append(s.get("title", ""))
        texts_to_translate.append(s.get("detail", ""))
    for w in warnings:
        texts_to_translate.append(w)

    translated_list = batch_translate_texts(texts_to_translate, target_lang)

    # Reconstruct
    idx = 0
    new_what_happening = translated_list[idx] if idx < len(translated_list) else what_happening
    idx += 1

    new_next_steps = []
    for s in next_steps:
        new_title = translated_list[idx] if idx < len(translated_list) else s.get("title", "")
        idx += 1
        new_detail = translated_list[idx] if idx < len(translated_list) else s.get("detail", "")
        idx += 1
        new_next_steps.append({
            "title": new_title,
            "detail": new_detail,
        })

    new_warnings = []
    for w in warnings:
        new_warn = translated_list[idx] if idx < len(translated_list) else w
        idx += 1
        new_warnings.append(new_warn)

    return {
        "what_is_happening": new_what_happening,
        "next_steps": new_next_steps,
        "warnings": new_warnings,
        "reviewed_by": body_json.get("reviewed_by", "Certified Agronomist"),
        "reviewed_at": body_json.get("reviewed_at", ""),
    }
