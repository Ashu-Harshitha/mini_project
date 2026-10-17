from typing import List, Union, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.models import Case, Review, User, Recommendation, Message, Assignment
from app.schemas.schemas import CaseRead, ReviewDecisionIn, ReviewRead
from app.api.deps import get_current_user, require_role
from app.services.case_state import CaseStateMachine, CaseState
from app.services.notifications import notify
from app.services.ai.gemini_client import get_gemini_client

router = APIRouter(tags=["Agronomist Review"])


def get_case_or_404(db: Session, case_id: Union[int, str]) -> Case:
    if isinstance(case_id, int) or str(case_id).isdigit():
        case = db.query(Case).filter(Case.id == int(case_id)).first()
    else:
        case = db.query(Case).filter(func.lower(Case.case_number) == str(case_id).lower()).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.get("/review/queue", response_model=List[CaseRead])
def get_review_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("agronomist", "admin")),
):
    """
    Returns cases awaiting expert agronomist validation (status PENDING_REVIEW).
    Agronomists see only cases assigned to them; admins see all pending cases.
    High-risk flagged first, then oldest first.
    """
    query = db.query(Case).filter(Case.status == CaseState.PENDING_REVIEW)
    if current_user.role == "agronomist":
        query = query.filter(Case.assigned_agronomist_id == current_user.id)

    # Sort high-risk (uncertainty == 'High') first, then oldest assigned_at / created_at first
    cases = query.all()
    cases.sort(key=lambda c: (0 if c.uncertainty == "High" else 1, c.assigned_at or c.created_at))
    return cases


@router.post("/cases/{id}/review", response_model=ReviewRead, status_code=status.HTTP_201_CREATED)
def submit_review(
    id: Union[int, str],
    review_in: ReviewDecisionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submits agronomist review decision (approve | approve_with_edits | reject) with notes.
    Assigned agronomist only; admins get 403 Forbidden.
    reject requires note of >= 10 chars.
    approve_with_edits requires edits.
    """
    # 1. Role validation: assigned agronomist only; admins explicitly get 403
    if current_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrators cannot submit case reviews.",
        )
    if current_user.role != "agronomist":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an agronomist can submit case reviews.",
        )

    case = get_case_or_404(db, id)

    # 2. Assignment check: must be assigned to current_user
    if case.assigned_agronomist_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: this case is not assigned to you.",
        )

    decision = (review_in.decision or review_in.status or "").lower().strip()
    if not decision or decision not in ("approve", "approved", "approve_with_edits", "approved_with_edits", "reject", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid decision '{review_in.decision}'. Must be approve, approve_with_edits, or reject.",
        )

    # 3. Decision validation rules
    is_reject = decision in ("reject", "rejected")
    is_edits = decision in ("approve_with_edits", "approved_with_edits")

    if is_reject:
        if not review_in.note or len(review_in.note.strip()) < 10:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Rejection requires an explanation note of at least 10 characters.",
            )

    if is_edits:
        if not review_in.edits or not (
            review_in.edits.get("recommendations") or review_in.edits.get("final_suggestion")
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Approve with edits requires edit specifications.",
            )

    # 4. Apply edits
    if review_in.edits:
        if "recommendations" in review_in.edits:
            for rec_edit in review_in.edits["recommendations"]:
                rec_id = rec_edit.get("id")
                new_action = rec_edit.get("action")
                if rec_id and new_action:
                    rec = db.query(Recommendation).filter(Recommendation.id == rec_id, Recommendation.case_id == case.id).first()
                    if rec:
                        rec.title = new_action
                        rec.action = new_action

        if "final_suggestion" in review_in.edits:
            case.final_suggestion = review_in.edits["final_suggestion"]

    if review_in.note:
        case.decision_note = review_in.note
        if not case.final_suggestion and not is_reject:
            case.final_suggestion = review_in.note

    # 5. State machine transition: approved cases go APPROVED then DELIVERED; rejected go REJECTED
    if is_reject:
        CaseStateMachine.transition(
            db, case, CaseState.REJECTED, user_id=current_user.id, action="REVIEW_REJECTED", details=review_in.note
        )
    elif is_edits:
        CaseStateMachine.transition(
            db, case, CaseState.APPROVED_WITH_EDITS, user_id=current_user.id, action="REVIEW_APPROVED_WITH_EDITS", details=review_in.note
        )
        CaseStateMachine.transition(
            db, case, CaseState.DELIVERED, user_id=current_user.id, action="AUTO_DELIVERED", details="Advice marked delivered."
        )
    else:
        CaseStateMachine.transition(
            db, case, CaseState.APPROVED, user_id=current_user.id, action="REVIEW_APPROVED", details=review_in.note
        )
        CaseStateMachine.transition(
            db, case, CaseState.DELIVERED, user_id=current_user.id, action="AUTO_DELIVERED", details="Advice marked delivered."
        )

    # 6. Generate farmer_summary via Gemini / mock
    farmer = db.query(User).filter(User.id == case.user_id).first()
    farmer_lang = farmer.language if farmer else (case.description_lang or "en")

    approved_actions = []
    if not is_reject:
        approved_actions = [
            r.action or r.title
            for r in case.recommendations
            if r.is_visible_to_farmer
        ]

    gemini = get_gemini_client()
    summary = gemini.generate_farmer_summary(
        crop=case.crop,
        approved_actions=approved_actions,
        final_suggestion=case.final_suggestion or review_in.note,
        lang=farmer_lang,
    )
    case.farmer_summary = summary

    # 7. Create messages row kind=decision
    note_text = review_in.note or f"Review decision: {case.status}"
    msg = Message(
        case_id=case.id,
        sender_id=current_user.id,
        sender_role="agronomist",
        kind="decision",
        original_lang=current_user.language or "en",
        original_text=note_text,
        transcript_status="none",
    )
    db.add(msg)

    # 8. Record Review row
    review = Review(
        case_id=case.id,
        reviewer_id=current_user.id,
        status=case.status,
        notes=review_in.note,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    # 9. Notify farmer (case_decision)
    if farmer:
        agro_name = current_user.full_name or current_user.username
        notify(
            "case_decision",
            farmer,
            {
                "case_number": case.case_number,
                "case_id": case.id,
                "decision": case.status,
                "agronomist_name": agro_name,
                "message": f"Your case {case.case_number} has been reviewed by {agro_name}: {case.status}."
            },
            db,
            case_id=case.id,
        )

    return review
