import datetime
import logging
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.models import Case, User, Assignment
from app.services.case_state import CaseState
from app.services.notifications import notify
from app.core.config import settings

logger = logging.getLogger("agriadvisor.assignment")


def get_agronomist_open_count(db: Session, agronomist_id: int) -> int:
    """Returns number of cases in PENDING_REVIEW currently assigned to this agronomist."""
    count = (
        db.query(func.count(Case.id))
        .filter(
            Case.assigned_agronomist_id == agronomist_id,
            Case.status == CaseState.PENDING_REVIEW,
        )
        .scalar()
    )
    return count or 0


def assign_case(
    case_id: int,
    db: Session,
    exclude_ids: Optional[List[int]] = None,
    reason: str = "auto",
) -> Optional[User]:
    """
    Assigns a case to an eligible agronomist in ONE transaction.
    1. Continuity: previous agronomist of farmer's most recent decided case.
    2. Else: lowest open_count (< max_open_cases), ties broken by oldest last_assigned_at (nulls first).
    3. None found: assigned_agronomist_id = NULL and alerts admins.
    4. Otherwise: writes Assignment row, sets assigned_at and last_assigned_at, notifies parties.
    """
    if exclude_ids is None:
        exclude_ids = []

    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        logger.warning(f"assign_case: Case {case_id} not found")
        return None

    now = datetime.datetime.utcnow()
    old_agronomist_id = case.assigned_agronomist_id

    # Base query for agronomists (row lock when supported)
    agro_query = db.query(User).filter(
        User.role == "agronomist",
        User.active == True,
    )
    try:
        if db.bind and db.bind.dialect.name == "postgresql":
            agro_query = agro_query.with_for_update()
    except Exception:
        pass

    all_agronomists = {u.id: u for u in agro_query.all()}
    selected_agronomist: Optional[User] = None
    assigned_reason = reason

    # 1. Continuity check
    if reason in ("auto", "continuity"):
        decided_statuses = [
            CaseState.APPROVED,
            CaseState.APPROVED_WITH_EDITS,
            CaseState.REJECTED,
            CaseState.DELIVERED,
            CaseState.OUTCOME_REPORTED,
        ]
        recent_decided_case = (
            db.query(Case)
            .filter(
                Case.user_id == case.user_id,
                Case.id != case.id,
                Case.status.in_(decided_statuses),
                Case.assigned_agronomist_id.isnot(None),
            )
            .order_by(Case.created_at.desc())
            .first()
        )

        if recent_decided_case and recent_decided_case.assigned_agronomist_id:
            cont_id = recent_decided_case.assigned_agronomist_id
            if cont_id not in exclude_ids and cont_id in all_agronomists:
                cont_agro = all_agronomists[cont_id]
                if cont_agro.available:
                    open_count = get_agronomist_open_count(db, cont_id)
                    max_cases = cont_agro.max_open_cases or settings.DEFAULT_MAX_OPEN_CASES
                    if open_count < max_cases:
                        selected_agronomist = cont_agro
                        assigned_reason = "continuity"
                        logger.info(f"Case {case.case_number} matched continuity agronomist: {cont_agro.username}")

    # 2. General candidate pool
    if not selected_agronomist:
        eligible_candidates = []
        for agro_id, agro in all_agronomists.items():
            if agro_id in exclude_ids:
                continue
            if not agro.available:
                continue
            open_count = get_agronomist_open_count(db, agro_id)
            max_cases = agro.max_open_cases or settings.DEFAULT_MAX_OPEN_CASES
            if open_count < max_cases:
                # Key: (open_count, 0 if last_assigned_at is None else 1, last_assigned_at or datetime.datetime.min)
                has_assigned = 1 if agro.last_assigned_at is not None else 0
                last_time = agro.last_assigned_at or datetime.datetime.min
                sort_key = (open_count, has_assigned, last_time)
                eligible_candidates.append((sort_key, agro))

        if not eligible_candidates:
            # Fallback: select available active agronomist with lowest open count so cases are never lost
            for agro_id, agro in all_agronomists.items():
                if agro_id not in exclude_ids and agro.available:
                    open_count = get_agronomist_open_count(db, agro_id)
                    sort_key = (open_count, 1 if agro.last_assigned_at else 0, agro.last_assigned_at or datetime.datetime.min)
                    eligible_candidates.append((sort_key, agro))

        if eligible_candidates:
            eligible_candidates.sort(key=lambda x: x[0])
            selected_agronomist = eligible_candidates[0][1]
            if assigned_reason == "continuity":
                assigned_reason = "auto"
            logger.info(f"Case {case.case_number} assigned to best candidate: {selected_agronomist.username}")

    # 3. None found -> unassigned pool + alert admins
    if not selected_agronomist:
        case.assigned_agronomist_id = None
        db.commit()
        logger.warning(f"No eligible agronomist found for Case {case.case_number}. Flagging unassigned.")

        admins = db.query(User).filter(User.role == "admin", User.active == True).all()
        for admin in admins:
            notify(
                "unassigned_alert",
                admin,
                {
                    "case_number": case.case_number,
                    "case_id": case.id,
                    "message": f"Case {case.case_number} has no eligible agronomists and requires admin assignment."
                },
                db,
                case_id=case.id,
            )
        return None

    # 4. Successfully assign
    case.assigned_agronomist_id = selected_agronomist.id
    case.assigned_at = now
    selected_agronomist.last_assigned_at = now

    assignment = Assignment(
        case_id=case.id,
        from_user_id=old_agronomist_id,
        to_user_id=selected_agronomist.id,
        reason=assigned_reason,
        created_at=now,
    )
    db.add(assignment)
    db.commit()

    # Notify Agronomist
    notify(
        "case_assigned",
        selected_agronomist,
        {
            "case_number": case.case_number,
            "case_id": case.id,
            "crop": case.crop,
            "message": f"Case {case.case_number} ({case.crop}) has been assigned to you for agronomic review."
        },
        db,
        case_id=case.id,
    )

    # Notify Farmer
    farmer = db.query(User).filter(User.id == case.user_id).first()
    if farmer:
        agro_display = selected_agronomist.full_name or selected_agronomist.username
        notify(
            "case_assigned",
            farmer,
            {
                "case_number": case.case_number,
                "case_id": case.id,
                "agronomist_name": agro_display,
                "message": f"Your case {case.case_number} has been assigned to expert {agro_display} for review."
            },
            db,
            case_id=case.id,
        )

    return selected_agronomist


def check_case_assignment_timeouts(db: Session) -> int:
    """
    Checks for PENDING_REVIEW cases older than ASSIGN_TIMEOUT_MINUTES and reassigns them.
    If reassign_count >= 2, unassigns and alerts admins.
    Returns number of cases reassigned or unassigned.
    """
    timeout_mins = settings.ASSIGN_TIMEOUT_MINUTES or 1440
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(minutes=timeout_mins)

    timed_out_cases = (
        db.query(Case)
        .filter(
            Case.status == CaseState.PENDING_REVIEW,
            Case.assigned_agronomist_id.isnot(None),
            Case.assigned_at <= cutoff,
        )
        .all()
    )

    processed_count = 0
    for case in timed_out_cases:
        old_agro_id = case.assigned_agronomist_id
        old_agro = db.query(User).filter(User.id == old_agro_id).first()

        if case.reassign_count >= 2:
            case.assigned_agronomist_id = None
            db.commit()
            processed_count += 1
            logger.warning(f"Case {case.case_number} exceeded max timeout reassigns (count: {case.reassign_count}). Unassigned.")

            admins = db.query(User).filter(User.role == "admin", User.active == True).all()
            for admin in admins:
                notify(
                    "unassigned_alert",
                    admin,
                    {
                        "case_number": case.case_number,
                        "case_id": case.id,
                        "message": f"Case {case.case_number} timed out twice and has been moved to the unassigned queue."
                    },
                    db,
                    case_id=case.id,
                )
        else:
            # Reassign, excluding all previously assigned agronomists
            past_to = db.query(Assignment.to_user_id).filter(Assignment.case_id == case.id).all()
            past_from = db.query(Assignment.from_user_id).filter(
                Assignment.case_id == case.id, Assignment.from_user_id.isnot(None)
            ).all()
            excluded = list(set(
                [uid for (uid,) in past_to] +
                [uid for (uid,) in past_from] +
                ([old_agro_id] if old_agro_id else [])
            ))

            case.reassign_count += 1
            new_agro = assign_case(case.id, db, exclude_ids=excluded, reason="timeout")
            processed_count += 1

            if old_agro:
                notify(
                    "case_reassigned",
                    old_agro,
                    {
                        "case_number": case.case_number,
                        "case_id": case.id,
                        "message": f"Case {case.case_number} timed out and was reassigned to another agronomist."
                    },
                    db,
                    case_id=case.id,
                )

    return processed_count
