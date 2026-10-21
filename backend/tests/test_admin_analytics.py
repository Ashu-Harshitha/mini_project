import datetime
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import get_current_user
from app.models.models import (
    Case,
    Review,
    Assignment,
    OutcomeFeedback,
    SensorReport,
    WeatherAlert,
    Farm,
    Field,
    Message,
)
from app.services.case_state import CaseState
from app.services.analytics import clear_analytics_cache


@pytest.fixture(autouse=True)
def clean_cache():
    clear_analytics_cache()
    yield
    clear_analytics_cache()
    app.dependency_overrides.clear()


def test_empty_database_returns_zeros_without_errors(client, test_admin, db):
    """An empty database must return zeros and nulls without errors."""
    app.dependency_overrides[get_current_user] = lambda: test_admin
    res = client.get("/admin/analytics")
    assert res.status_code == 200, res.text
    data = res.json()

    kpis = data["kpis"]
    assert kpis["total_cases"]["value"] == 0
    assert kpis["cases_in_range"]["value"] == 0
    assert kpis["avg_hours_to_decision"]["value"] is None
    assert kpis["unassigned_now"]["value"] == 0
    assert kpis["pending_now"]["value"] == 0
    assert kpis["avg_rating"]["value"] is None
    assert kpis["reassign_rate"]["value"] is None
    assert kpis["ai_degraded_rate"]["value"] is None
    assert kpis["sensor_report_rate"]["value"] is None
    assert kpis["outcome_success_rate"]["value"] is None

    assert data["ai_agreement_rate"] is None
    assert len(data["cases_per_day"]) >= 30
    assert len(data["by_crop"]) == 0
    assert len(data["by_issue_category"]) == 0
    assert len(data["sensor_findings"]) == 5
    assert all(sf["count"] == 0 for sf in data["sensor_findings"])
    assert len(data["alerts_by_rule"]) == 0


def test_invalid_date_ranges(client, test_admin):
    """Validates from < to and range <= 366 days."""
    app.dependency_overrides[get_current_user] = lambda: test_admin

    # from >= to
    res = client.get("/admin/analytics?from=2026-10-10T00:00:00Z&to=2026-10-05T00:00:00Z")
    assert res.status_code == 422
    assert "strictly earlier" in res.text

    # from == to
    res = client.get("/admin/analytics?from=2026-10-10T00:00:00Z&to=2026-10-10T00:00:00Z")
    assert res.status_code == 422

    # range > 366 days
    res = client.get("/admin/analytics?from=2024-01-01T00:00:00Z&to=2025-06-01T00:00:00Z")
    assert res.status_code == 422
    assert "366 days" in res.text


def test_role_authorization_non_admins_get_403(client, test_user, test_agronomist):
    """Non-admins get 403 Forbidden on analytics endpoints."""
    # Farmer
    app.dependency_overrides[get_current_user] = lambda: test_user
    res = client.get("/admin/analytics")
    assert res.status_code == 403

    res_csv = client.get("/admin/analytics/export.csv")
    assert res_csv.status_code == 403

    # Agronomist
    app.dependency_overrides[get_current_user] = lambda: test_agronomist
    res = client.get("/admin/analytics")
    assert res.status_code == 403


def test_seeded_kpis_and_period_deltas(client, db, test_admin, test_user, test_agronomist):
    """
    Seeded fixture tests exact KPI calculations, previous-period deltas,
    decision mix, agronomist stats, and zero-filled dates.
    """
    app.dependency_overrides[get_current_user] = lambda: test_admin

    now = datetime.datetime.utcnow().replace(microsecond=0)
    # Define range: last 10 days
    from_dt = now - datetime.timedelta(days=10)
    to_dt = now
    # Prev period: 10 days before from_dt
    prev_from_dt = from_dt - datetime.timedelta(days=10)

    # 1. Setup Farm & Field
    farm = Farm(name="Green Acre", operator_name="John Doe", location="Ames, IA")
    db.add(farm)
    db.commit()
    field = Field(name="North Corn", farm_id=farm.id, acreage=40.0)
    db.add(field)
    db.commit()

    # 2. Previous Period Data (created in [prev_from_dt, from_dt])
    case_prev1 = Case(
        case_number="CASE-PREV-01",
        farm_id=farm.id,
        field_id=field.id,
        user_id=test_user.id,
        crop="Corn",
        growth_stage="Vegetative",
        status=CaseState.APPROVED,
        created_at=prev_from_dt + datetime.timedelta(days=2),
    )
    case_prev2 = Case(
        case_number="CASE-PREV-02",
        farm_id=farm.id,
        field_id=field.id,
        user_id=test_user.id,
        crop="Soybean",
        growth_stage="Reproductive",
        status=CaseState.APPROVED,
        assigned_agronomist_id=test_agronomist.id,
        created_at=prev_from_dt + datetime.timedelta(days=4),
    )
    db.add_all([case_prev1, case_prev2])
    db.commit()

    # 3. Current Period Data (created in [from_dt, to_dt])
    # Case 1: Corn, low nitrogen sensor summary, assigned, decided Approved in 2h, outcome improved with rating 5
    case_curr1 = Case(
        case_number="CASE-CURR-01",
        farm_id=farm.id,
        field_id=field.id,
        user_id=test_user.id,
        crop="Corn",
        growth_stage="V6",
        issue_category="nitrogen_deficiency",
        status=CaseState.DELIVERED,
        assigned_agronomist_id=test_agronomist.id,
        assigned_at=from_dt + datetime.timedelta(days=1, hours=2),
        sensor_summary={
            "latest": {"n_mgkg": 20.0, "soil_moisture_pct": 15.0, "leaf_wetness_pct": 75.0},
            "hours_leaf_wetness_ge_70": 7.0,
        },
        created_at=from_dt + datetime.timedelta(days=1),
    )

    # Case 2: Rice, reassign_count=1, decided with edits in 6h, outcome same with rating 3
    case_curr2 = Case(
        case_number="CASE-CURR-02",
        farm_id=farm.id,
        field_id=field.id,
        user_id=test_user.id,
        crop="Rice",
        growth_stage="Flowering",
        issue_category="pest_damage",
        reassign_count=1,
        status=CaseState.APPROVED_WITH_EDITS,
        assigned_agronomist_id=test_agronomist.id,
        assigned_at=from_dt + datetime.timedelta(days=3, hours=1),
        created_at=from_dt + datetime.timedelta(days=3),
    )

    # Case 3: Wheat, ai_degraded=True, in PENDING_REVIEW assigned to test_agronomist
    case_curr3 = Case(
        case_number="CASE-CURR-03",
        farm_id=farm.id,
        field_id=field.id,
        user_id=test_user.id,
        crop="Wheat",
        growth_stage="Tillering",
        issue_category="fungal_disease",
        ai_degraded=True,
        status=CaseState.PENDING_REVIEW,
        assigned_agronomist_id=test_agronomist.id,
        assigned_at=from_dt + datetime.timedelta(days=5),
        created_at=from_dt + datetime.timedelta(days=5),
    )

    # Case 4: Unassigned case in DRAFT
    case_curr4 = Case(
        case_number="CASE-CURR-04",
        farm_id=farm.id,
        field_id=field.id,
        user_id=test_user.id,
        crop="Corn",
        growth_stage="Emergence",
        status=CaseState.DRAFT,
        assigned_agronomist_id=None,
        created_at=from_dt + datetime.timedelta(days=6),
    )

    db.add_all([case_curr1, case_curr2, case_curr3, case_curr4])
    db.commit()

    # Sensor report attached to Case 1
    sr1 = SensorReport(case_id=case_curr1.id, field_id=field.id, parse_method="table", created_at=case_curr1.created_at)
    db.add(sr1)

    # Reviews
    # Review 1 for Case 1: turnaround = 2h (decided at assigned_at + 2h)
    rev1 = Review(
        case_id=case_curr1.id,
        reviewer_id=test_agronomist.id,
        status="APPROVED",
        decision="APPROVED",
        decided_at=case_curr1.assigned_at + datetime.timedelta(hours=2),
        created_at=case_curr1.assigned_at + datetime.timedelta(hours=2),
    )
    # Review 2 for Case 2: turnaround = 6h (decided at assigned_at + 6h)
    rev2 = Review(
        case_id=case_curr2.id,
        reviewer_id=test_agronomist.id,
        status="APPROVED_WITH_EDITS",
        decision="APPROVED_WITH_EDITS",
        decided_at=case_curr2.assigned_at + datetime.timedelta(hours=6),
        created_at=case_curr2.assigned_at + datetime.timedelta(hours=6),
    )
    db.add_all([rev1, rev2])
    db.commit()

    # Feedback ratings
    fb1 = OutcomeFeedback(
        case_id=case_curr1.id,
        user_id=test_user.id,
        agronomist_id=test_agronomist.id,
        rating=5,
        outcome="improved",
        created_at=case_curr1.created_at + datetime.timedelta(days=1),
    )
    fb2 = OutcomeFeedback(
        case_id=case_curr2.id,
        user_id=test_user.id,
        agronomist_id=test_agronomist.id,
        rating=3,
        outcome="same",
        created_at=case_curr2.created_at + datetime.timedelta(days=1),
    )
    db.add_all([fb1, fb2])

    # Assignment timeout record
    assign_timeout = Assignment(
        case_id=case_curr2.id,
        from_user_id=test_agronomist.id,
        to_user_id=test_agronomist.id,
        reason="timeout",
        created_at=from_dt + datetime.timedelta(days=2),
    )
    db.add(assign_timeout)

    # Weather alert in range
    w_alert = WeatherAlert(
        farm_id=farm.id,
        source="weather",
        rule="heavy_rain",
        severity="warning",
        start_date=now.date(),
        dedupe_key=f"{farm.id}:heavy_rain:{now.date().isoformat()}",
        created_at=from_dt + datetime.timedelta(days=3),
    )
    db.add(w_alert)
    db.commit()

    # Query analytics API
    from_iso = from_dt.isoformat() + "Z"
    to_iso = to_dt.isoformat() + "Z"
    res = client.get(f"/admin/analytics?from={from_iso}&to={to_iso}")
    assert res.status_code == 200, res.text
    data = res.json()

    kpis = data["kpis"]
    # Total cases all time = 2 prev + 4 curr = 6
    assert kpis["total_cases"]["value"] == 6
    assert kpis["total_cases"]["previous_value"] == 2

    # Cases in range = 4 (prev = 2)
    assert kpis["cases_in_range"]["value"] == 4
    assert kpis["cases_in_range"]["previous_value"] == 2

    # Avg hours to decision: (2h + 6h) / 2 = 4.0h
    assert kpis["avg_hours_to_decision"]["value"] == 4.0

    # Unassigned now = Case 4 = 1
    assert kpis["unassigned_now"]["value"] == 1

    # Pending now = Case 3 = 1
    assert kpis["pending_now"]["value"] == 1

    # Reassign rate = 1 / 4 = 0.25
    assert kpis["reassign_rate"]["value"] == 0.25

    # AI degraded rate = 1 / 4 = 0.25
    assert kpis["ai_degraded_rate"]["value"] == 0.25

    # Sensor report rate = 1 / 4 = 0.25
    assert kpis["sensor_report_rate"]["value"] == 0.25

    # Outcome success rate = 1 improved out of 2 = 0.5
    assert kpis["outcome_success_rate"]["value"] == 0.5

    # Avg rating = (5 + 3) / 2 = 4.0
    assert kpis["avg_rating"]["value"] == 4.0

    # Decision mix & AI agreement
    assert data["decision_mix"]["approve"] == 1
    assert data["decision_mix"]["approve_with_edits"] == 1
    assert data["decision_mix"]["reject"] == 0
    assert data["ai_agreement_rate"] == 0.5  # 1 / 2

    # Agronomist stats
    ag_stat = next((a for a in data["agent_stats"] if a["agronomist_id"] == test_agronomist.id), None)
    assert ag_stat is not None
    assert ag_stat["reviewed"] == 2
    assert ag_stat["open"] == 1
    assert ag_stat["avg_hours_to_decision"] == 4.0
    assert ag_stat["avg_rating"] == 4.0
    assert ag_stat["timeout_count"] == 1

    # Sensor findings (low nitrogen, dry soil, high leaf wetness detected)
    sf_map = {sf["key"]: sf["count"] for sf in data["sensor_findings"]}
    assert sf_map["low_nitrogen"] == 1
    assert sf_map["dry_soil"] == 1
    assert sf_map["high_leaf_wetness"] == 1

    # Weather alerts by rule
    assert len(data["alerts_by_rule"]) == 1
    assert data["alerts_by_rule"][0]["rule"] == "heavy_rain"
    assert data["alerts_by_rule"][0]["count"] == 1

    # Zero filled days: from from_dt.date() to to_dt.date() = 11 days
    expected_days = (to_dt.date() - from_dt.date()).days + 1
    assert len(data["cases_per_day"]) == expected_days
    # Verify days without activity have created=0, decided=0
    zero_days = [d for d in data["cases_per_day"] if d["created"] == 0 and d["decided"] == 0]
    assert len(zero_days) > 0


def test_csv_export_sections_bom_and_injection_prefix(client, test_admin):
    """
    Tests CSV streaming export for kpis, cases, agents, and sensors.
    Verifies UTF-8 BOM (\ufeff) prefix and formula injection protection (=, +, -, @).
    """
    app.dependency_overrides[get_current_user] = lambda: test_admin

    for section in ["kpis", "cases", "agents", "sensors"]:
        res = client.get(f"/admin/analytics/export.csv?section={section}")
        assert res.status_code == 200, res.text
        assert res.headers["content-type"].startswith("text/csv")
        content_bytes = res.content
        # Must start with UTF-8 BOM
        assert content_bytes.startswith(b"\xef\xbb\xbf")
        text = content_bytes.decode("utf-8")
        assert len(text) > 5

    # Invalid section returns 422
    res_bad = client.get("/admin/analytics/export.csv?section=hack")
    assert res_bad.status_code == 422
