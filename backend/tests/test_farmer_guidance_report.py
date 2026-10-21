import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import get_db
from app.models.models import Case, Farm, Field, User, Recommendation, GuardrailResult, SensorReport, SensorReading, Report
from app.api.deps import get_current_user
from app.services.case_state import CaseState


@pytest.fixture(autouse=True)
def cleanup_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def guidance_setup(db, test_user, test_agronomist, test_admin, test_farm):
    """Sets up a realistic case with observations, recommendations, guardrails and sensor telemetry."""
    # Another farmer
    other_farmer = User(
        username="otherfarmer",
        firebase_uid="usr-other-farmer",
        email="other.farmer@agriadvisor.ai",
        full_name="Other Farmer",
        role="farmer",
        language="en",
        active=True,
    )
    db.add(other_farmer)

    # Unassigned agronomist
    unassigned_agro = User(
        username="unassignedagro",
        firebase_uid="usr-unassigned-agro",
        email="unassigned.agro@agriadvisor.ai",
        full_name="Dr. Unassigned",
        role="agronomist",
        language="en",
        active=True,
    )
    db.add(unassigned_agro)
    db.commit()

    field = test_farm.fields[0]
    field.lat = 42.0308
    field.lng = -93.6319
    field.accuracy_m = 15.0
    field.location_source = "gps"

    case = Case(
        case_number="C-TEST-REPORT-101",
        farm_id=test_farm.id,
        field_id=field.id,
        user_id=test_user.id,
        crop="Corn",
        growth_stage="V8",
        status=CaseState.PENDING_REVIEW,
        description="Corn lower leaves showing yellowing between veins.",
        assigned_agronomist_id=test_agronomist.id,
        sensor_summary={
            "latest_values": {"soil_moisture_pct": 18.5, "n_mgkg": 12.0},
            "interpretation": [{"label": "soil_moisture", "status": "Low moisture stress"}],
        },
        weather_source="api",
    )
    db.add(case)
    db.commit()
    db.refresh(case)

    # Add recommendations
    rec1 = Recommendation(
        case_id=case.id,
        category="Crop",
        title="Perform in-field tissue nitrate test before rescue application",
        confidence=88.0,
        uncertainty="Low",
        why="Distinguish between nitrogen and sulfur deficiency.",
        evidence="Interveinal chlorosis visible on lower leaves.",
        assumptions="Agronomist can collect samples within 48 hours.",
        is_visible_to_farmer=True,
    )
    rec2 = Recommendation(
        case_id=case.id,
        category="Fertilizer",
        title="Apply foliar urea solution at 20 lb N/ac",
        confidence=82.0,
        uncertainty="Medium",
        why="Address acute nitrogen chlorosis at V8 stage.",
        evidence="Soil nitrate is low.",
        assumptions="Weather window is clear.",
        is_visible_to_farmer=True,
    )
    db.add_all([rec1, rec2])

    # Add guardrail result
    gr = GuardrailResult(
        case_id=case.id,
        rule_name="rain_within_24h",
        rule_category="environmental",
        status="FLAGGED",
        details="Rain forecast within 24h of application window.",
    )
    db.add(gr)

    # Add sensor reading
    import datetime
    sr = SensorReading(
        case_id=case.id,
        measured_at=datetime.datetime.utcnow(),
        soil_moisture_pct=18.5,
        n_mgkg=12.0,
        p_mgkg=25.0,
        k_mgkg=180.0,
        temp_c=26.5,
        humidity_pct=58.0,
        ph=6.4,
    )
    db.add(sr)
    db.commit()

    return {
        "case": case,
        "farmer": test_user,
        "other_farmer": other_farmer,
        "agronomist": test_agronomist,
        "unassigned_agronomist": unassigned_agro,
        "admin": test_admin,
    }


def make_client_for_user(db, user):
    def override_get_db():
        yield db

    def override_get_current_user():
        return user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    return TestClient(app)


def test_report_exists_only_after_approval(db, guidance_setup):
    case = guidance_setup["case"]
    farmer = guidance_setup["farmer"]
    agro = guidance_setup["agronomist"]

    farmer_client = make_client_for_user(db, farmer)

    # 1. Before approval (case is PENDING_REVIEW): report must not be accessible (404)
    res = farmer_client.get(f"/v1/cases/{case.id}/report")
    assert res.status_code == 404
    assert "not been approved" in res.json().get("detail", "")

    # 2. Agronomist approves the case
    agro_client = make_client_for_user(db, agro)
    rev_res = agro_client.post(
        f"/v1/cases/{case.id}/review",
        json={"decision": "approve", "note": "Verified field symptoms and approved foliar nitrogen guidance."},
    )
    assert rev_res.status_code == 201

    # 3. After approval: report is now accessible
    res2 = farmer_client.get(f"/v1/cases/{case.id}/report")
    assert res2.status_code == 200
    data = res2.json()
    assert "body_json" in data
    assert data["language"] == "en"
    assert data["machine_translated"] is False
    assert len(data["body_json"]["next_steps"]) > 0


def test_farmer_report_no_forbidden_words_and_plain_sensor_words(db, guidance_setup):
    case = guidance_setup["case"]
    farmer = guidance_setup["farmer"]
    agro = guidance_setup["agronomist"]

    agro_client = make_client_for_user(db, agro)
    agro_client.post(f"/v1/cases/{case.id}/review", json={"decision": "approve", "note": "Approved standard plan."})

    farmer_client = make_client_for_user(db, farmer)
    res = farmer_client.get(f"/v1/cases/{case.id}/report")
    assert res.status_code == 200
    body = res.json()["body_json"]

    what = body["what_is_happening"]
    steps = body["next_steps"]
    warnings = body["warnings"]

    # Combine all farmer-visible text
    all_text = f"{what} {' '.join(s['title'] + ' ' + s['detail'] for s in steps)} {' '.join(warnings)}"

    # Check word limit on what_is_happening (max 60 words)
    words = what.split()
    assert len(words) <= 60

    # Never contains confidence, citation, or AI wording
    forbidden_terms = ["confidence", "citation", "AI", "model", "algorithm", "ppm", "mg/kg"]
    for term in forbidden_terms:
        # Check whole word match
        import re
        assert not re.search(rf"\b{term}\b", all_text, re.IGNORECASE), f"Found forbidden term '{term}' in farmer report"

    # Sensor values must appear only as plain words (e.g. 'soil is dry')
    assert "soil is dry" in what.lower() or "soil" in what.lower()


def test_translation_cached_and_glossary_mock(db, guidance_setup):
    case = guidance_setup["case"]
    farmer = guidance_setup["farmer"]
    agro = guidance_setup["agronomist"]

    agro_client = make_client_for_user(db, agro)
    agro_client.post(f"/v1/cases/{case.id}/review", json={"decision": "approve", "note": "Approved standard plan."})

    farmer_client = make_client_for_user(db, farmer)

    # 1. Fetch Hindi translation
    res_hi = farmer_client.get(f"/v1/cases/{case.id}/report?lang=hi")
    assert res_hi.status_code == 200
    data_hi = res_hi.json()
    assert data_hi["language"] == "hi"
    assert data_hi["machine_translated"] is True
    # In mock mode, should have "[hi] " prefix
    assert data_hi["body_json"]["what_is_happening"].startswith("[hi]")

    # Check DB row count for (case_id, 'hi')
    count_before = db.query(Report).filter(Report.case_id == case.id, Report.language == "hi").count()
    assert count_before == 1

    # 2. Second call must hit cache: ZERO LLM calls, exact same row
    with patch("app.services.translation.translate_report_body") as mock_translate:
        res_hi_2 = farmer_client.get(f"/v1/cases/{case.id}/report?lang=hi")
        assert res_hi_2.status_code == 200
        # translate_report_body must NOT be called on cache hit
        assert mock_translate.call_count == 0

    count_after = db.query(Report).filter(Report.case_id == case.id, Report.language == "hi").count()
    assert count_after == 1

    # 3. Fetch Kannada translation
    res_kn = farmer_client.get(f"/v1/cases/{case.id}/report?lang=kn")
    assert res_kn.status_code == 200
    data_kn = res_kn.json()
    assert data_kn["language"] == "kn"
    assert data_kn["machine_translated"] is True
    assert data_kn["body_json"]["what_is_happening"].startswith("[kn]")


def test_tts_audio_cache_and_offline_fallback(db, guidance_setup, tmp_path):
    case = guidance_setup["case"]
    farmer = guidance_setup["farmer"]
    agro = guidance_setup["agronomist"]

    agro_client = make_client_for_user(db, agro)
    agro_client.post(f"/v1/cases/{case.id}/review", json={"decision": "approve", "note": "Approved standard plan."})

    farmer_client = make_client_for_user(db, farmer)

    # 1. Test offline / gTTS failure fallback -> 503 {"fallback": "browser"}
    with patch("app.services.report_tts.synthesize_report_audio", side_effect=Exception("Network unreachable")):
        res_fail = farmer_client.get(f"/v1/cases/{case.id}/report/audio?lang=en")
        assert res_fail.status_code == 503
        data_fail = res_fail.json()
        assert data_fail.get("fallback") == "browser"

    # 2. Test successful audio generation & cache hit
    dummy_mp3 = tmp_path / "test_cached.mp3"
    dummy_mp3.write_bytes(b"\xFF\xFB\x90\x44" + b"\x00" * 200)

    with patch("app.services.report_tts.synthesize_report_audio", return_value=str(dummy_mp3)) as mock_tts:
        res_ok = farmer_client.get(f"/v1/cases/{case.id}/report/audio?lang=en")
        assert res_ok.status_code == 200
        assert res_ok.headers.get("content-type") == "audio/mpeg"
        assert len(res_ok.content) > 0
        assert mock_tts.call_count == 1

        # Second call: report.audio_path is set, and file exists on disk
        res_ok_2 = farmer_client.get(f"/v1/cases/{case.id}/report/audio?lang=en")
        assert res_ok_2.status_code == 200
        assert res_ok_2.headers.get("content-type") == "audio/mpeg"


def test_pdf_endpoints_return_pdf_bytes_en_hi_kn(db, guidance_setup):
    case = guidance_setup["case"]
    farmer = guidance_setup["farmer"]
    agro = guidance_setup["agronomist"]

    agro_client = make_client_for_user(db, agro)
    agro_client.post(f"/v1/cases/{case.id}/review", json={"decision": "approve", "note": "Approved standard plan."})

    farmer_client = make_client_for_user(db, farmer)

    # Farmer PDF en
    res_en = farmer_client.get(f"/v1/cases/{case.id}/report.pdf?lang=en")
    assert res_en.status_code == 200
    assert "application/pdf" in res_en.headers.get("content-type", "")
    assert res_en.content[:4] == b"%PDF"

    # Farmer PDF hi
    res_hi = farmer_client.get(f"/v1/cases/{case.id}/report.pdf?lang=hi")
    assert res_hi.status_code == 200
    assert "application/pdf" in res_hi.headers.get("content-type", "")
    assert res_hi.content[:4] == b"%PDF"

    # Farmer PDF kn
    res_kn = farmer_client.get(f"/v1/cases/{case.id}/report.pdf?lang=kn")
    assert res_kn.status_code == 200
    assert "application/pdf" in res_kn.headers.get("content-type", "")
    assert res_kn.content[:4] == b"%PDF"


def test_expert_pdf_permissions_and_export(db, guidance_setup):
    case = guidance_setup["case"]
    farmer = guidance_setup["farmer"]
    assigned_agro = guidance_setup["agronomist"]
    unassigned_agro = guidance_setup["unassigned_agronomist"]
    admin = guidance_setup["admin"]

    # 1. Farmer cannot fetch expert PDF -> 403 Forbidden
    farmer_client = make_client_for_user(db, farmer)
    res_farmer = farmer_client.get(f"/v1/cases/{case.id}/report-expert.pdf")
    assert res_farmer.status_code == 403

    # 2. Unassigned agronomist cannot fetch expert PDF -> 403 Forbidden
    unassigned_client = make_client_for_user(db, unassigned_agro)
    res_unassigned = unassigned_client.get(f"/v1/cases/{case.id}/report-expert.pdf")
    assert res_unassigned.status_code == 403

    # 3. Assigned agronomist CAN fetch expert PDF -> 200 application/pdf
    assigned_client = make_client_for_user(db, assigned_agro)
    res_agro = assigned_client.get(f"/v1/cases/{case.id}/report-expert.pdf")
    assert res_agro.status_code == 200
    assert "application/pdf" in res_agro.headers.get("content-type", "")
    assert res_agro.content[:4] == b"%PDF"

    # 4. Admin CAN fetch expert PDF -> 200 application/pdf
    admin_client = make_client_for_user(db, admin)
    res_admin = admin_client.get(f"/v1/cases/{case.id}/report-expert.pdf")
    assert res_admin.status_code == 200
    assert "application/pdf" in res_admin.headers.get("content-type", "")
    assert res_admin.content[:4] == b"%PDF"


def test_farmer_cannot_fetch_another_farmers_report(db, guidance_setup):
    case = guidance_setup["case"]
    other_farmer = guidance_setup["other_farmer"]
    agro = guidance_setup["agronomist"]

    agro_client = make_client_for_user(db, agro)
    agro_client.post(f"/v1/cases/{case.id}/review", json={"decision": "approve", "note": "Approved standard plan."})

    other_client = make_client_for_user(db, other_farmer)

    # Other farmer cannot fetch report
    res_rep = other_client.get(f"/v1/cases/{case.id}/report")
    assert res_rep.status_code == 403

    # Other farmer cannot fetch report PDF
    res_pdf = other_client.get(f"/v1/cases/{case.id}/report.pdf")
    assert res_pdf.status_code == 403

    # Other farmer cannot fetch report audio
    res_audio = other_client.get(f"/v1/cases/{case.id}/report/audio")
    assert res_audio.status_code == 403
