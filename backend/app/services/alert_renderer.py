import os
import yaml
from typing import Dict, Any, List
from collections import defaultdict

TEMPLATES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "alerts",
    "templates.yaml",
)

ALL_RULES = [
    "heavy_rain",
    "heat_stress",
    "frost_risk",
    "strong_wind",
    "dry_spell",
    "disease_pressure",
    "sensor_dry_soil",
    "sensor_fungal_pressure",
    "sensor_heat_stress",
]

SUPPORTED_LANGUAGES = ["en", "hi", "kn"]

_TEMPLATES_CACHE: Dict[str, Any] = {}


class SafeFormatter(defaultdict):
    """Dictionary that returns empty string or placeholder for missing format keys."""
    def __missing__(self, key):
        return f"{{{key}}}"


def load_templates() -> Dict[str, Any]:
    """Loads alert templates from templates.yaml."""
    global _TEMPLATES_CACHE
    if not _TEMPLATES_CACHE:
        if os.path.exists(TEMPLATES_PATH):
            with open(TEMPLATES_PATH, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                _TEMPLATES_CACHE = data.get("rules", {})
        else:
            _TEMPLATES_CACHE = {}
    return _TEMPLATES_CACHE


def validate_all_alert_templates_exist() -> None:
    """
    Validates that every rule has templates for 'en', 'hi', and 'kn',
    and that each language defines 'title', 'message', and 'action'.
    Raises ValueError if anything is missing.
    """
    templates = load_templates()
    missing: List[str] = []

    for rule in ALL_RULES:
        rule_dict = templates.get(rule)
        if not rule_dict:
            missing.append(f"Rule missing completely: {rule}")
            continue
        for lang in SUPPORTED_LANGUAGES:
            lang_dict = rule_dict.get(lang)
            if not lang_dict:
                missing.append(f"{rule} missing language '{lang}'")
                continue
            for field in ("title", "message", "action"):
                val = lang_dict.get(field)
                if not val or not str(val).strip():
                    missing.append(f"{rule}.{lang} missing field '{field}'")

    if missing:
        raise ValueError(f"Alert templates validation failed:\n" + "\n".join(missing))


def render_alert(rule: str, lang: str, params: Dict[str, Any]) -> Dict[str, str]:
    """
    Renders title, message, and action for a given alert rule, language, and parameters.
    Falls back to 'en' if requested language is unsupported or missing.
    No LLM is used.
    """
    templates = load_templates()
    rule_data = templates.get(rule, {})
    
    clean_lang = (lang or "en").lower().strip()
    if clean_lang not in SUPPORTED_LANGUAGES:
        clean_lang = "en"
    
    lang_data = rule_data.get(clean_lang) or rule_data.get("en", {})
    
    safe_params = SafeFormatter(str, **{k: (v if v is not None else "") for k, v in (params or {}).items()})

    raw_title = lang_data.get("title", rule.replace("_", " ").title())
    raw_message = lang_data.get("message", "Adverse condition detected.")
    raw_action = lang_data.get("action", "Monitor field closely.")

    try:
        title = raw_title.format_map(safe_params)
    except Exception:
        title = raw_title

    try:
        message = raw_message.format_map(safe_params)
    except Exception:
        message = raw_message

    try:
        action = raw_action.format_map(safe_params)
    except Exception:
        action = raw_action

    return {
        "title": title,
        "message": message,
        "action": action,
    }
