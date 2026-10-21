"""
AgriAdvisor AI Notification Dispatcher.

Handles in-app notification persistence and triggers channel dispatches
(email, WhatsApp, SMS) with user channel preference enforcement, retries,
and provider status tracking.
"""

import re
import time
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any
import httpx
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.models.models import Notification, User
from app.core.config import settings
from app.core.database import SessionLocal
from app.notifications.templates import render_template

logger = logging.getLogger("agriadvisor.notifications")

# Configurable retry delay (can be set to 0.0 in tests for fast execution)
RETRY_DELAY_SECONDS = 5.0


def normalize_phone(phone: Optional[str], default_country_code: str = "+91") -> Optional[str]:
    """
    Normalizes a phone number to E.164 format.
    Adds default country code if missing.
    """
    if not phone or not phone.strip():
        return None
    cleaned = re.sub(r"[^\d+]", "", phone.strip())
    if not cleaned:
        return None

    cc = default_country_code.strip() if default_country_code else "+91"
    if not cc.startswith("+"):
        cc = f"+{cc}"

    if cleaned.startswith("+"):
        return cleaned

    # Strip leading zeros
    cleaned = cleaned.lstrip("0")
    return f"{cc}{cleaned}"


def sanitize_secrets(msg: str) -> str:
    """Removes tokens, passwords and secret keys from error strings."""
    if not msg:
        return ""
    secrets_to_scrub = [
        settings.SMTP_PASSWORD,
        settings.TWILIO_AUTH_TOKEN,
        settings.TWILIO_ACCOUNT_SID,
        settings.GEMINI_API_KEY,
    ]
    sanitized = str(msg)
    for s in secrets_to_scrub:
        if s and len(s) > 3 and s in sanitized:
            sanitized = sanitized.replace(s, "***")
    return sanitized


def send_email_provider(to_email: str, subject: str, plain_body: str, html_body: str) -> None:
    """Sends email via smtplib STARTTLS with plain + HTML alternative parts."""
    if not (settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD):
        raise ValueError("SMTP provider not configured")

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.EMAIL_FROM or settings.SMTP_USER
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(plain_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
    try:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
        logger.info(f"[EMAIL SENT] Successfully sent email to {to_email}")
    finally:
        try:
            server.quit()
        except Exception:
            pass


def send_whatsapp_provider(phone: str, body: str) -> None:
    """Sends WhatsApp message via Twilio REST API."""
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_WHATSAPP_FROM):
        raise ValueError("Twilio WhatsApp provider not configured")

    norm_phone = normalize_phone(phone, settings.DEFAULT_COUNTRY_CODE)
    if not norm_phone:
        raise ValueError("Invalid recipient phone number")

    to_whatsapp = f"whatsapp:{norm_phone}"
    from_whatsapp = settings.TWILIO_WHATSAPP_FROM
    if not from_whatsapp.startswith("whatsapp:"):
        from_whatsapp = f"whatsapp:{from_whatsapp}"

    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(
            url,
            auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            data={"From": from_whatsapp, "To": to_whatsapp, "Body": body},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Twilio error {resp.status_code}: {resp.text}")
        logger.info(f"[WHATSAPP SENT] Successfully sent WhatsApp message to {norm_phone}")


def send_sms_provider(phone: str, body: str) -> None:
    """Sends SMS message if SMS_ENABLED is true and Twilio is configured, else logs stub."""
    if not settings.SMS_ENABLED:
        logger.info(f"[SMS STUB] To: {phone} | {body}")
        raise ValueError("SMS is disabled")

    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN):
        raise ValueError("Twilio SMS provider not configured")

    norm_phone = normalize_phone(phone, settings.DEFAULT_COUNTRY_CODE)
    if not norm_phone:
        raise ValueError("Invalid recipient phone number")

    from_number = settings.TWILIO_WHATSAPP_FROM.replace("whatsapp:", "")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(
            url,
            auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            data={"From": from_number, "To": norm_phone, "Body": body},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Twilio error {resp.status_code}: {resp.text}")
        logger.info(f"[SMS SENT] Successfully sent SMS to {norm_phone}")


def dispatch_channel(
    channel: str,
    user: User,
    subject: str,
    plain_body: str,
    html_body: str,
    event: str,
    case_id: Optional[int],
    db: Session,
) -> Notification:
    """
    Executes channel dispatch with retry (retry once after RETRY_DELAY_SECONDS),
    skips when unconfigured or user opted out, and records a Notification row.
    """
    prefs = user.channel_prefs or {"email": True, "whatsapp": False, "sms": False}
    channel_enabled = bool(prefs.get(channel, False if channel != "email" else True))

    status = "sent"
    error_msg: Optional[str] = None
    attempts = 0

    # 1. Check user preference opt-out
    if not channel_enabled:
        status = "skipped"
        error_msg = f"User opted out of {channel}"
    # 2. Check contact info and provider configuration
    elif channel == "email":
        if not user.email or not user.email.strip():
            status = "skipped"
            error_msg = "No recipient email address"
        elif not (settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD):
            status = "skipped"
            error_msg = "SMTP provider not configured"
    elif channel == "whatsapp":
        if not user.phone or not user.phone.strip():
            status = "skipped"
            error_msg = "No recipient phone number"
        elif not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_WHATSAPP_FROM):
            status = "skipped"
            error_msg = "Twilio WhatsApp provider not configured"
    elif channel == "sms":
        if not user.phone or not user.phone.strip():
            status = "skipped"
            error_msg = "No recipient phone number"
        elif not settings.SMS_ENABLED:
            status = "skipped"
            error_msg = "SMS is disabled"
        elif not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN):
            status = "skipped"
            error_msg = "Twilio SMS provider not configured"

    # 3. If ready, dispatch with 1 retry on failure
    if status != "skipped":
        for attempt in range(1, 3):
            attempts = attempt
            try:
                if channel == "email":
                    send_email_provider(user.email, subject, plain_body, html_body)
                elif channel == "whatsapp":
                    send_whatsapp_provider(user.phone, f"{subject}\n\n{plain_body}")
                elif channel == "sms":
                    send_sms_provider(user.phone, f"{subject}: {plain_body}")
                status = "sent"
                error_msg = None
                break
            except Exception as ex:
                status = "failed"
                error_msg = sanitize_secrets(str(ex))
                if attempt == 1 and RETRY_DELAY_SECONDS > 0:
                    time.sleep(RETRY_DELAY_SECONDS)

    # 4. Record channel notification row
    record = Notification(
        user_id=user.id,
        event=event,
        title=subject,
        message=plain_body,
        channel=channel,
        status=status,
        error=error_msg,
        attempts=attempts,
        is_read=False,
        case_id=case_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def dispatch_external_channels_worker(
    user_id: int,
    event: str,
    payload: Dict[str, Any],
    case_id: Optional[int],
) -> None:
    """Background worker that dispatches email, whatsapp, and sms for a user."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return

        lang = user.language if user.language in ("en", "hi", "kn") else "en"
        subject, plain_body, html_body = render_template(event, lang, payload)

        for channel in ("email", "whatsapp", "sms"):
            try:
                dispatch_channel(channel, user, subject, plain_body, html_body, event, case_id, db)
            except Exception as e:
                logger.error(f"Error dispatching {channel} notification: {sanitize_secrets(str(e))}")
    finally:
        db.close()


def notify(
    event: str,
    user: User,
    payload: Dict[str, Any],
    db: Session,
    case_id: Optional[int] = None,
    background_tasks: Optional[BackgroundTasks] = None,
) -> Notification:
    """
    Creates an in-app notification record and dispatches alerts to external channels.
    The in-app row is ALWAYS written first.
    External sends run in BackgroundTasks (or sync worker if background_tasks is None),
    retry once after 5 s, record status and error per channel, and NEVER break the main request.
    """
    lang = user.language if user.language in ("en", "hi", "kn") else "en"
    subject, plain_body, html_body = render_template(event, lang, payload)

    cid = case_id or payload.get("case_id") or payload.get("id")

    # 1. ALWAYS write the in-app row first
    in_app_notif = Notification(
        user_id=user.id,
        event=event,
        title=subject,
        message=plain_body,
        channel="in_app",
        status="sent",
        error=None,
        attempts=1,
        is_read=False,
        case_id=cid,
    )
    db.add(in_app_notif)
    db.commit()
    db.refresh(in_app_notif)

    # 2. Trigger external channels in background or sync fallback
    try:
        if background_tasks is not None:
            background_tasks.add_task(
                dispatch_external_channels_worker,
                user.id,
                event,
                payload,
                cid,
            )
        else:
            for channel in ("email", "whatsapp", "sms"):
                try:
                    dispatch_channel(channel, user, subject, plain_body, html_body, event, cid, db)
                except Exception as e:
                    logger.error(f"Error dispatching {channel} notification: {sanitize_secrets(str(e))}")
    except Exception as e:
        logger.warning(f"Could not queue external notification channels: {sanitize_secrets(str(e))}")

    return in_app_notif

