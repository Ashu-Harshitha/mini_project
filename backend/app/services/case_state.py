"""
Case State Machine Service.

States:
  DRAFT -> ANALYZING -> ANALYZED -> PENDING_REVIEW -> APPROVED | APPROVED_WITH_EDITS | REJECTED -> DELIVERED -> OUTCOME_REPORTED
  Special state: BLOCKED (entered when safety guardrails fail or stop a case)

Enforces valid transitions and records audit logs.
Rejects illegal transitions with HTTP 409 Conflict.
"""

from typing import Optional, Set, Dict
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.models import Case, AuditLog


class CaseState:
    DRAFT = "DRAFT"
    ANALYZING = "ANALYZING"
    ANALYZED = "ANALYZED"
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    APPROVED_WITH_EDITS = "APPROVED_WITH_EDITS"
    REJECTED = "REJECTED"
    DELIVERED = "DELIVERED"
    OUTCOME_REPORTED = "OUTCOME_REPORTED"
    BLOCKED = "BLOCKED"


# Allowed state transitions mapping: current_state -> set of allowed next_states
ALLOWED_TRANSITIONS: Dict[str, Set[str]] = {
    CaseState.DRAFT: {CaseState.ANALYZING, CaseState.BLOCKED},
    CaseState.ANALYZING: {CaseState.ANALYZED, CaseState.BLOCKED},
    CaseState.ANALYZED: {CaseState.PENDING_REVIEW, CaseState.BLOCKED},
    CaseState.PENDING_REVIEW: {
        CaseState.APPROVED,
        CaseState.APPROVED_WITH_EDITS,
        CaseState.REJECTED,
        CaseState.BLOCKED,
    },
    CaseState.APPROVED: {CaseState.DELIVERED},
    CaseState.APPROVED_WITH_EDITS: {CaseState.DELIVERED},
    CaseState.REJECTED: {CaseState.DRAFT, CaseState.BLOCKED},
    CaseState.DELIVERED: {CaseState.OUTCOME_REPORTED},
    CaseState.OUTCOME_REPORTED: set(),  # Terminal state
    CaseState.BLOCKED: {CaseState.DRAFT, CaseState.ANALYZING, CaseState.PENDING_REVIEW},  # Can be unblocked
}


class CaseStateMachine:
    @staticmethod
    def can_transition(current_state: str, next_state: str) -> bool:
        allowed = ALLOWED_TRANSITIONS.get(current_state, set())
        return next_state in allowed

    @classmethod
    def transition(
        cls,
        db: Session,
        case: Case,
        next_state: str,
        user_id: Optional[int] = None,
        action: str = "STATE_TRANSITION",
        details: Optional[str] = None,
    ) -> Case:
        """
        Transitions case to next_state if valid.
        Raises HTTP 409 Conflict if transition is not permitted.
        Creates an entry in audit_log.
        """
        current_state = case.status

        # If already in the target state, return without error
        if current_state == next_state:
            return case

        if not cls.can_transition(current_state, next_state):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Illegal state transition from '{current_state}' to '{next_state}'. "
                    f"Allowed transitions from '{current_state}' are: {list(ALLOWED_TRANSITIONS.get(current_state, []))}"
                ),
            )

        # Apply state transition
        case.status = next_state

        # Log transition in audit_log
        audit_entry = AuditLog(
            case_id=case.id,
            user_id=user_id,
            action=action,
            from_state=current_state,
            to_state=next_state,
            details=details or f"Transitioned from {current_state} to {next_state}",
        )
        db.add(audit_entry)
        db.commit()
        db.refresh(case)

        return case
