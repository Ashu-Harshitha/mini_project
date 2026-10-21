import datetime
import logging
from typing import Optional
from sqlalchemy.orm import Session
from app.models.models import Case, User
from app.services.case_state import CaseState
from app.services.notifications import notify
from app.core.config import settings

logger = logging.getLogger("agriadvisor.reminders")


def check_and_send_feedback_reminders(db: Session, now: Optional[datetime.datetime] = None) -> int:
    """
    Scans the database for delivered cases whose outcome feedback reminder is due.
    At most 2 reminders, 3 days apart.
    Stops reminding once an outcome is reported.
    Returns the count of reminders dispatched.
    """
    if now is None:
        now = datetime.datetime.utcnow()

    cases = (
        db.query(Case)
        .filter(
            Case.status == CaseState.DELIVERED,
            Case.delivered_at.isnot(None),
            Case.feedback_reminders_sent < 2,
        )
        .all()
    )

    sent_count = 0
    for case in cases:
        # Stop reminding once an outcome is reported
        if case.outcome_feedback and (
            case.outcome_feedback.outcome is not None
            or case.outcome_feedback.outcome_reported_at is not None
        ):
            continue

        delivered_time = case.delivered_at
        first_due = delivered_time + datetime.timedelta(minutes=settings.FEEDBACK_DELAY_MINUTES)
        second_due = first_due + datetime.timedelta(days=3)

        should_send = False
        if case.feedback_reminders_sent == 0 and now >= first_due:
            should_send = True
        elif case.feedback_reminders_sent == 1 and now >= second_due:
            should_send = True

        if should_send:
            farmer = db.query(User).filter(User.id == case.user_id).first()
            if farmer:
                try:
                    notify(
                        "feedback_reminder",
                        farmer,
                        {
                            "case_number": case.case_number,
                            "case_id": case.id,
                        },
                        db,
                        case_id=case.id,
                    )
                    case.feedback_reminders_sent += 1
                    db.commit()
                    sent_count += 1
                    logger.info(
                        f"Sent feedback reminder #{case.feedback_reminders_sent} for Case {case.case_number} to farmer {farmer.username}"
                    )
                except Exception as e:
                    logger.warning(f"Failed to send feedback reminder for Case {case.case_number}: {e}")

    return sent_count
