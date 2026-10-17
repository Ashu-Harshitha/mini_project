from typing import List, Union
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.models.models import Case, Review, User
from app.schemas.schemas import CaseRead, ReviewCreate, ReviewRead
from app.api.deps import get_current_user, require_role
from app.services.case_state import CaseStateMachine, CaseState
from app.services.notifications import notify

router = APIRouter(tags=["Agronomist Review"])


@router.get("/review/queue", response_model=List[CaseRead])
def get_review_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("agronomist", "admin")),
):
    """
    Returns cases awaiting expert agronomist validation (status PENDING_REVIEW or FLAGGED).
    Restricted to agronomist and admin roles.
    """
    return (
        db.query(Case)
        .filter(Case.status.in_([CaseState.PENDING_REVIEW, "FLAGGED"]))
        .order_by(Case.created_at.desc())
        .all()
    )


@router.post("/cases/{id}/review", response_model=ReviewRead, status_code=status.HTTP_201_CREATED)
def submit_review(
    id: Union[int, str],
    review_in: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("agronomist", "admin")),
):
    """
    Submits agronomist review decision (approve | approve_with_edits | reject) with notes.
    Transitions state machine to APPROVED, APPROVED_WITH_EDITS, or REJECTED.
    Sends notifications to farm operator.
    """
    if isinstance(id, int) or str(id).isdigit():
        case = db.query(Case).filter(Case.id == int(id)).first()
    else:
        case = db.query(Case).filter(func.lower(Case.case_number) == str(id).lower()).first()

    if not case:
        raise HTTPException(status_code=404, detail="Case not found")


    decision_map = {
        "approve": CaseState.APPROVED,
        "approved": CaseState.APPROVED,
        "approve_with_edits": CaseState.APPROVED_WITH_EDITS,
        "approved_with_edits": CaseState.APPROVED_WITH_EDITS,
        "reject": CaseState.REJECTED,
        "rejected": CaseState.REJECTED,
    }

    target_state = decision_map.get(review_in.status.lower())
    if not target_state:
        raise HTTPException(
            status_code=400,
            detail="Invalid review status. Must be 'approve', 'approve_with_edits', or 'reject'.",
        )

    # Transition state machine
    CaseStateMachine.transition(
        db,
        case,
        target_state,
        user_id=current_user.id,
        action="AGRONOMIST_REVIEW",
        details=f"Decision: {target_state}. Notes: {review_in.notes or 'None'}",
    )

    # Record review
    review = Review(
        case_id=case.id,
        reviewer_id=current_user.id,
        status=target_state,
        notes=review_in.notes,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    # If approved, dispatch notification
    if target_state in [CaseState.APPROVED, CaseState.APPROVED_WITH_EDITS]:
        notify(
            event="case_approved",
            user=case.user,
            payload={
                "case_id": case.id,
                "case_number": case.case_number,
                "reviewer_name": current_user.full_name or "Dr. Sarah Chen",
            },
            db=db,
            case_id=case.id,
        )

    return review
