import io
import datetime
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.models import (
    User,
    Farm,
    Field,
    Case,
    Assignment,
    Message,
    MessageTranslation,
    OutcomeFeedback,
    Notification,
)
from app.services.case_state import CaseState, CaseStateMachine
from app.services.assignment import assign_case, check_case_assignment_timeouts
from app.services.ai.gemini_client import get_gemini_client
from app.api.deps import get_db, get_firebase


@pytest.fixture
def test_setup(db, fake_firebase, test_farm):
    """Sets up a complete set of users and farms for assignment tests."""
    # Farmer 1
    farmer1 = User(
        username="farmer_one",
        firebase_uid="uid-farmer-1",
        full_name="Farmer One",
        role="farmer",
        language="en",
        active=True,
    )
    # Farmer 2
    farmer2 = User(
        username="farmer_two",
        firebase_uid="uid-farmer-2",
        full_name="Farmer Two",
        role="farmer",
        language="hi",
        active=True,
    )
    # Admin
    admin = User(
        username="admin_user",
        firebase_uid="uid-admin-main",
        full_name="Admin Boss",
        role="admin",
        language="en",
        active=True,
    )
    # Agronomist A
    agro_a = User(
        username="agro_a",
        firebase_uid="uid-agro-a",
        full_name="Dr. Agro A",
        role="agronomist",
        language="en",
        active=True,
        available=True,
        max_open_cases=3,
        last_assigned_at=datetime.datetime(2026, 1, 1, 10, 0, 0),
    )
    # Agronomist B
    agro_b = User(
        username="agro_b",
        firebase_uid="uid-agro-b",
        full_name="Dr. Agro B",
        role="agronomist",
        language="en",
        active=True,
        available=True,
        max_open_cases=3,
        last_assigned_at=datetime.datetime(2026, 1, 2, 10, 0, 0),
    )
    # Agronomist C (busy/unavailable)
    agro_c = User(
        username="agro_c",
        firebase_uid="uid-agro-c",
        full_name="Dr. Agro C",
        role="agronomist",
        language="kn",
        active=True,
        available=False,
        max_open_cases=1,
    )

    db.add_all([farmer1, farmer2, admin, agro_a, agro_b, agro_c])
    db.commit()
    for u in [farmer1, farmer2, admin, agro_a, agro_b, agro_c]:
        db.refresh(u)
        fake_firebase.create_user(
            email=f"{u.username}@agriadvisor.app",
            password="password123",
            display_name=u.full_name,
            uid=u.firebase_uid,
        )
        fake_firebase.set_role_claim(u.firebase_uid, u.role)

    return {
        "farmer1": farmer1,
        "farmer2": farmer2,
        "admin": admin,
        "agro_a": agro_a,
        "agro_b": agro_b,
        "agro_c": agro_c,
        "farm": test_farm,
        "field": test_farm.fields[0],
    }


def create_test_case(db, user, farm, field, status=CaseState.DRAFT, desc="Test crop issue description with symptoms"):
    case = Case(
        case_number=f"C-TEST-{user.id}-{int(datetime.datetime.utcnow().timestamp() * 1000) % 100000}",
        farm_id=farm.id,
        field_id=field.id,
        user_id=user.id,
        crop="Corn",
        growth_stage="V6",
        status=status,
        confidence=82.5,
        uncertainty="Medium",
        description=desc,
        description_lang=user.language,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


@pytest.fixture
def api_client(db, fake_firebase):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    def override_get_firebase():
        return fake_firebase

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_firebase] = override_get_firebase

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


# ============================================================================
# 1. Assignment picks least busy & breaks ties by oldest last_assigned_at
# ============================================================================
def test_assignment_picks_least_busy_and_breaks_ties(db, test_setup):
    s = test_setup
    agro_a = s["agro_a"]
    agro_b = s["agro_b"]

    # Give agro_a 1 open case in PENDING_REVIEW
    c1 = create_test_case(db, s["farmer1"], s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    c1.assigned_agronomist_id = agro_a.id
    db.commit()

    # agro_b has 0 open cases -> assign_case should pick agro_b
    c2 = create_test_case(db, s["farmer1"], s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    picked = assign_case(c2.id, db, reason="auto")
    assert picked.id == agro_b.id
    assert c2.assigned_agronomist_id == agro_b.id

    # Now both agro_a (last_assigned 2026-01-01) and agro_b (assigned now) have 1 open case
    # Next assignment should pick agro_a because agro_a has older last_assigned_at!
    c3 = create_test_case(db, s["farmer2"], s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    picked2 = assign_case(c3.id, db, reason="auto")
    assert picked2.id == agro_a.id


# ============================================================================
# 2. Assignment honors continuity
# ============================================================================
def test_assignment_honors_continuity(db, test_setup):
    s = test_setup
    farmer = s["farmer1"]
    agro_b = s["agro_b"]

    # Farmer has a prior decided case reviewed by agro_b
    prior = create_test_case(db, farmer, s["farm"], s["field"], status=CaseState.APPROVED)
    prior.assigned_agronomist_id = agro_b.id
    db.commit()

    # New case for this farmer
    new_case = create_test_case(db, farmer, s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    assigned = assign_case(new_case.id, db, reason="auto")

    assert assigned.id == agro_b.id
    assert new_case.assigned_agronomist_id == agro_b.id

    # Check assignment reason
    ass_row = db.query(Assignment).filter(Assignment.case_id == new_case.id).first()
    assert ass_row is not None
    assert ass_row.reason == "continuity"


# ============================================================================
# 3. Skips unavailable agronomists and those at their limit
# ============================================================================
def test_assignment_skips_unavailable_and_at_limit(db, test_setup):
    s = test_setup
    agro_a = s["agro_a"]
    agro_b = s["agro_b"]
    agro_c = s["agro_c"]

    # agro_c is unavailable (available=False) -> should never be picked
    # Set agro_a to max capacity (open_count == max_open_cases)
    agro_a.max_open_cases = 1
    c_busy = create_test_case(db, s["farmer1"], s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    c_busy.assigned_agronomist_id = agro_a.id
    db.commit()

    # Now agro_a is at limit (1/1), agro_c is unavailable -> must pick agro_b
    new_case = create_test_case(db, s["farmer2"], s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    assigned = assign_case(new_case.id, db, reason="auto")
    assert assigned.id == agro_b.id


# ============================================================================
# 4. Falls back to unassigned with an admin alert
# ============================================================================
def test_assignment_falls_back_to_unassigned_and_alerts_admin(db, test_setup):
    s = test_setup
    # Make all agronomists unavailable
    s["agro_a"].available = False
    s["agro_b"].available = False
    s["agro_c"].available = False
    db.commit()

    case = create_test_case(db, s["farmer1"], s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    assigned = assign_case(case.id, db, reason="auto")

    assert assigned is None
    assert case.assigned_agronomist_id is None

    # Check admin was notified with unassigned_alert
    notif = db.query(Notification).filter(
        Notification.user_id == s["admin"].id,
        Notification.event == "unassigned_alert",
    ).first()
    assert notif is not None
    assert case.case_number in notif.message


# ============================================================================
# 5. Timeout reassigns and excludes previous agronomists, stops after 2 reassigns
# ============================================================================
def test_timeout_reassigns_and_stops_after_two(db, test_setup):
    s = test_setup
    agro_a = s["agro_a"]
    agro_b = s["agro_b"]

    case = create_test_case(db, s["farmer1"], s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    case.assigned_agronomist_id = agro_a.id
    # Set assigned_at 2 days ago (> 1440 mins)
    case.assigned_at = datetime.datetime.utcnow() - datetime.timedelta(days=2)
    case.reassign_count = 0
    init_assign = Assignment(
        case_id=case.id,
        from_user_id=None,
        to_user_id=agro_a.id,
        reason="auto",
        created_at=case.assigned_at,
    )
    db.add(init_assign)
    db.commit()

    # Run timeout job 1 -> should reassign to agro_b and exclude agro_a
    count = check_case_assignment_timeouts(db)
    assert count == 1
    db.refresh(case)
    assert case.assigned_agronomist_id == agro_b.id
    assert case.reassign_count == 1

    # Simulate timeout on the new agronomist (2 days ago)
    case.assigned_at = datetime.datetime.utcnow() - datetime.timedelta(days=2)
    db.commit()

    # Since agro_a was previously assigned and agro_b was just assigned, both are excluded!
    # With no other eligible agronomists, it should fail to assign and clear assigned_agronomist_id
    count2 = check_case_assignment_timeouts(db)
    assert count2 == 1
    db.refresh(case)
    assert case.assigned_agronomist_id is None
    assert case.reassign_count == 2

    # If it was already reassign_count >= 2 and timed out, it stays in unassigned pool and alerts admin
    case.assigned_agronomist_id = agro_a.id
    case.assigned_at = datetime.datetime.utcnow() - datetime.timedelta(days=2)
    db.commit()
    check_case_assignment_timeouts(db)
    db.refresh(case)
    assert case.assigned_agronomist_id is None


# ============================================================================
# 6. Farmer cannot read another farmer's case
# ============================================================================
def test_farmer_cannot_read_another_farmers_case(api_client, db, test_setup):
    s = test_setup
    farmer1 = s["farmer1"]
    farmer2 = s["farmer2"]

    case_f1 = create_test_case(db, farmer1, s["farm"], s["field"])

    # Farmer 2 tries to GET farmer 1's case -> 403 Forbidden
    resp = api_client.get(
        f"/cases/{case_f1.id}",
        headers={"Authorization": f"Bearer {farmer2.firebase_uid}"},
    )
    assert resp.status_code == 403


# ============================================================================
# 7. Farmer payload never contains confidence/citations/guardrail fields
# ============================================================================
def test_farmer_payload_never_contains_technical_fields(api_client, db, test_setup):
    s = test_setup
    farmer1 = s["farmer1"]

    case = create_test_case(db, farmer1, s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    case.confidence = 94.2
    case.uncertainty = "Low"
    db.commit()

    resp = api_client.get(
        f"/cases/{case.id}",
        headers={"Authorization": f"Bearer {farmer1.firebase_uid}"},
    )
    assert resp.status_code == 200
    data = resp.json()

    # Required fields present
    assert "id" in data
    assert "case_number" in data
    assert "status" in data
    assert "crop" in data

    # Technical fields strictly absent
    assert "confidence" not in data
    assert "guardrail_results" not in data
    assert "citations" not in data
    assert "rag_sources" not in data
    assert "observations" not in data
    assert "uncertainty" not in data
    assert "risk_flags" not in data


# ============================================================================
# 8. Only assigned agronomist can review; Admin gets 403; Reject without note -> 422
# ============================================================================
def test_review_permissions_and_validations(api_client, db, test_setup):
    s = test_setup
    agro_a = s["agro_a"]
    agro_b = s["agro_b"]
    admin = s["admin"]

    case = create_test_case(db, s["farmer1"], s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    case.assigned_agronomist_id = agro_a.id
    db.commit()

    # 1. Admin gets 403 on review
    resp_admin = api_client.post(
        f"/cases/{case.id}/review",
        json={"decision": "approve", "note": "Valid advice"},
        headers={"Authorization": f"Bearer {admin.firebase_uid}"},
    )
    assert resp_admin.status_code == 403

    # 2. Unassigned agronomist (agro_b) gets 403
    resp_unassigned = api_client.post(
        f"/cases/{case.id}/review",
        json={"decision": "approve", "note": "Valid advice"},
        headers={"Authorization": f"Bearer {agro_b.firebase_uid}"},
    )
    assert resp_unassigned.status_code == 403

    # 3. Reject without note of >= 10 chars -> 422
    resp_short_note = api_client.post(
        f"/cases/{case.id}/review",
        json={"decision": "reject", "note": "bad"},
        headers={"Authorization": f"Bearer {agro_a.firebase_uid}"},
    )
    assert resp_short_note.status_code == 422

    # 4. Assigned agronomist (agro_a) successfully approves
    resp_ok = api_client.post(
        f"/cases/{case.id}/review",
        json={"decision": "approve", "note": "Diagnosis confirmed. Treatment plan approved."},
        headers={"Authorization": f"Bearer {agro_a.firebase_uid}"},
    )
    assert resp_ok.status_code == 201

    db.refresh(case)
    assert case.status == CaseState.DELIVERED
    assert case.farmer_summary is not None


# ============================================================================
# 9. Translation caching: translated once, cache avoids second LLM call, same-lang never calls translator
# ============================================================================
def test_message_translation_and_caching(api_client, db, test_setup, monkeypatch):
    s = test_setup
    farmer = s["farmer1"]  # lang: en
    agro = s["agro_a"]      # lang: en
    admin = s["admin"]      # lang: en

    # Change farmer to Kannada
    farmer.language = "kn"
    db.commit()

    case = create_test_case(db, farmer, s["farm"], s["field"], status=CaseState.DELIVERED)
    case.assigned_agronomist_id = agro.id
    db.commit()

    # Post message in Kannada from farmer
    msg = Message(
        case_id=case.id,
        sender_id=farmer.id,
        sender_role="farmer",
        kind="text",
        original_lang="kn",
        original_text="ಬೆಳೆಗೆ ಕೀಟಬಾಧೆ ಕಾಣಿಸಿಕೊಂಡಿದೆ",
    )
    db.add(msg)
    db.commit()

    call_count = {"count": 0}
    gemini = get_gemini_client()
    original_batch = gemini.batch_translate

    def fake_batch(texts, target_lang):
        call_count["count"] += 1
        return original_batch(texts, target_lang)

    monkeypatch.setattr(gemini, "batch_translate", fake_batch)

    # 1. Agronomist (lang: en) reads messages -> first call calls batch_translate
    resp1 = api_client.get(
        f"/cases/{case.id}/messages",
        headers={"Authorization": f"Bearer {agro.firebase_uid}"},
    )
    assert resp1.status_code == 200
    assert call_count["count"] == 1
    data1 = resp1.json()
    assert data1[0]["translated"] is True
    assert "[en]" in data1[0]["text"]

    # 2. Second read by agronomist (lang: en) -> uses cache, zero LLM calls!
    resp2 = api_client.get(
        f"/cases/{case.id}/messages",
        headers={"Authorization": f"Bearer {agro.firebase_uid}"},
    )
    assert resp2.status_code == 200
    assert call_count["count"] == 1  # Still 1! Cache used!

    # 3. Same-language read: Farmer (lang: kn) reads their own message -> NEVER calls translator!
    resp3 = api_client.get(
        f"/cases/{case.id}/messages",
        headers={"Authorization": f"Bearer {farmer.firebase_uid}"},
    )
    assert resp3.status_code == 200
    assert call_count["count"] == 1  # Still 1! Same language skipped translator!
    assert resp3.json()[0]["translated"] is False


# ============================================================================
# 10. Voice upload over size limit is rejected (422)
# ============================================================================
def test_voice_upload_over_size_limit(api_client, db, test_setup):
    s = test_setup
    farmer = s["farmer1"]
    case = create_test_case(db, farmer, s["farm"], s["field"])
    case.assigned_agronomist_id = s["agro_a"].id
    db.commit()

    # 2.5 MB audio file
    large_audio = b"RIFF" + (b"\x00" * int(2.5 * 1024 * 1024))

    resp = api_client.post(
        f"/cases/{case.id}/messages",
        data={"language": "en"},
        files={"audio": ("large_voice.wav", io.BytesIO(large_audio), "audio/wav")},
        headers={"Authorization": f"Bearer {farmer.firebase_uid}"},
    )
    assert resp.status_code == 422
    assert "exceeds maximum allowed size" in resp.json()["detail"]


# ============================================================================
# 11. Feedback only after a decision and only once
# ============================================================================
def test_feedback_only_after_decision_and_only_once(api_client, db, test_setup):
    s = test_setup
    farmer = s["farmer1"]
    case = create_test_case(db, farmer, s["farm"], s["field"], status=CaseState.PENDING_REVIEW)
    case.assigned_agronomist_id = s["agro_a"].id
    db.commit()

    # 1. Attempt feedback while in PENDING_REVIEW -> 400 Bad Request
    resp_early = api_client.post(
        f"/cases/{case.id}/feedback",
        data={"rating": 5, "comment": "Great help"},
        headers={"Authorization": f"Bearer {farmer.firebase_uid}"},
    )
    assert resp_early.status_code == 400
    assert "only be submitted after a case review decision" in resp_early.json()["detail"]

    # 2. Move case to DELIVERED
    case.status = CaseState.DELIVERED
    db.commit()

    # 3. Submit feedback successfully
    resp_ok = api_client.post(
        f"/cases/{case.id}/feedback",
        data={"rating": 5, "comment": "Advice worked wonders on my corn!"},
        headers={"Authorization": f"Bearer {farmer.firebase_uid}"},
    )
    assert resp_ok.status_code == 201

    # 4. Attempt second feedback on same case -> 409 Conflict
    resp_duplicate = api_client.post(
        f"/cases/{case.id}/feedback",
        data={"rating": 4, "comment": "Trying to submit again"},
        headers={"Authorization": f"Bearer {farmer.firebase_uid}"},
    )
    assert resp_duplicate.status_code == 409
    assert "already been recorded" in resp_duplicate.json()["detail"]
