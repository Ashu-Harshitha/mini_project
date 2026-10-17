"""
AgriAdvisor AI Notification Dispatcher.

Handles in-app notification persistence and triggers channel stubs
(email, SMS, WhatsApp) which currently log the payload.
Supported events:
  - high_risk_flag
  - review_required
  - case_approved
  - feedback_reminder
"""

import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.models import Notification, User

logger = logging.getLogger("agriadvisor.notifications")


# Channel stubs that log
def send_email_stub(to_email: str, subject: str, body: str):
    logger.info(f"[EMAIL STUB] To: {to_email} | Subject: {subject} | Body: {body}")


def send_sms_stub(phone: str, message: str):
    logger.info(f"[SMS STUB] To: {phone} | Message: {message}")


def send_whatsapp_stub(phone: str, message: str):
    logger.info(f"[WHATSAPP STUB] To: {phone} | Message: {message}")


EVENT_TEMPLATES = {
    "high_risk_flag": {
        "title": "High-Risk Chemical Alert",
        "message_fn": lambda p: f"High-risk safety flag triggered in Case {p.get('case_number', '')}: {p.get('reason', 'Restricted chemical input flagged.')}",
    },
    "review_required": {
        "title": "Agronomist Review Required",
        "message_fn": lambda p: f"Case {p.get('case_number', '')} ({p.get('crop', '')}) has completed AI analysis and requires expert validation.",
    },
    "case_approved": {
        "title": "Recommendations Approved",
        "message_fn": lambda p: f"Case {p.get('case_number', '')} recommendations were approved by {p.get('reviewer_name', 'Agronomist')} and are ready for field implementation.",
    },
    "feedback_reminder": {
        "title": "Post-Harvest Outcome Reminder",
        "message_fn": lambda p: f"Please record the treatment outcome and actual harvest yield for Case {p.get('case_number', '')}.",
    },
}


def notify(
    event: str,
    user: User,
    payload: Dict[str, Any],
    db: Session,
    case_id: Optional[int] = None,
) -> Notification:
    """
    Creates an in-app notification record and dispatches alerts to external channel stubs.
    """
    tmpl = EVENT_TEMPLATES.get(event, {
        "title": f"Notification: {event}",
        "message_fn": lambda p: p.get("message", "New notification received."),
    })

    title = payload.get("title") or tmpl["title"]
    message = payload.get("message") or tmpl["message_fn"](payload)

    # 1. Create in-app notification
    notif = Notification(
        user_id=user.id,
        event=event,
        title=title,
        message=message,
        channel="in_app",
        is_read=False,
        case_id=case_id or payload.get("case_id"),
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    # 2. Trigger channel stubs
    send_email_stub(user.email, title, message)
    send_sms_stub("+15155550199", f"{title}: {message}")
    send_whatsapp_stub("+15155550199", f"{title}: {message}")

    return notif
