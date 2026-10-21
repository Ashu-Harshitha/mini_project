import os
import html
from typing import Tuple, Dict, Any, List
from collections import defaultdict
from app.core.config import settings

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")

ALL_EVENTS: List[str] = [
    "case_assigned",
    "case_reassigned",
    "case_decision",
    "new_message",
    "feedback_received",
    "unassigned_alert",
    "feedback_reminder",
    "weather_alert",
    "outbreak_detected",
]

ALL_LANGS: List[str] = ["en", "hi", "kn"]


class SafeDict(defaultdict):
    """Dictionary that returns empty string or placeholder for missing format keys."""
    def __missing__(self, key):
        return f"{{{key}}}"


def get_template_path(event: str, lang: str) -> str:
    lang_code = lang.lower() if lang else "en"
    if lang_code not in ALL_LANGS:
        lang_code = "en"
    return os.path.join(TEMPLATES_DIR, f"{event}.{lang_code}.txt")


def validate_all_templates_exist() -> None:
    """
    Test helper: ensures every required event has templates for en, hi, and kn.
    Raises FileNotFoundError if any template is missing.
    """
    missing = []
    for event in ALL_EVENTS:
        for lang in ALL_LANGS:
            path = get_template_path(event, lang)
            if not os.path.exists(path):
                missing.append(f"{event}.{lang}.txt")
    if missing:
        raise FileNotFoundError(f"Missing notification templates: {', '.join(missing)}")


def render_template(event: str, lang: str, payload: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Renders the template for the given event and language using str.format.
    Returns (subject, plain_text_body, html_body).
    """
    path = get_template_path(event, lang)
    if not os.path.exists(path):
        # Fallback to English if requested language is missing
        path = get_template_path(event, "en")

    if not os.path.exists(path):
        # Ultimate fallback
        title = payload.get("title", f"Notification: {event}")
        message = payload.get("message", "New notification received.")
        return title, message, f"<html><body><p>{html.escape(message)}</p></body></html>"

    with open(path, "r", encoding="utf-8") as f:
        raw_text = f.read()

    # Prepare format variables
    format_vars = dict(payload)
    case_id = payload.get("case_id") or payload.get("id")
    if case_id and "case_url" not in format_vars:
        format_vars["case_url"] = f"{settings.FRONTEND_URL}/cases/{case_id}"
    elif "case_url" not in format_vars:
        format_vars["case_url"] = settings.FRONTEND_URL

    format_vars.setdefault("case_number", str(case_id or ""))
    format_vars.setdefault("agronomist_name", "Agronomist")
    format_vars.setdefault("sender_name", "User")
    format_vars.setdefault("decision", "Approved")
    format_vars.setdefault("rating", "5")
    format_vars.setdefault("outcome", "Improved")
    format_vars.setdefault("condition", "Adverse weather")
    format_vars.setdefault("pest", "Pest/Disease")
    format_vars.setdefault("crop", "Crop")
    format_vars.setdefault("location", "Your region")

    safe_payload = SafeDict(str, **format_vars)
    rendered = raw_text.format_map(safe_payload)

    # Parse Subject and Body
    lines = rendered.strip().splitlines()
    subject = "Notification"
    body_lines = []

    if lines and lines[0].startswith("Subject:"):
        subject = lines[0][len("Subject:"):].strip()
        body_lines = lines[1:]
    elif lines:
        subject = lines[0].strip()
        body_lines = lines[1:]

    plain_body = "\n".join(body_lines).strip()
    escaped_body = html.escape(plain_body).replace("\n", "<br/>")
    html_body = f"<!DOCTYPE html><html><body><p>{escaped_body}</p></body></html>"

    return subject, plain_body, html_body
