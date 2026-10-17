import pytest
from fastapi import HTTPException
from app.models.models import Case, AuditLog
from app.services.case_state import CaseStateMachine, CaseState


def create_sample_case(db, farm, user, status=CaseState.DRAFT):
    field = farm.fields[0]
    case = Case(
        case_number=f"TEST-{db.query(Case).count() + 100}",
        farm_id=farm.id,
        field_id=field.id,
        user_id=user.id,
        crop="Corn",
        growth_stage="V8",
        status=status,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def test_valid_case_lifecycle(db, test_farm, test_user):
    case = create_sample_case(db, test_farm, test_user, CaseState.DRAFT)
    assert case.status == CaseState.DRAFT

    # DRAFT -> ANALYZING
    CaseStateMachine.transition(db, case, CaseState.ANALYZING, user_id=test_user.id)
    assert case.status == CaseState.ANALYZING

    # ANALYZING -> ANALYZED
    CaseStateMachine.transition(db, case, CaseState.ANALYZED, user_id=test_user.id)
    assert case.status == CaseState.ANALYZED

    # ANALYZED -> PENDING_REVIEW
    CaseStateMachine.transition(db, case, CaseState.PENDING_REVIEW, user_id=test_user.id)
    assert case.status == CaseState.PENDING_REVIEW

    # PENDING_REVIEW -> APPROVED
    CaseStateMachine.transition(db, case, CaseState.APPROVED, user_id=test_user.id)
    assert case.status == CaseState.APPROVED

    # APPROVED -> DELIVERED
    CaseStateMachine.transition(db, case, CaseState.DELIVERED, user_id=test_user.id)
    assert case.status == CaseState.DELIVERED

    # DELIVERED -> OUTCOME_REPORTED
    CaseStateMachine.transition(db, case, CaseState.OUTCOME_REPORTED, user_id=test_user.id)
    assert case.status == CaseState.OUTCOME_REPORTED

    # Verify audit log entries
    logs = db.query(AuditLog).filter(AuditLog.case_id == case.id).all()
    assert len(logs) == 6


def test_approved_with_edits_path(db, test_farm, test_user):
    case = create_sample_case(db, test_farm, test_user, CaseState.PENDING_REVIEW)
    CaseStateMachine.transition(db, case, CaseState.APPROVED_WITH_EDITS, user_id=test_user.id)
    assert case.status == CaseState.APPROVED_WITH_EDITS

    CaseStateMachine.transition(db, case, CaseState.DELIVERED, user_id=test_user.id)
    assert case.status == CaseState.DELIVERED


def test_rejection_path(db, test_farm, test_user):
    case = create_sample_case(db, test_farm, test_user, CaseState.PENDING_REVIEW)
    CaseStateMachine.transition(db, case, CaseState.REJECTED, user_id=test_user.id)
    assert case.status == CaseState.REJECTED

    # Rejected can reset to DRAFT
    CaseStateMachine.transition(db, case, CaseState.DRAFT, user_id=test_user.id)
    assert case.status == CaseState.DRAFT


def test_guardrail_block_transition(db, test_farm, test_user):
    case = create_sample_case(db, test_farm, test_user, CaseState.PENDING_REVIEW)
    CaseStateMachine.transition(db, case, CaseState.BLOCKED, user_id=test_user.id)
    assert case.status == CaseState.BLOCKED


def test_illegal_transition_raises_409(db, test_farm, test_user):
    # DRAFT cannot jump directly to APPROVED
    case = create_sample_case(db, test_farm, test_user, CaseState.DRAFT)
    with pytest.raises(HTTPException) as exc_info:
        CaseStateMachine.transition(db, case, CaseState.APPROVED, user_id=test_user.id)

    assert exc_info.value.status_code == 409
    assert "Illegal state transition" in str(exc_info.value.detail)


def test_terminal_state_transition_raises_409(db, test_farm, test_user):
    # OUTCOME_REPORTED is terminal
    case = create_sample_case(db, test_farm, test_user, CaseState.OUTCOME_REPORTED)
    with pytest.raises(HTTPException) as exc_info:
        CaseStateMachine.transition(db, case, CaseState.DRAFT, user_id=test_user.id)

    assert exc_info.value.status_code == 409
