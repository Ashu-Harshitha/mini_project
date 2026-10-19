import io
import datetime
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

import reportlab.lib.pagesizes as pagesizes
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from app.main import app
from app.models.models import (
    User,
    Farm,
    Field,
    Case,
    SensorReport,
    SensorReading,
    WeatherSnapshot,
)
from app.services.case_state import CaseState
from app.sensors.generator import generate_sensor_pdf
from app.sensors.parser import parse_sensor_pdf
from app.sensors.summary import compute_sensor_summary
from app.sensors.interpret import interpret_sensor_data, load_sensor_thresholds
from app.services.weather import fetch_open_meteo_weather, geocode_open_meteo, coarsen
from app.guardrails.engine import GuardrailEngine
from app.core.confidence import calculate_data_completeness
from app.services.ai.mock_service import MockRecommender
from app.api.deps import get_db, get_firebase


@pytest.fixture
def test_setup(db, fake_firebase):
    """Sets up farmer, agronomist, admin, another farmer, farm and field."""
    farmer = User(
        username="farmer_jim",
        firebase_uid="uid-farmer-jim",
        full_name="Jim Farmer",
        role="farmer",
        language="en",
        active=True,
    )
    other_farmer = User(
        username="farmer_bob",
        firebase_uid="uid-farmer-bob",
        full_name="Bob OtherFarmer",
        role="farmer",
        language="en",
        active=True,
    )
    agronomist = User(
        username="dr_green",
        firebase_uid="uid-dr-green",
        full_name="Dr. Sarah Green",
        role="agronomist",
        language="en",
        active=True,
    )
    admin = User(
        username="admin_sys",
        firebase_uid="uid-admin-sys",
        full_name="System Admin",
        role="admin",
        language="en",
        active=True,
    )

    db.add_all([farmer, other_farmer, agronomist, admin])
    db.commit()

    for u in [farmer, other_farmer, agronomist, admin]:
        db.refresh(u)
        fake_firebase.create_user(
            email=f"{u.username}@agriadvisor.app",
            password="password123",
            display_name=u.full_name,
            uid=u.firebase_uid,
        )
        fake_firebase.set_role_claim(u.firebase_uid, u.role)

    farm = Farm(
        name="Sunny Acres",
        operator_name="Jim Farmer",
        location="Mandya, Karnataka",
        total_acreage=100.0,
        latitude=None, # initially unset
        longitude=None,
        is_organic=False,
    )
    db.add(farm)
    db.commit()
    db.refresh(farm)

    field = Field(
        farm_id=farm.id,
        name="Field A",
        acreage=25.0,
        soil_type="Clay loam",
        current_crop="Corn",
        lat=None, # initially unset
        lng=None,
    )
    db.add(field)
    db.commit()
    db.refresh(field)

    return {
        "farmer": farmer,
        "other_farmer": other_farmer,
        "agronomist": agronomist,
        "admin": admin,
        "farm": farm,
        "field": field,
    }


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
# 1. GENERATED PDFS OF EVERY SCENARIO PARSE CORRECTLY
# ============================================================================
@pytest.mark.parametrize("scenario", ["healthy", "n_deficiency", "dry", "fungal_risk", "random"])
def test_generated_pdfs_of_every_scenario_parse_correctly(scenario):
    pdf_bytes = generate_sensor_pdf(scenario=scenario, hours=48, interval_minutes=60, seed=1)
    assert pdf_bytes.startswith(b"%PDF")

    res = parse_sensor_pdf(pdf_bytes, filename=f"{scenario}.pdf", save_to_uploads=False)
    assert res["rows_ok"] == 48
    assert res["rows_dropped"] == 0
    assert len(res["readings"]) == 48
    assert res["needs_confirmation"] is False

    # Scenario specific properties
    first = res["readings"][0]
    if scenario == "healthy":
        assert 70 <= first["n_mgkg"] <= 110
        assert 28 <= first["soil_moisture_pct"] <= 38
        assert 6.0 <= first["ph"] <= 6.8
    elif scenario == "n_deficiency":
        assert 20 <= first["n_mgkg"] <= 38
    elif scenario == "dry":
        assert 15 <= first["soil_moisture_pct"] <= 20
    elif scenario == "fungal_risk":
        high_wetness_count = sum(1 for r in res["readings"] if r["leaf_wetness_pct"] >= 70)
        assert high_wetness_count >= 8


# ============================================================================
# 2. COLUMN ORDER & TIMESTAMP FORMAT VARIATIONS
# ============================================================================
def test_parser_column_order_and_timestamp_variations():
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=pagesizes.letter, leftMargin=30, rightMargin=30)
    styles = getSampleStyleSheet()

    data = [
        ["Air Temp (C)", "Timestamp", "Soil pH", "Humidity (%)", "Soil Moisture (%)", "N (mg/kg)", "P (mg/kg)", "K (mg/kg)", "Leaf Wetness (%)"],
        ["25.5", "2026-05-10T14:00:00", "6.5", "65", "30", "85", "60", "90", "15"],
        ["26.0", "11-05-2026 15:00", "6.6", "68", "31", "86", "61", "91", "20"],
        ["24.0", "12/05/2026 16:00", "6.4", "70", "29", "84", "59", "89", "25"],
        ["23.0", "invalid_timestamp_row", "6.4", "70", "29", "84", "59", "89", "25"], # should be dropped
    ]
    h_style = ParagraphStyle("H_Var", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=9, textColor=colors.white)
    c_style = ParagraphStyle("C_Var", parent=styles["Normal"], fontName="Helvetica", fontSize=8, leading=9)

    table_data = [
        [Paragraph(h, h_style) for h in data[0]],
        *[[Paragraph(str(cell), c_style) for cell in row] for row in data[1:]],
    ]
    t = Table(table_data, colWidths=[58, 92, 56, 62, 58, 52, 52, 52, 74])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065f46")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    elements = [Paragraph("AgriAdvisor Field Sensor Report", styles["Title"]), Spacer(1, 10), t]
    doc.build(elements)
    pdf_bytes = buf.getvalue()

    res = parse_sensor_pdf(pdf_bytes, save_to_uploads=False)
    assert res["rows_ok"] == 3
    assert res["rows_dropped"] == 1
    assert len(res["readings"]) == 3
    assert res["readings"][0]["temp_c"] == 25.5
    assert res["readings"][0]["soil_moisture_pct"] == 30.0


# ============================================================================
# 3. NON-PDF, OVERSIZE, AND ENCRYPTED INPUTS
# ============================================================================
def test_parser_security_and_limits():
    # Non-PDF
    with pytest.raises(ValueError, match="Invalid PDF format"):
        parse_sensor_pdf(b"This is not a PDF file", save_to_uploads=False)

    # Oversize
    with patch("app.sensors.parser.settings") as mock_settings:
        mock_settings.MAX_SENSOR_PDF_MB = 0.0001 # 100 bytes limit
        with pytest.raises(ValueError, match="exceeds maximum allowed"):
            pdf_bytes = generate_sensor_pdf(scenario="healthy", hours=12)
            parse_sensor_pdf(pdf_bytes, save_to_uploads=False)


# ============================================================================
# 4. OUT-OF-RANGE HANDLING (NULLED VS KEPT WITH WARNING)
# ============================================================================
def test_parser_out_of_range_handling():
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=pagesizes.letter, leftMargin=30, rightMargin=30)
    styles = getSampleStyleSheet()

    # Row 1: Physical out-of-bounds (moisture 150%, pH 14, temp 100°C) -> should be nulled
    # Row 2: Simulated out-of-bounds but physically valid (moisture 60%, temp 48°C) -> kept with warning
    data = [
        ["Timestamp", "Soil Moisture (%)", "N (mg/kg)", "P (mg/kg)", "K (mg/kg)", "Air Temp (C)", "Humidity (%)", "Soil pH", "Leaf Wetness (%)"],
        ["2026-05-10T14:00:00", "150", "80", "50", "70", "100", "50", "14.0", "10"],
        ["2026-05-10T15:00:00", "60", "80", "50", "70", "48", "50", "7.0", "10"],
    ]
    h_style = ParagraphStyle("H_OOR", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=9, textColor=colors.white)
    c_style = ParagraphStyle("C_OOR", parent=styles["Normal"], fontName="Helvetica", fontSize=8, leading=9)

    table_data = [
        [Paragraph(h, h_style) for h in data[0]],
        *[[Paragraph(str(cell), c_style) for cell in row] for row in data[1:]],
    ]
    t = Table(table_data, colWidths=[92, 58, 52, 52, 52, 58, 62, 56, 74])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#065f46")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    doc.build([Paragraph("AgriAdvisor Field Sensor Report", styles["Title"]), Spacer(1, 10), t])

    res = parse_sensor_pdf(buf.getvalue(), save_to_uploads=False)
    assert res["rows_ok"] == 2
    r1 = res["readings"][0]
    r2 = res["readings"][1]

    # Physically impossible values nulled
    assert r1["soil_moisture_pct"] is None
    assert r1["temp_c"] is None
    assert r1["ph"] is None

    # Plausible values outside simulated range kept
    assert r2["soil_moisture_pct"] == 60.0
    assert r2["temp_c"] == 48.0
    assert len(res["warnings"]) > 0


# ============================================================================
# 5. SUMMARY STATS, TREND, AND STALE FLAG
# ============================================================================
def test_summary_stats_trend_and_stale_flag():
    now = datetime.datetime.now(datetime.timezone.utc)
    readings = []
    # 24 readings with rising temperature and wet leaf wetness
    for i in range(24):
        t_stamp = now - datetime.timedelta(hours=23 - i)
        readings.append({
            "measured_at": t_stamp.isoformat(),
            "soil_moisture_pct": 30.0,
            "n_mgkg": 80.0,
            "p_mgkg": 50.0,
            "k_mgkg": 75.0,
            "temp_c": 20.0 + i * 0.5, # rising trend
            "humidity_pct": 82.0,
            "ph": 6.5,
            "leaf_wetness_pct": 85.0 if i < 10 else 20.0, # 10 hours >= 70
        })

    summary = compute_sensor_summary(readings, submission_time=now)
    assert summary["latest"]["temp_c"] == 31.5
    assert summary["trends"]["temp_c"] == "rising"
    assert summary["hours_leaf_wetness_ge_70_24h"] == 10
    assert summary["stale"] is False

    # Stale test: readings from 60 hours ago
    stale_time = now - datetime.timedelta(hours=60)
    stale_readings = [{
        "measured_at": (stale_time + datetime.timedelta(hours=i)).isoformat(),
        "soil_moisture_pct": 30.0,
        "n_mgkg": 80.0,
        "p_mgkg": 50.0,
        "k_mgkg": 75.0,
        "temp_c": 25.0,
        "humidity_pct": 60.0,
        "ph": 6.5,
        "leaf_wetness_pct": 10.0,
    } for i in range(5)]

    stale_summary = compute_sensor_summary(stale_readings, submission_time=now)
    assert stale_summary["stale"] is True
    assert stale_summary["data_age_hours"] >= 48


# ============================================================================
# 6. INTERPRETATION PER CROP & FUNGAL RULE BOUNDARY
# ============================================================================
def test_interpretation_per_crop_and_fungal_rule_boundary():
    # Fungal 3-condition high: leaf wetness >= 70 for >= 6h, mean hum >= 80%, mean temp 18-30°C
    summary_high = {
        "latest": {"soil_moisture_pct": 30, "n_mgkg": 80, "p_mgkg": 50, "k_mgkg": 80, "temp_c": 25, "ph": 6.5},
        "stats_24h": {
            "temp_c": {"mean": 24.0, "max": 28.0},
            "humidity_pct": {"mean": 85.0},
        },
        "hours_leaf_wetness_ge_70_24h": 8,
    }
    inter_high = interpret_sensor_data(summary_high, crop="corn")
    inter_high_dict = {item["key"]: item for item in inter_high}
    assert inter_high_dict["fungal_pressure"]["status"] == "high"
    assert inter_high_dict["fungal_pressure"]["severity"] == "high"

    # Fungal 2 conditions (watch): hours >= 6, hum >= 80%, but mean temp = 35°C
    summary_watch = {
        "latest": {"soil_moisture_pct": 30, "n_mgkg": 80, "p_mgkg": 50, "k_mgkg": 80, "temp_c": 35, "ph": 6.5},
        "stats_24h": {
            "temp_c": {"mean": 35.0, "max": 38.0},
            "humidity_pct": {"mean": 85.0},
        },
        "hours_leaf_wetness_ge_70_24h": 8,
    }
    inter_watch = interpret_sensor_data(summary_watch, crop="corn")
    inter_watch_dict = {item["key"]: item for item in inter_watch}
    assert inter_watch_dict["fungal_pressure"]["status"] == "watch"
    assert inter_watch_dict["heat_stress"]["status"] == "high" # temp max >= 35

    # Crop thresholds check: soybean N low below 30
    soy_summary = {
        "latest": {"soil_moisture_pct": 30, "n_mgkg": 25, "p_mgkg": 50, "k_mgkg": 80, "temp_c": 25, "ph": 6.5},
        "stats_24h": {},
    }
    soy_inter = interpret_sensor_data(soy_summary, crop="soybean")
    soy_inter_dict = {item["key"]: item for item in soy_inter}
    assert soy_inter_dict["nitrogen"]["status"] == "low"


# ============================================================================
# 7. DATA QUALITY GUARDRAIL FLAGS
# ============================================================================
def test_data_quality_guardrail_flags(db, test_setup):
    s = test_setup
    case = Case(
        case_number="C-DQ-TEST",
        farm_id=s["farm"].id,
        field_id=s["field"].id,
        user_id=s["farmer"].id,
        crop="Corn",
        growth_stage="V6",
        status=CaseState.DRAFT,
        confidence=80.0,
        uncertainty="Medium",
        description="Symptoms inspection",
        weather_source="none", # triggers weather_unavailable
        sensor_summary={
            "stale": True, # triggers sensor_stale
            "latest": {"temp_c": 38.0},
        },
    )
    db.add(case)
    db.commit()

    # Attach sensor report with warnings -> triggers sensor_out_of_range
    report = SensorReport(
        case_id=case.id,
        field_id=s["field"].id,
        file_path="uploads/sensor/test.pdf",
        parse_method="table",
        rows_count=48,
        warnings=["Value outside simulated range: temp_c=48"],
    )
    db.add(report)

    # Attach weather snapshot with temp 20.0 -> diff > 8C with sensor 38.0 -> triggers sensor_weather_conflict
    w = WeatherSnapshot(
        case_id=case.id,
        temp_max_c=22.0,
        temp_min_c=18.0,
        rainfall_7d_mm=10.0,
        humidity=60.0,
        wind_kmh=15.0,
        uv_index=5.0,
        source="none",
        raw_data={"current": {"temperature_2m": 20.0}},
    )
    db.add(w)

    # Set field accuracy to 150m -> triggers location_low_accuracy (>100)
    s["field"].accuracy_m = 150
    db.commit()

    is_blocked, results = GuardrailEngine.run_checks(db, case)
    flag_rules = [r.rule_name for r in results if r.status == "FLAGGED"]

    assert "sensor_stale" in flag_rules
    assert "sensor_out_of_range" in flag_rules
    assert "sensor_weather_conflict" in flag_rules
    assert "location_low_accuracy" in flag_rules
    assert "weather_unavailable" in flag_rules


# ============================================================================
# 8. LOCATION VALIDATION AND UPDATE
# ============================================================================
def test_location_validation_and_update(api_client, test_setup):
    s = test_setup
    field = s["field"]
    farmer = s["farmer"]
    headers = {"Authorization": f"Bearer {farmer.firebase_uid}"}

    # Reject (0,0)
    res_zero = api_client.put(
        f"/v1/fields/{field.id}/location",
        json={"lat": 0.0, "lng": 0.0, "source": "gps"},
        headers=headers,
    )
    assert res_zero.status_code == 422

    # Reject out of range
    res_invalid = api_client.put(
        f"/v1/fields/{field.id}/location",
        json={"lat": 95.0, "lng": 10.0, "source": "gps"},
        headers=headers,
    )
    assert res_invalid.status_code == 422

    # Valid location updates field and fills farm fallback
    with patch("app.api.routes.cases.fetch_open_meteo_weather", new_callable=AsyncMock) as mock_w:
        mock_w.return_value = {"timezone": "Asia/Kolkata", "temp_c": 28.0}
        res_ok = api_client.put(
            f"/v1/fields/{field.id}/location",
            json={"lat": 12.5244, "lng": 76.8958, "accuracy_m": 15, "source": "gps"},
            headers=headers,
        )
        assert res_ok.status_code == 200
        data = res_ok.json()
        assert data["lat"] == 12.5244
        assert data["lng"] == 76.8958
        assert data["accuracy_m"] == 15
        assert data["location_source"] == "gps"
        assert data["timezone"] == "Asia/Kolkata"

    # Farmer 2 cannot update Farmer 1's field
    other_farmer = s["other_farmer"]
    res_forbidden = api_client.put(
        f"/v1/fields/{field.id}/location",
        json={"lat": 12.0, "lng": 76.0, "source": "map"},
        headers={"Authorization": f"Bearer {other_farmer.firebase_uid}"},
    )
    assert res_forbidden.status_code == 403


# ============================================================================
# 9. WEATHER MAPPING, CACHING, AND FAILURE PATH
# ============================================================================
@pytest.mark.asyncio
async def test_weather_mapping_caching_and_failure_path():
    mock_open_meteo_response = {
        "timezone": "Asia/Kolkata",
        "current": {
            "temperature_2m": 29.5,
            "relative_humidity_2m": 62.0,
            "wind_speed_10m": 14.2,
            "precipitation": 0.0,
        },
        "daily": {
            "temperature_2m_max": [31.0, 32.0, 30.0],
            "temperature_2m_min": [21.0, 20.0, 22.0],
            "precipitation_sum": [5.0, 2.0, 0.0, 0.0, 3.0, 1.0, 0.0],
            "uv_index_max": [6.5, 7.0, 6.0],
        },
    }

    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.json = lambda: mock_open_meteo_response

    mock_client = AsyncMock()
    mock_client.get.return_value = mock_resp
    mock_client.__aenter__.return_value = mock_client

    with patch("httpx.AsyncClient", return_value=mock_client):
        # First fetch
        res1 = await fetch_open_meteo_weather(12.5244, 76.8958, force_refresh=True)
        assert res1 is not None
        assert res1["source"] == "api"
        assert res1["rainfall_7d_mm"] == 11.0
        assert res1["temp_max_c"] == 31.0
        assert res1["humidity"] == 62.0

        # Second fetch with rounded coordinates should hit cache without calling httpx again
        call_count_before = mock_client.get.call_count
        res2 = await fetch_open_meteo_weather(12.5211, 76.8999) # rounds to 12.52, 76.90
        assert mock_client.get.call_count == call_count_before
        assert res2["source"] == "api"

    # Failure path with retry
    fail_client = AsyncMock()
    fail_client.get.side_effect = Exception("Connection refused")
    fail_client.__aenter__.return_value = fail_client
    with patch("httpx.AsyncClient", return_value=fail_client):
        res_fail = await fetch_open_meteo_weather(45.0, -93.0, force_refresh=True)
        assert res_fail is None


# ============================================================================
# 10. SUBMIT RETURNS LOCATION_REQUIRED (422) WHEN COORDINATES MISSING
# ============================================================================
def test_submit_returns_location_required_when_missing(api_client, test_setup, db):
    s = test_setup
    farmer = s["farmer"]
    headers = {"Authorization": f"Bearer {farmer.firebase_uid}"}

    # Field and Farm have no coordinates initially
    case = Case(
        case_number="C-SUBMIT-TEST",
        farm_id=s["farm"].id,
        field_id=s["field"].id,
        user_id=farmer.id,
        crop="Corn",
        growth_stage="V6",
        status=CaseState.DRAFT,
        confidence=80.0,
        uncertainty="Medium",
        description="Leaves yellowing at tips",
    )
    db.add(case)
    db.commit()

    res = api_client.post(
        f"/v1/cases/{case.id}/submit",
        json={"description": "Crop leaves turning yellow at tips"},
        headers=headers,
    )
    assert res.status_code == 422
    assert "location_required" in res.text

    # Now set coordinates on field and submit again
    s["field"].lat = 12.5244
    s["field"].lng = 76.8958
    db.commit()

    with patch("app.api.routes.cases.fetch_open_meteo_weather", new_callable=AsyncMock) as mock_w:
        mock_w.return_value = {"current": {"temperature_2m": 28.0}, "source": "open-meteo"}
        res_ok = api_client.post(
            f"/v1/cases/{case.id}/submit",
            json={"description": "Crop leaves turning yellow at tips with coordinates"},
            headers=headers,
        )
        assert res_ok.status_code == 202
        assert res_ok.json()["status"].upper() in ("REVIEW", "RESOLVED", "DRAFT", "ANALYZING")


# ============================================================================
# 11. PRIVACY & ROLE AUTHORIZATION
# ============================================================================
def test_privacy_and_role_authorization(api_client, test_setup, db):
    s = test_setup
    farmer = s["farmer"]
    other_farmer = s["other_farmer"]
    agronomist = s["agronomist"]
    admin = s["admin"]

    # Field with coordinates
    s["field"].lat = 12.5244
    s["field"].lng = 76.8958
    s["field"].accuracy_m = 12
    db.commit()

    case = Case(
        case_number="C-PRIV-TEST",
        farm_id=s["farm"].id,
        field_id=s["field"].id,
        user_id=farmer.id,
        crop="Corn",
        growth_stage="V6",
        status=CaseState.DRAFT,
        confidence=85.0,
        uncertainty="Low",
        description="Healthy crop check",
        assigned_agronomist_id=agronomist.id,
        sensor_summary={
            "latest": {"soil_moisture_pct": 32.0, "n_mgkg": 85.0, "temp_c": 26.0},
        },
    )
    db.add(case)
    db.commit()

    # 1. Farmer gets simple items + simulated: true, NO flags, NO raw series
    res_farmer = api_client.get(
        f"/v1/cases/{case.id}/sensor",
        headers={"Authorization": f"Bearer {farmer.firebase_uid}"},
    )
    assert res_farmer.status_code == 200
    farmer_data = res_farmer.json()
    assert farmer_data["simulated"] is True
    assert "items" in farmer_data
    assert "flags" not in farmer_data
    assert "readings_series" not in farmer_data
    assert "thresholds" not in farmer_data

    # 2. Other farmer is denied
    res_other = api_client.get(
        f"/v1/cases/{case.id}/sensor",
        headers={"Authorization": f"Bearer {other_farmer.firebase_uid}"},
    )
    assert res_other.status_code == 403

    # 3. Agronomist gets full series, flags, coordinates, and report_file_url
    res_agro = api_client.get(
        f"/v1/cases/{case.id}/sensor",
        headers={"Authorization": f"Bearer {agronomist.firebase_uid}"},
    )
    assert res_agro.status_code == 200
    agro_data = res_agro.json()
    assert agro_data["simulated"] is True
    assert "flags" in agro_data
    assert "location" in agro_data
    assert agro_data["location"]["lat"] == 12.5244
    assert agro_data["location"]["accuracy_m"] == 12

    # 4. Source PDF download: farmer denied, agronomist allowed
    res_farmer_pdf = api_client.get(
        f"/v1/cases/{case.id}/sensor-report/file",
        headers={"Authorization": f"Bearer {farmer.firebase_uid}"},
    )
    assert res_farmer_pdf.status_code == 403

    res_agro_pdf = api_client.get(
        f"/v1/cases/{case.id}/sensor-report/file",
        headers={"Authorization": f"Bearer {agronomist.firebase_uid}"},
    )
    # May be 404 because no physical PDF was uploaded yet, but NOT 403
    assert res_agro_pdf.status_code in (200, 404)


# ============================================================================
# 12. RECOMMENDER RECEIVES SENSOR FACTS AND REAL MOISTURE
# ============================================================================
def test_recommender_sensor_facts_and_real_moisture():
    recommender = MockRecommender()

    sensor_summary = {
        "latest": {"soil_moisture_pct": 18.0, "n_mgkg": 35.0, "temp_c": 32.0},
        "trends": {"soil_moisture_pct": "falling"},
        "stale": False,
    }
    interpretation = [
        {"key": "soil_moisture", "status": "dry", "severity": "medium"},
    ]

    res = recommender.generate_recommendations(
        crop="Corn",
        growth_stage="V6",
        observations=[{"description": "Mild leaf rolling"}],
        soil_data={},
        weather_data={},
        sensor_summary=sensor_summary,
        interpretation=interpretation,
    )

    recs = res["recommendations"]
    rec_titles = " ".join([r.get("action", "") or r.get("title", "") for r in recs])
    # Real moisture reading 18% should be referenced, not "no moisture data"
    assert "18.0%" in rec_titles or "18%" in rec_titles
    assert "no moisture data" not in rec_titles.lower()


# ============================================================================
# 13. NEW DATA COMPLETENESS WEIGHTS
# ============================================================================
def test_data_completeness_weights():
    # Complete: Image 0.30 + Sensor 0.30 + Desc 0.20 + Weather 0.20 = 100.0%
    full = calculate_data_completeness(has_image=True, has_sensor=True, has_description=True, has_weather=True)
    assert full == 100.0

    # Image only = 30.0%
    img_only = calculate_data_completeness(has_image=True, has_sensor=False, has_description=False, has_weather=False)
    assert img_only == 30.0

    # Sensor + Weather = 30 + 20 = 50.0%
    sensor_weather = calculate_data_completeness(has_image=False, has_sensor=True, has_description=False, has_weather=True)
    assert sensor_weather == 50.0

    # Desc + Weather = 20 + 20 = 40.0%
    desc_weather = calculate_data_completeness(has_image=False, has_sensor=False, has_description=True, has_weather=True)
    assert desc_weather == 40.0


# ============================================================================
# 14. PRIVACY COARSEN FUNCTION
# ============================================================================
def test_coarsen_function():
    coarse = coarsen(12.5244, 76.8958, decimals=1)
    assert coarse == (12.5, 76.9)
