import datetime
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.models import Case, User, Notification, OutcomeFeedback, Review, Farm, Field
from app.services.case_state import CaseStateMachine, CaseState
from app.services.notifications import (
    notify,
    normalize_phone,
    sanitize_secrets,
)
import app.services.notifications as notif_module
from app.notifications.templates import validate_all_templates_exist, render_template
from app.services.feedback_reminders import check_and_send_feedback_reminders
from app.core.config import settings


@pytest.fixture(autouse=True)
def cleanup_overrides_and_fast_retry():
    # Set fast retry in tests
    original_retry = notif_module.RETRY_DELAY_SECONDS
    notif_module.RETRY_DELAY_SECONDS = 0.001
    yield
    notif_module.RETRY_DELAY_SECONDS = original_retry
    app.dependency_overrides.clear()


@pytest.fixture
def test_case(db, test_user, test_farm):
    c = Case(
        case_number="CASE-TEST-NOTIF-01",
        farm_id=test_farm.id,
        field_id=test_farm.fields[0].id,
        user_id=test_user.id,
        crop="Corn",
        growth_stage="Vegetative (V6)",
        status=CaseState.PENDING_REVIEW,
        confidence=85.0,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def make_auth_client(user: User, db=None):
    from app.api.deps import get_current_user
    from app.core.database import get_db
    app.dependency_overrides[get_current_user] = lambda: user
    if db is not None:
        def override_get_db():
            yield db
        app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)



def test_every_event_has_en_hi_kn_templates():
    """Validates that all required notification events exist in en, hi, and kn."""
    validate_all_templates_exist()

    # Test rendering each language
    for lang in ("en", "hi", "kn"):
        subject, plain, html = render_template(
            "case_assigned",
            lang,
            {"case_number": "CASE-101", "agronomist_name": "Dr. Rao", "case_id": 101},
        )
        assert len(subject) > 0
        assert "CASE-101" in subject or "CASE-101" in plain
        assert "http" in plain
        assert "<html>" in html


def test_phone_normalization():
    """Tests +E.164 phone normalization across formats."""
    assert normalize_phone("+919876543210") == "+919876543210"
    assert normalize_phone("9876543210", "+91") == "+919876543210"
    assert normalize_phone("09876543210", "+91") == "+919876543210"
    assert normalize_phone("+1 415 555-2671") == "+14155552671"
    assert normalize_phone("   ") is None
    assert normalize_phone(None) is None


def test_template_language_selection(db, test_user, test_agronomist, test_case):
    """Verifies that notification subject & body are rendered in the recipient's language."""
    test_user.language = "hi"
    db.commit()

    in_app = notify(
        "case_decision",
        test_user,
        {"case_number": test_case.case_number, "case_id": test_case.id, "decision": "स्वीकृत"},
        db,
        case_id=test_case.id,
    )

    assert in_app.channel == "in_app"
    # Hindi template for case_decision
    assert "मामला" in in_app.title or "समीक्षा" in in_app.title


def test_channel_preference_routing_and_opt_out(db, test_user, test_case):
    """Verifies that opted-out channels are marked as skipped."""
    test_user.channel_prefs = {"email": False, "whatsapp": False, "sms": False}
    test_user.email = "farmer@example.com"
    test_user.phone = "+919876543210"
    db.commit()

    notify(
        "case_assigned",
        test_user,
        {"case_number": test_case.case_number, "case_id": test_case.id},
        db,
        case_id=test_case.id,
    )

    # Check that in_app was created
    in_app = db.query(Notification).filter(
        Notification.user_id == test_user.id,
        Notification.channel == "in_app"
    ).first()
    assert in_app is not None

    # Check external records are skipped due to user opt-out
    skipped_records = db.query(Notification).filter(
        Notification.user_id == test_user.id,
        Notification.status == "skipped"
    ).all()
    assert len(skipped_records) >= 1
    assert any("opted out" in (r.error or "") for r in skipped_records)


def test_provider_skipped_when_unconfigured(db, test_user, test_case, monkeypatch):
    """Verifies that unconfigured providers mark records as skipped without raising."""
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "")
    test_user.channel_prefs = {"email": True, "whatsapp": True, "sms": False}
    test_user.email = "test@example.com"
    test_user.phone = "+919876543210"
    db.commit()

    in_app = notify(
        "case_assigned",
        test_user,
        {"case_number": test_case.case_number, "case_id": test_case.id},
        db,
        case_id=test_case.id,
    )
    assert in_app.channel == "in_app"
    assert in_app.status == "sent"

    email_rec = db.query(Notification).filter(
        Notification.user_id == test_user.id,
        Notification.channel == "email"
    ).order_by(Notification.id.desc()).first()
    assert email_rec is not None
    assert email_rec.status == "skipped"
    assert "not configured" in (email_rec.error or "")


def test_provider_failure_recorded_without_breaking_and_retries_once(db, test_user, test_case, monkeypatch):
    """
    Verifies that an external provider failure retries once, records status='failed'
    with sanitized error text, and does not break the in-app notification.
    """
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    monkeypatch.setattr(settings, "SMTP_USER", "mailer@example.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "super_secret_smtp_password")

    test_user.channel_prefs = {"email": True, "whatsapp": False, "sms": False}
    test_user.email = "test@example.com"
    db.commit()

    # Mock smtplib to always fail with a message containing secrets
    mock_smtp_inst = MagicMock()
    mock_smtp_inst.starttls.side_effect = Exception("Connection refused with password super_secret_smtp_password")

    with patch("smtplib.SMTP", return_value=mock_smtp_inst):
        in_app = notify(
            "case_decision",
            test_user,
            {"case_number": test_case.case_number, "case_id": test_case.id},
            db,
            case_id=test_case.id,
        )
        assert in_app.status == "sent"

    email_rec = db.query(Notification).filter(
        Notification.user_id == test_user.id,
        Notification.channel == "email"
    ).order_by(Notification.id.desc()).first()

    assert email_rec is not None
    assert email_rec.status == "failed"
    assert email_rec.attempts == 2  # Retried once
    assert "super_secret_smtp_password" not in (email_rec.error or "")
    assert "***" in (email_rec.error or "")


def test_farmers_cannot_read_other_users_notifications(db, test_user, test_agronomist):
    """Verifies that user B cannot read or mark as read user A's notifications."""
    notif = Notification(
        user_id=test_user.id,
        event="test_event",
        title="Private Notification",
        message="Only farmer can see",
        channel="in_app",
        status="sent",
        is_read=False,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    # Agronomist attempts to mark farmer's notification as read
    agro_client = make_auth_client(test_agronomist, db)
    resp = agro_client.patch(f"/v1/notifications/{notif.id}/read")
    assert resp.status_code == 403

    # Farmer marks their own notification
    farmer_client = make_auth_client(test_user, db)
    resp2 = farmer_client.patch(f"/v1/notifications/{notif.id}/read")
    assert resp2.status_code == 200
    assert resp2.json()["is_read"] is True


def test_reminders_survive_restart_and_stop_after_outcome(db, test_user, test_case):
    """
    Verifies that delivered cases with past-due reminders dispatch reminder 1 on rescan,
    and stop dispatching reminders once an outcome is reported.
    """
    # 1. Setup case as DELIVERED in the past
    test_case.status = CaseState.DELIVERED
    test_case.delivered_at = datetime.datetime.utcnow() - datetime.timedelta(days=10)
    test_case.feedback_reminders_sent = 0
    db.commit()

    # 2. Simulate startup scan
    sent = check_and_send_feedback_reminders(db)
    assert sent == 1
    db.refresh(test_case)
    assert test_case.feedback_reminders_sent == 1

    # 3. Report outcome on this case
    feedback = OutcomeFeedback(
        case_id=test_case.id,
        user_id=test_user.id,
        rating=5,
        followed_advice=True,
        outcome="improved",
        outcome_reported_at=datetime.datetime.utcnow(),
    )
    db.add(feedback)
    test_case.status = CaseState.OUTCOME_REPORTED
    db.commit()

    # 4. Advance time by 4 more days (would trigger reminder #2 if not stopped)
    future_time = datetime.datetime.utcnow() + datetime.timedelta(days=4)
    sent2 = check_and_send_feedback_reminders(db, now=future_time)
    assert sent2 == 0
    db.refresh(test_case)
    assert test_case.feedback_reminders_sent == 1


def test_outcome_endpoint_auth_and_state_change(db, test_user, test_agronomist, test_case):
    """Verifies authorization, state transitions, and idempotency of POST /cases/{id}/outcome."""
    # Move case to DELIVERED
    test_case.status = CaseState.DELIVERED
    test_case.delivered_at = datetime.datetime.utcnow()
    test_case.assigned_agronomist_id = test_agronomist.id
    db.commit()

    # 1. Other user cannot report outcome
    agro_client = make_auth_client(test_agronomist, db)
    bad_resp = agro_client.post(
        f"/v1/cases/{test_case.id}/outcome",
        json={"followed_advice": True, "outcome": "improved"},
    )
    assert bad_resp.status_code == 403

    # 2. Farmer reports outcome
    farmer_client = make_auth_client(test_user, db)
    good_resp = farmer_client.post(
        f"/v1/cases/{test_case.id}/outcome",
        json={"followed_advice": True, "outcome": "improved", "comment": "Corn greened up fast."},
    )
    assert good_resp.status_code == 200
    data = good_resp.json()
    assert data["case_status"] == CaseState.OUTCOME_REPORTED
    assert data["outcome"] == "improved"
    assert data["followed_advice"] is True

    # 3. Verify agronomist was notified
    agro_notif = db.query(Notification).filter(
        Notification.user_id == test_agronomist.id,
        Notification.event == "feedback_received",
    ).first()
    assert agro_notif is not None

    # 4. Reporting outcome a second time is rejected with 409 Conflict
    conflict_resp = farmer_client.post(
        f"/v1/cases/{test_case.id}/outcome",
        json={"followed_advice": True, "outcome": "same"},
    )
    assert conflict_resp.status_code in (400, 409)


def test_admin_notification_log_and_test_dispatch(db, test_admin):
    """Verifies admin notification log filtering and test notification dispatch."""
    admin_client = make_auth_client(test_admin, db)

    # 1. Send in_app test notification
    test_resp = admin_client.post(
        "/v1/admin/notifications/test",
        json={"channel": "in_app"},
    )
    assert test_resp.status_code == 200
    assert test_resp.json()["status"] == "sent"

    # 2. View notification log
    log_resp = admin_client.get("/v1/admin/notification-log?channel=in_app")
    assert log_resp.status_code == 200
    log_data = log_resp.json()
    assert log_data["total"] >= 1
    assert any(item["channel"] == "in_app" for item in log_data["items"])
