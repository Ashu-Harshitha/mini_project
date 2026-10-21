"""
Tests for AgriAdvisor AI Demo Data Loader, Admin Endpoints, and Reset Service.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func

from app.core.config import settings
from app.api.deps import get_current_user
from app.models.models import (
    User,
    Farm,
    Field,
    Case,
    WeatherAlert,
    Notification,
    Outbreak,
    EvalRun,
    Report,
    Message,
)
from app.services.case_state import CaseState
from app.services.demo_loader import (
    load_demo_data,
    reset_demo_data,
    get_demo_status,
)


@pytest.fixture(autouse=True)
def restore_settings():
    orig_allow = settings.ALLOW_DEMO_DATA
    yield
    settings.ALLOW_DEMO_DATA = orig_allow


def test_admin_demo_endpoints_disabled_by_default(client, test_admin):
    """Admin load and delete endpoints must return 403 Forbidden when ALLOW_DEMO_DATA=False."""
    settings.ALLOW_DEMO_DATA = False
    client.app.dependency_overrides[get_current_user] = lambda: test_admin

    # Status should return 200 with enabled=False
    res_status = client.get("/admin/demo/status")
    assert res_status.status_code == 200
    assert res_status.json()["enabled"] is False

    # Load should return 403
    res_load = client.post("/admin/demo/load", json={"cases": 10})
    assert res_load.status_code == 403
    assert "disabled" in res_load.json()["detail"].lower()

    # Reset should return 403
    res_reset = client.delete("/admin/demo")
    assert res_reset.status_code == 403
    assert "disabled" in res_reset.json()["detail"].lower()


def test_demo_load_creates_all_entities_and_statuses(client, test_admin, db):
    """
    Demo data loading must seed:
    - 4 agronomists & 8 farmers with is_demo=True and usernames starting with demo_
    - All 10 case status variants (DRAFT, ANALYZING, ANALYZED, PENDING_REVIEW [normal, high-risk, ai_degraded, unassigned],
      APPROVED, APPROVED_WITH_EDITS, REJECTED, DELIVERED, OUTCOME_REPORTED, BLOCKED)
    - Sub-entities: weather alerts, notifications (read/unread), eval runs, outbreaks, and multilingual reports.
    """
    settings.ALLOW_DEMO_DATA = True
    client.app.dependency_overrides[get_current_user] = lambda: test_admin

    res = client.post("/admin/demo/load", json={"cases": 31, "no_firebase": True})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["success"] is True

    # 1. Check Demo Users
    demo_users = db.query(User).filter(User.is_demo == True).all()
    assert len(demo_users) == 12  # 4 agronomists + 8 farmers
    for u in demo_users:
        assert u.username.startswith("demo_")
        assert u.is_demo is True

    agro_users = [u for u in demo_users if u.role == "agronomist"]
    farmer_users = [u for u in demo_users if u.role == "farmer"]
    assert len(agro_users) == 4
    assert len(farmer_users) == 8

    # Verify agronomist states
    busy_agro = next(u for u in agro_users if u.username == "demo_agro_busy")
    assert busy_agro.max_open_cases == 5

    unavail_agro = next(u for u in agro_users if u.username == "demo_agro_unavail")
    assert unavail_agro.available is False

    new_agro = next(u for u in agro_users if u.username == "demo_agro_new")
    new_cases = db.query(Case).filter(Case.assigned_agronomist_id == new_agro.id).count()
    assert new_cases == 0

    # 2. Check Cases and Statuses
    demo_cases = db.query(Case).filter(Case.is_demo == True).all()
    assert len(demo_cases) >= 30

    statuses = {c.status for c in demo_cases}
    expected_statuses = {
        CaseState.DRAFT,
        CaseState.ANALYZING,
        CaseState.ANALYZED,
        CaseState.PENDING_REVIEW,
        CaseState.APPROVED,
        CaseState.APPROVED_WITH_EDITS,
        CaseState.REJECTED,
        CaseState.DELIVERED,
        CaseState.OUTCOME_REPORTED,
        CaseState.BLOCKED,
    }
    for st in expected_statuses:
        assert st in statuses, f"Status {st} missing from generated demo cases: {statuses}"

    # PENDING_REVIEW variations: high-risk, ai_degraded, unassigned
    pending_cases = [c for c in demo_cases if c.status == CaseState.PENDING_REVIEW]
    assert any(c.uncertainty and c.uncertainty.lower() == "high" for c in pending_cases), "High-risk pending case missing"
    assert any(c.ai_degraded is True for c in pending_cases), "AI-degraded pending case missing"
    assert any(c.assigned_agronomist_id is None for c in pending_cases), "Unassigned pending case missing"

    # 3. Check Sub-Entities
    alerts = db.query(WeatherAlert).filter(WeatherAlert.is_demo == True).all()
    assert len(alerts) >= 5

    notifs = db.query(Notification).filter(Notification.is_demo == True).all()
    assert len(notifs) >= 5
    assert any(n.is_read is True for n in notifs), "Read notifications missing"
    assert any(n.is_read is False for n in notifs), "Unread notifications missing"

    eval_runs = db.query(EvalRun).filter(EvalRun.is_demo == True).all()
    assert len(eval_runs) == 6

    # Multilingual reports exist
    reports = db.query(Report).all()
    report_langs = {r.language for r in reports}
    assert "en" in report_langs
    assert "hi" in report_langs
    assert "kn" in report_langs


def test_demo_outbreak_cluster_fires(db):
    """The Davanagere demo cluster must trigger an outbreak for nitrogen deficiency in corn."""
    settings.ALLOW_DEMO_DATA = True
    load_demo_data(db, num_cases=31, no_firebase=True)

    outbreak = db.query(Outbreak).filter(
        Outbreak.issue_category == "nitrogen_deficiency",
        func.lower(Outbreak.crop) == "corn",
        Outbreak.is_demo == True,
    ).first()

    assert outbreak is not None, "Demo outbreak cluster did not detect outbreak"
    assert outbreak.farm_count >= 3
    assert outbreak.status == "open"


def test_demo_farmer_sees_only_own_cases(client, db):
    """A demo farmer calling GET /cases must see only their own cases."""
    settings.ALLOW_DEMO_DATA = True
    load_demo_data(db, num_cases=31, no_firebase=True)

    farmer_en1 = db.query(User).filter(User.username == "demo_farmer_en1").first()
    assert farmer_en1 is not None

    client.app.dependency_overrides[get_current_user] = lambda: farmer_en1

    res = client.get("/cases")
    assert res.status_code == 200, res.text
    farmer_cases = res.json()

    # Verify farmer only sees cases where user_id == farmer_en1.id
    expected_case_ids = {c.id for c in db.query(Case).filter(Case.user_id == farmer_en1.id).all()}
    returned_case_ids = {c["id"] for c in farmer_cases}
    assert returned_case_ids == expected_case_ids
    assert len(returned_case_ids) > 0


def test_demo_load_is_idempotent(db):
    """Loading demo data twice in succession must not duplicate cases or users."""
    settings.ALLOW_DEMO_DATA = True

    # First load
    load_demo_data(db, num_cases=31, no_firebase=True)
    status_1 = get_demo_status(db)

    # Second load
    load_demo_data(db, num_cases=31, no_firebase=True)
    status_2 = get_demo_status(db)

    assert status_1["counts"]["users"] == status_2["counts"]["users"]
    assert status_1["counts"]["cases"] == status_2["counts"]["cases"]
    assert status_1["counts"]["farms"] == status_2["counts"]["farms"]


def test_demo_reset_preserves_non_demo_data(client, test_admin, db):
    """
    Resetting demo data must remove all is_demo=True rows in dependency order,
    while leaving production (non-demo) records completely intact.
    """
    settings.ALLOW_DEMO_DATA = True
    client.app.dependency_overrides[get_current_user] = lambda: test_admin

    # 1. Create non-demo production records
    prod_user = User(
        username="prod_farmer_xyz",
        firebase_uid="usr-prod-farmer-xyz",
        email="prod.farmer@example.com",
        full_name="Production Farmer",
        role="farmer",
        is_demo=False,
    )
    db.add(prod_user)
    db.commit()
    db.refresh(prod_user)

    prod_farm = Farm(
        name="Production Farm",
        operator_name="Prod Operator",
        location="Mysuru, Karnataka",
        total_acreage=120.0,
        is_demo=False,
    )
    db.add(prod_farm)
    db.commit()
    db.refresh(prod_farm)

    prod_field = Field(
        farm_id=prod_farm.id,
        name="Prod Field 1",
        acreage=50.0,
        soil_type="Clay",
        current_crop="Rice",
    )
    db.add(prod_field)
    db.commit()
    db.refresh(prod_field)

    prod_case = Case(
        case_number="PROD-1001",
        farm_id=prod_farm.id,
        field_id=prod_field.id,
        user_id=prod_user.id,
        crop="Rice",
        growth_stage="Flowering",
        status=CaseState.PENDING_REVIEW,
        confidence=92.0,
        uncertainty="low",
        is_demo=False,
    )
    db.add(prod_case)
    db.commit()
    db.refresh(prod_case)

    # 2. Seed demo data
    load_demo_data(db, num_cases=31, no_firebase=True)
    status_loaded = get_demo_status(db)
    assert status_loaded["has_demo_data"] is True
    assert status_loaded["counts"]["cases"] >= 30

    # 3. Call DELETE /admin/demo
    res_del = client.delete("/admin/demo")
    assert res_del.status_code == 200, res_del.text
    del_data = res_del.json()
    assert del_data["success"] is True

    # 4. Verify all demo data is deleted
    status_after = get_demo_status(db)
    assert status_after["has_demo_data"] is False
    assert status_after["counts"]["users"] == 0
    assert status_after["counts"]["cases"] == 0
    assert status_after["counts"]["farms"] == 0
    assert status_after["counts"]["weather_alerts"] == 0
    assert status_after["counts"]["notifications"] == 0
    assert status_after["counts"]["outbreaks"] == 0
    assert status_after["counts"]["eval_runs"] == 0

    # 5. Verify production data is untouched!
    re_prod_user = db.query(User).filter(User.id == prod_user.id).first()
    re_prod_farm = db.query(Farm).filter(Farm.id == prod_farm.id).first()
    re_prod_case = db.query(Case).filter(Case.id == prod_case.id).first()

    assert re_prod_user is not None
    assert re_prod_farm is not None
    assert re_prod_case is not None
    assert re_prod_case.case_number == "PROD-1001"
