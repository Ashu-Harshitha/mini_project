"""
AgriAdvisor AI Notification Dispatcher.

Handles in-app notification persistence and triggers channel dispatches
(email, SMS, WhatsApp) with SMTP support when configured.
Supported events:
  - high_risk_flag
  - review_required
  - case_approved
  - feedback_reminder
  - case_assigned
  - case_reassigned
  - case_decision
  - new_message
  - feedback_received
  - unassigned_alert
"""

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.models import Notification, User
from app.core.config import settings

logger = logging.getLogger("agriadvisor.notifications")


def send_email(to_email: Optional[str], subject: str, body: str):
    if not to_email or not to_email.strip():
        return

    if settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD:
        try:
            msg = MIMEMultipart()
            msg["From"] = settings.EMAIL_FROM or settings.SMTP_USER
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))

            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
            server.quit()
            logger.info(f"[EMAIL SENT] Successfully sent email to {to_email}")
        except Exception as e:
            logger.warning(f"[EMAIL FAILED] Could not send email to {to_email}: {e}")
    else:
        logger.info(f"[EMAIL STUB] To: {to_email} | Subject: {subject} | Body: {body}")


def send_sms_stub(phone: Optional[str], message: str):
    logger.info(f"[SMS STUB] To: {phone or 'N/A'} | Message: {message}")


def send_whatsapp_stub(phone: Optional[str], message: str):
    logger.info(f"[WHATSAPP STUB] To: {phone or 'N/A'} | Message: {message}")


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
    "case_assigned": {
        "title": "Case Assigned",
        "message_fn": lambda p: p.get("message") or f"Case {p.get('case_number', '')} has been assigned for review.",
    },
    "case_reassigned": {
        "title": "Case Reassigned",
        "message_fn": lambda p: p.get("message") or f"Case {p.get('case_number', '')} has been reassigned to {p.get('agronomist_name', 'an agronomist')}.",
    },
    "case_decision": {
        "title": "Case Decision Ready",
        "message_fn": lambda p: f"A review decision ({p.get('decision', 'completed')}) was recorded for Case {p.get('case_number', '')}.",
    },
    "new_message": {
        "title": "New Message",
        "message_fn": lambda p: f"New message from {p.get('sender_name', 'user')} on Case {p.get('case_number', '')}.",
    },
    "feedback_received": {
        "title": "Feedback Received",
        "message_fn": lambda p: f"Farmer feedback received for Case {p.get('case_number', '')}: {p.get('rating', 5)}/5 stars.",
    },
    "unassigned_alert": {
        "title": "Alert: Unassigned Case",
        "message_fn": lambda p: f"Case {p.get('case_number', '')} has no eligible agronomist available and requires manual assignment.",
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
    Creates an in-app notification record and dispatches alerts to external channels.
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

    # 2. Trigger channels
    send_email(user.email, title, message)
    send_sms_stub(user.phone, f"{title}: {message}")
    send_whatsapp_stub(user.phone, f"{title}: {message}")

    return notif
