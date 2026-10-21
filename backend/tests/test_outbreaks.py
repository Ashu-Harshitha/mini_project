"""
Unit and integration tests for Outbreak Detection, Clustering, Auto-resolve,
Privacy-safe Notifications, and Role Authorization.
"""

import datetime
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.models import (
    Farm,
    Field,
    Case,
    User,
    Outbreak,
    OutbreakNotified,
    outbreak_cases,
)
from app.services.case_state import CaseState
from app.services.outbreaks import (
    haversine_distance,
    detect_outbreaks,
    auto_resolve_stale_outbreaks,
    dispatch_outbreak_notifications,
)
from app.api.deps import get_current_user


# =====================================================================
# 1. Haversine Distance & Clustering Boundary Tests
# =====================================================================

def test_haversine_distance_calculations():
    """Validates haversine great-circle calculation and edge cases."""
    # Same point distance is 0
    assert haversine_distance(12.9716, 77.5946, 12.9716, 77.5946) == 0.0

    # Known distance: Bangalore (12.9716, 77.5946) to Mysore (12.2958, 76.6394) ~ 125-135 km
    dist = haversine_distance(12.9716, 77.5946, 12.2958, 76.6394)
    assert 120.0 < dist < 140.0

    # 0.1 degree latitude is approximately 11.1 km
    dist_lat = haversine_distance(12.0, 77.0, 12.1, 77.0)
    assert 11.0 < dist_lat < 11.2


def test_clustering_boundary_and_distinct_farms(db: Session):
    """
    Validates:
    - Multiple cases on the same farm count as ONE distinct farm.
    - Boundary at radius: points <= 25km cluster together, points > 25km do not.
    - >= 3 distinct farms triggers 'watch', >= 6 distinct farms triggers 'alert'.
    """
    # Create 2 farmers
    farmer1 = User(username="farmer_clu_1", firebase_uid="uid-clu-1", role="farmer", full_name="Farmer One")
    farmer2 = User(username="farmer_clu_2", firebase_uid="uid-clu-2", role="farmer", full_name="Farmer Two")
    db.add_all([farmer1, farmer2])
    db.commit()

    # Farm A at (13.00, 77.50)
    farm_a = Farm(name="Farm A", operator_name="Farmer One", location="Bangalore, Karnataka")
    # Farm B at (13.05, 77.52) (~6 km from A)
    farm_b = Farm(name="Farm B", operator_name="Farmer Two", location="Bangalore, Karnataka")
    # Farm C far away at (14.00, 78.50) (>140 km away)
    farm_c = Farm(name="Farm C Far", operator_name="Farmer Three", location="Bangalore, Karnataka")
    db.add_all([farm_a, farm_b, farm_c])
    db.commit()

    field_a = Field(farm_id=farm_a.id, name="Field A", lat=13.00, lng=77.50, current_crop="Tomato")
    field_b = Field(farm_id=farm_b.id, name="Field B", lat=13.05, lng=77.52, current_crop="Tomato")
    field_c = Field(farm_id=farm_c.id, name="Field C", lat=14.00, lng=78.50, current_crop="Tomato")
    db.add_all([field_a, field_b, field_c])
    db.commit()

    # 4 cases on Farm A, 2 cases on Farm B (all Tomato, Pest)
    now = datetime.datetime.utcnow()
    for i in range(4):
        c = Case(
            case_number=f"CASE-FA-{i+1}",
            user_id=farmer1.id,
            farm_id=farm_a.id,
            field_id=field_a.id,
            crop="Tomato",
            growth_stage="Vegetative",
            issue_category="pest",
            status=CaseState.PENDING_REVIEW,
            created_at=now - datetime.timedelta(days=1),
        )
        db.add(c)
    for i in range(2):
        c = Case(
            case_number=f"CASE-FB-{i+1}",
            user_id=farmer2.id,
            farm_id=farm_b.id,
            field_id=field_b.id,
            crop="Tomato",
            growth_stage="Vegetative",
            issue_category="pest",
            status=CaseState.PENDING_REVIEW,
            created_at=now - datetime.timedelta(days=2),
        )
        db.add(c)
    # 1 case on Farm C (far away)
    case_c = Case(
        case_number="CASE-FC-1",
        user_id=farmer1.id,
        farm_id=farm_c.id,
        field_id=field_c.id,
        crop="Tomato",
        growth_stage="Vegetative",
        issue_category="pest",
        status=CaseState.PENDING_REVIEW,
        created_at=now - datetime.timedelta(days=1),
    )
    db.add(case_c)
    db.commit()

    # Even though there are 6 cases between Farm A and Farm B, there are only 2 distinct farms!
    # OUTBREAK_MIN_FARMS is 3, so NO outbreak should be formed yet.
    outbreaks = detect_outbreaks(db, radius_km=25.0, min_farms=3, alert_farms=6, window_days=14)
    assert len(outbreaks) == 0

    # Now add a 3rd distinct farm (Farm D) within 25km of Farm A (~10 km away)
    farm_d = Farm(name="Farm D", operator_name="Farmer Four", location="Bangalore, Karnataka")
    db.add(farm_d)
    db.commit()
    field_d = Field(farm_id=farm_d.id, name="Field D", lat=13.08, lng=77.54, current_crop="Tomato")
    db.add(field_d)
    db.commit()
    case_d = Case(
        case_number="CASE-FD-1",
        user_id=farmer1.id,
        farm_id=farm_d.id,
        field_id=field_d.id,
        crop="Tomato",
        growth_stage="Vegetative",
        issue_category="pest",
        status=CaseState.PENDING_REVIEW,
        created_at=now - datetime.timedelta(days=1),
    )
    db.add(case_d)
    db.commit()

    # Now we have 3 distinct farms within 25km -> triggers outbreak with 'watch' severity!
    outbreaks = detect_outbreaks(db, radius_km=25.0, min_farms=3, alert_farms=6, window_days=14)
    assert len(outbreaks) == 1
    ob = outbreaks[0]
    assert ob.status == "open"
    assert ob.farm_count == 3
    assert ob.case_count == 7  # 4 from A + 2 from B + 1 from D
    assert ob.severity == "watch"
    assert ob.crop.lower() == "tomato"
    assert ob.issue_category.lower() == "pest"

    # Add 3 more distinct farms (total 6 distinct farms) within radius
    for idx in range(3):
        f = Farm(name=f"Farm Extra {idx}", operator_name=f"Farmer Ex {idx}", location="Bangalore, Karnataka")
        db.add(f)
        db.commit()
        fld = Field(farm_id=f.id, name=f"Field Ex {idx}", lat=13.01 + (idx * 0.02), lng=77.51, current_crop="Tomato")
        db.add(fld)
        db.commit()
        cs = Case(
            case_number=f"CASE-EX-{idx}",
            user_id=farmer1.id,
            farm_id=f.id,
            field_id=fld.id,
            crop="Tomato",
            growth_stage="Vegetative",
            issue_category="pest",
            status=CaseState.PENDING_REVIEW,
            created_at=now,
        )
        db.add(cs)
    db.commit()

    # Re-run detection: should update existing outbreak to 'alert' severity!
    outbreaks = detect_outbreaks(db, radius_km=25.0, min_farms=3, alert_farms=6, window_days=14)
    assert len(outbreaks) == 1
    ob = outbreaks[0]
    assert ob.farm_count == 6
    assert ob.severity == "alert"


# =====================================================================
# 2. Merge Not Duplicate Tests
# =====================================================================

def test_merge_into_existing_outbreak_not_duplicate(db: Session):
    """
    Subsequent detector runs must merge cases into the open outbreak
    rather than duplicating rows.
    """
    farmer = User(username="farmer_mrg", firebase_uid="uid-mrg", role="farmer")
    db.add(farmer)
    db.commit()

    now = datetime.datetime.utcnow()

    # Create 3 farms and cases
    farms = []
    for i in range(3):
        f = Farm(name=f"Merge Farm {i}", operator_name="Merge Farmer", location="Bangalore, Karnataka")
        db.add(f)
        db.commit()
        fld = Field(farm_id=f.id, name=f"Field {i}", lat=12.95 + (i * 0.01), lng=77.58, current_crop="Wheat")
        db.add(fld)
        db.commit()
        c = Case(
            case_number=f"CASE-MRG-{i}",
            user_id=farmer.id,
            farm_id=f.id,
            field_id=fld.id,
            crop="Wheat",
            growth_stage="Vegetative",
            issue_category="disease",
            status=CaseState.PENDING_REVIEW,
            created_at=now - datetime.timedelta(days=2),
        )
        db.add(c)
        farms.append(f)
    db.commit()

    # Initial detection: 1 outbreak
    outbreaks1 = detect_outbreaks(db, radius_km=25.0, min_farms=3, alert_farms=6, window_days=14)
    assert len(outbreaks1) == 1
    original_id = outbreaks1[0].id
    assert db.query(Outbreak).count() == 1

    # Add a new 4th farm and case
    f4 = Farm(name="Merge Farm 4", operator_name="Merge Farmer", location="Bangalore, Karnataka")
    db.add(f4)
    db.commit()
    fld4 = Field(farm_id=f4.id, name="Field 4", lat=12.96, lng=77.59, current_crop="Wheat")
    db.add(fld4)
    db.commit()
    c4 = Case(
        case_number="CASE-MRG-NEW",
        user_id=farmer.id,
        farm_id=f4.id,
        field_id=fld4.id,
        crop="Wheat",
        growth_stage="Vegetative",
        issue_category="disease",
        status=CaseState.PENDING_REVIEW,
        created_at=now,
    )
    db.add(c4)
    db.commit()

    # Second detection: must NOT create a duplicate outbreak
    outbreaks2 = detect_outbreaks(db, radius_km=25.0, min_farms=3, alert_farms=6, window_days=14)
    assert len(outbreaks2) == 1
    assert outbreaks2[0].id == original_id
    assert db.query(Outbreak).count() == 1
    assert outbreaks2[0].farm_count == 4
    assert outbreaks2[0].case_count == 4


# =====================================================================
# 3. Auto-Resolve Tests
# =====================================================================

def test_auto_resolve_stale_outbreak(db: Session):
    """
    An open outbreak with no new cases for WINDOW_DAYS must be auto-resolved.
    """
    now = datetime.datetime.utcnow()
    stale_date = now - datetime.timedelta(days=16)

    ob = Outbreak(
        issue_category="pest",
        crop="Cotton",
        center_lat=15.0,
        center_lng=76.0,
        radius_km=25.0,
        farm_count=4,
        case_count=5,
        severity="watch",
        status="open",
        first_seen=stale_date - datetime.timedelta(days=5),
        last_seen=stale_date,  # 16 days ago > 14 days window
    )
    db.add(ob)
    db.commit()

    # Run auto-resolution
    resolved_count = auto_resolve_stale_outbreaks(db, window_days=14, now=now)
    assert resolved_count == 1

    db.refresh(ob)
    assert ob.status == "resolved"
    assert ob.resolved_at is not None


# =====================================================================
# 4. Notified Once Per User & Privacy-Safe Payload Tests
# =====================================================================

def test_notified_once_per_user_and_privacy_payload(db: Session):
    """
    Verifies:
    - Farmer within radius is notified once and recorded in outbreak_notified.
    - Subsequent notifications are suppressed by unique constraint.
    - Farmer notification message does NOT contain other farms' or farmers' names.
    """
    admin = User(username="admin_notif", firebase_uid="uid-adm-notif", role="admin", email="admin@test.com")
    farmer = User(username="farmer_notif", firebase_uid="uid-far-notif", role="farmer", full_name="Bob Farmer", email="bob@test.com")
    db.add_all([admin, farmer])
    db.commit()

    farm = Farm(name="Bob Farm", operator_name="Bob Farmer", location="Bangalore, Karnataka")
    db.add(farm)
    db.commit()
    fld = Field(farm_id=farm.id, name="Bob Field", lat=12.97, lng=77.59, current_crop="Corn")
    db.add(fld)
    db.commit()

    ob = Outbreak(
        issue_category="pest",
        crop="Corn",
        center_lat=12.98,
        center_lng=77.60,
        radius_km=25.0,
        farm_count=3,
        case_count=3,
        severity="watch",
        status="open",
        first_seen=datetime.datetime.utcnow(),
        last_seen=datetime.datetime.utcnow(),
    )
    db.add(ob)
    db.commit()

    dispatched_notifications = []

    def mock_notify(event, user, payload, db=None, **kwargs):
        dispatched_notifications.append({"event": event, "user": user, "payload": payload})

    with patch("app.services.outbreaks.notify", side_effect=mock_notify):
        dispatch_outbreak_notifications(db, ob)

    # First dispatch: admin notified + farmer notified
    assert len(dispatched_notifications) >= 2
    farmer_notif = next((n for n in dispatched_notifications if n["user"].id == farmer.id), None)
    assert farmer_notif is not None

    payload = farmer_notif["payload"]
    # PRIVACY SAFE MESSAGE:
    assert "Bob Farm" not in payload["message"]
    assert "Bob Farmer" not in payload["message"]
    assert "within 25 km of your area" in payload["location"]
    assert "Scout your Corn for Pest" in payload["action"]

    # Verify DB records in outbreak_notified (farmer + admin)
    records = db.query(OutbreakNotified).filter(OutbreakNotified.outbreak_id == ob.id).all()
    user_ids = {r.user_id for r in records}
    assert farmer.id in user_ids
    assert admin.id in user_ids
    assert len(records) == 2

    # Dispatch a second time: farmer must NOT be notified again
    dispatched_notifications.clear()
    with patch("app.services.outbreaks.notify", side_effect=mock_notify):
        dispatch_outbreak_notifications(db, ob)

    farmer_notif_second = next((n for n in dispatched_notifications if n["user"].id == farmer.id), None)
    assert farmer_notif_second is None


# =====================================================================
# 5. API Endpoints & Role Guard Tests
# =====================================================================

def test_outbreak_endpoints_and_role_guards(client: TestClient, db: Session):
    """
    Tests:
    - GET /admin/outbreaks: Admin and agronomist 200, farmer 403.
    - GET /admin/outbreaks/{id}: Admin and agronomist 200, farmer 403.
    - PATCH /admin/outbreaks/{id}/resolve: Admin 200, agronomist/farmer 403.
    - GET /admin/map/cases: Admin and agronomist 200, farmer 403.
    - GET /alerts/nearby: Farmer gets privacy-safe response without other farm IDs/names.
    """
    admin = User(username="admin_api", firebase_uid="uid-adm-api", role="admin")
    agronomist = User(username="agro_api", firebase_uid="uid-agr-api", role="agronomist")
    farmer = User(username="farmer_api", firebase_uid="uid-far-api", role="farmer", full_name="Alice Green")
    db.add_all([admin, agronomist, farmer])
    db.commit()

    farm = Farm(name="Secret Farm", operator_name="Alice Green", location="Bangalore, Karnataka")
    db.add(farm)
    db.commit()
    fld = Field(farm_id=farm.id, name="Secret Field", lat=13.0, lng=77.5, current_crop="Soybean")
    db.add(fld)
    db.commit()

    case = Case(
        case_number="CASE-API-1",
        user_id=farmer.id,
        farm_id=farm.id,
        field_id=fld.id,
        crop="Soybean",
        growth_stage="Vegetative",
        issue_category="pest",
        status=CaseState.PENDING_REVIEW,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(case)
    db.commit()

    ob = Outbreak(
        issue_category="pest",
        crop="Soybean",
        center_lat=13.01,
        center_lng=77.51,
        radius_km=25.0,
        farm_count=3,
        case_count=4,
        severity="watch",
        status="open",
        first_seen=datetime.datetime.utcnow(),
        last_seen=datetime.datetime.utcnow(),
    )
    db.add(ob)
    db.commit()

    app = client.app

    # --- 1. Farmer attempts admin endpoints -> 403 Forbidden ---
    app.dependency_overrides[get_current_user] = lambda: farmer
    assert client.get("/v1/admin/outbreaks").status_code == 403
    assert client.get(f"/v1/admin/outbreaks/{ob.id}").status_code == 403
    assert client.patch(f"/v1/admin/outbreaks/{ob.id}/resolve").status_code == 403
    assert client.get("/v1/admin/map/cases").status_code == 403

    # --- 2. Agronomist access ---
    app.dependency_overrides[get_current_user] = lambda: agronomist
    res_agro_list = client.get("/v1/admin/outbreaks")
    assert res_agro_list.status_code == 200
    assert len(res_agro_list.json()) >= 1

    res_agro_detail = client.get(f"/v1/admin/outbreaks/{ob.id}")
    assert res_agro_detail.status_code == 200

    res_agro_map = client.get("/v1/admin/map/cases")
    assert res_agro_map.status_code == 200

    # Agronomist cannot resolve an outbreak (read-only) -> 403 Forbidden
    res_agro_patch = client.patch(f"/v1/admin/outbreaks/{ob.id}/resolve")
    assert res_agro_patch.status_code == 403

    # --- 3. Admin access ---
    app.dependency_overrides[get_current_user] = lambda: admin
    res_admin_list = client.get("/v1/admin/outbreaks?status=open")
    assert res_admin_list.status_code == 200

    res_admin_map = client.get("/v1/admin/map/cases?days=14")
    assert res_admin_map.status_code == 200
    map_cases = res_admin_map.json()
    assert len(map_cases) >= 1
    assert map_cases[0]["lat"] is not None
    assert map_cases[0]["lng"] is not None

    # Admin resolves outbreak -> 200 OK
    res_admin_resolve = client.patch(f"/v1/admin/outbreaks/{ob.id}/resolve")
    assert res_admin_resolve.status_code == 200
    assert res_admin_resolve.json()["status"] == "resolved"

    # --- 4. Farmer nearby alerts privacy test ---
    # Re-open outbreak for nearby alerts test
    ob.status = "open"
    db.commit()

    app.dependency_overrides[get_current_user] = lambda: farmer
    res_farmer_nearby = client.get("/v1/alerts/nearby")
    assert res_farmer_nearby.status_code == 200
    nearby_items = res_farmer_nearby.json()
    assert len(nearby_items) >= 1

    for item in nearby_items:
        # PRIVACY GUARANTEE: No leaked other farm IDs or names
        assert "farm_name" not in item
        assert "farm_id" not in item
        assert "cases" not in item
        assert "lat" not in item
        assert "lng" not in item
        assert "center_lat" not in item
        assert "center_lng" not in item
        assert "Secret Farm" not in item["message"]
        assert "Scout your Soybean for Pest" in item["action"]

    # Clean up overrides
    app.dependency_overrides.pop(get_current_user, None)
