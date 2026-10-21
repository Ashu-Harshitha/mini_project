import datetime
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.models import Farm, Field, Case, User, WeatherAlert
from app.services.weather import clear_weather_cache, get_farm_location, coarsen
from app.services.alert_renderer import (
    validate_all_alert_templates_exist,
    render_alert,
    ALL_RULES,
    SUPPORTED_LANGUAGES,
)
from app.services.alerts_engine import (
    evaluate_forecast_rules,
    evaluate_sensor_rules,
    check_farm_weather_alerts,
    check_case_sensor_alerts,
    run_all_weather_alerts_job,
    get_farm_owner,
    get_assigned_agronomists_for_farm,
)


# =====================================================================
# 1. Template Validation Tests (en, hi, kn for all rules)
# =====================================================================

def test_all_templates_exist_in_all_languages():
    """Validates that every rule has non-empty templates in en, hi, and kn."""
    # Should not raise any ValueError
    validate_all_alert_templates_exist()

    # Verify rendering each rule in each language produces title, message, action
    test_params = {
        "date": "2026-10-25",
        "mm": 35.5,
        "temp": 38.0,
        "speed": 45.0,
        "days": 4,
        "moisture": 14.5,
    }
    for rule in ALL_RULES:
        for lang in SUPPORTED_LANGUAGES:
            rendered = render_alert(rule, lang, test_params)
            assert rendered["title"], f"Missing title for {rule} in {lang}"
            assert rendered["message"], f"Missing message for {rule} in {lang}"
            assert rendered["action"], f"Missing action for {rule} in {lang}"
            # Check placeholders replaced (no unformatted {date} left)
            assert "{date}" not in rendered["message"]


def test_missing_template_fails_validation():
    """A test must fail if any rule lacks a template in any language."""
    from app.services import alert_renderer

    original_templates = dict(alert_renderer._TEMPLATES_CACHE)
    try:
        # Intentionally remove a language from a rule
        alert_renderer._TEMPLATES_CACHE = {
            "heavy_rain": {"en": {"title": "T", "message": "M", "action": "A"}}
        }
        with pytest.raises(ValueError) as excinfo:
            validate_all_alert_templates_exist()
        assert "validation failed" in str(excinfo.value).lower()
    finally:
        alert_renderer._TEMPLATES_CACHE = original_templates


# =====================================================================
# 2. Rule Boundary Tests
# =====================================================================

def test_heavy_rain_boundary():
    """heavy_rain fires at >= 25.0 mm and does not fire at 24.9 mm."""
    # At boundary 25.0 -> fires
    data_fire = {
        "daily": [
            {"date": "2026-10-22", "precipitation_mm": 25.0, "temp_max_c": 22.0, "temp_min_c": 12.0, "wind_speed_kmh": 10.0}
        ]
    }
    alerts_fire = evaluate_forecast_rules(data_fire)
    hr_alerts = [a for a in alerts_fire if a["rule"] == "heavy_rain"]
    assert len(hr_alerts) == 1
    assert hr_alerts[0]["severity"] == "warning"

    # Below boundary 24.9 -> does not fire
    data_no_fire = {
        "daily": [
            {"date": "2026-10-22", "precipitation_mm": 24.9, "temp_max_c": 22.0, "temp_min_c": 12.0, "wind_speed_kmh": 10.0}
        ]
    }
    alerts_no_fire = evaluate_forecast_rules(data_no_fire)
    hr_no_fire = [a for a in alerts_no_fire if a["rule"] == "heavy_rain"]
    assert len(hr_no_fire) == 0


def test_heat_stress_boundary():
    """heat_stress fires at >= 35.0 C and does not fire at 34.9 C."""
    # 35.0 C -> fires high
    data_fire = {
        "daily": [
            {"date": "2026-10-22", "temp_max_c": 35.0, "temp_min_c": 20.0, "precipitation_mm": 0.0, "wind_speed_kmh": 5.0}
        ]
    }
    alerts = evaluate_forecast_rules(data_fire)
    hs = [a for a in alerts if a["rule"] == "heat_stress"]
    assert len(hs) == 1
    assert hs[0]["severity"] == "high"

    # 34.9 C -> does not fire
    data_no_fire = {
        "daily": [
            {"date": "2026-10-22", "temp_max_c": 34.9, "temp_min_c": 20.0, "precipitation_mm": 0.0, "wind_speed_kmh": 5.0}
        ]
    }
    alerts_no = evaluate_forecast_rules(data_no_fire)
    assert not any(a["rule"] == "heat_stress" for a in alerts_no)


def test_frost_risk_boundary():
    """frost_risk fires at <= 2.0 C and does not fire at 2.1 C."""
    # 2.0 C -> fires high
    data_fire = {
        "daily": [
            {"date": "2026-10-22", "temp_max_c": 10.0, "temp_min_c": 2.0, "precipitation_mm": 0.0, "wind_speed_kmh": 5.0}
        ]
    }
    alerts = evaluate_forecast_rules(data_fire)
    fr = [a for a in alerts if a["rule"] == "frost_risk"]
    assert len(fr) == 1
    assert fr[0]["severity"] == "high"

    # 2.1 C -> does not fire
    data_no_fire = {
        "daily": [
            {"date": "2026-10-22", "temp_max_c": 10.0, "temp_min_c": 2.1, "precipitation_mm": 0.0, "wind_speed_kmh": 5.0}
        ]
    }
    alerts_no = evaluate_forecast_rules(data_no_fire)
    assert not any(a["rule"] == "frost_risk" for a in alerts_no)


def test_strong_wind_boundary():
    """strong_wind fires at >= 30.0 km/h and does not fire at 29.9 km/h."""
    # 30.0 km/h -> fires warning
    data_fire = {
        "daily": [
            {"date": "2026-10-22", "temp_max_c": 20.0, "temp_min_c": 10.0, "precipitation_mm": 0.0, "wind_speed_kmh": 30.0}
        ]
    }
    alerts = evaluate_forecast_rules(data_fire)
    sw = [a for a in alerts if a["rule"] == "strong_wind"]
    assert len(sw) == 1
    assert sw[0]["severity"] == "warning"

    # 29.9 km/h -> does not fire
    data_no = {
        "daily": [
            {"date": "2026-10-22", "temp_max_c": 20.0, "temp_min_c": 10.0, "precipitation_mm": 0.0, "wind_speed_kmh": 29.9}
        ]
    }
    alerts_no = evaluate_forecast_rules(data_no)
    assert not any(a["rule"] == "strong_wind" for a in alerts_no)


def test_dry_spell_boundary():
    """dry_spell fires when 7-day cumulative precipitation < 5.0 mm."""
    # 7-day sum = 4.9 mm -> fires warning
    data_fire = {
        "daily": [
            {"date": f"2026-10-{20+i}", "precipitation_mm": 0.7, "temp_max_c": 22.0, "temp_min_c": 10.0, "wind_speed_kmh": 5.0}
            for i in range(7)
        ]  # 7 * 0.7 = 4.9 mm
    }
    alerts = evaluate_forecast_rules(data_fire)
    ds = [a for a in alerts if a["rule"] == "dry_spell"]
    assert len(ds) == 1
    assert ds[0]["severity"] == "warning"

    # 7-day sum = 5.0 mm -> does not fire
    data_no = {
        "daily": [
            {"date": f"2026-10-{20+i}", "precipitation_mm": 1.0, "temp_max_c": 22.0, "temp_min_c": 10.0, "wind_speed_kmh": 5.0}
            for i in range(5)
        ] + [
            {"date": "2026-10-25", "precipitation_mm": 0.0, "temp_max_c": 22.0, "temp_min_c": 10.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-26", "precipitation_mm": 0.0, "temp_max_c": 22.0, "temp_min_c": 10.0, "wind_speed_kmh": 5.0},
        ]  # sum = 5.0 mm
    }
    alerts_no = evaluate_forecast_rules(data_no)
    assert not any(a["rule"] == "dry_spell" for a in alerts_no)


def test_disease_pressure_boundary():
    """disease_pressure fires when >= 3 days have rain >= 1 mm and tmax 20-30 C."""
    # 3 days matching -> fires
    data_fire = {
        "daily": [
            {"date": "2026-10-21", "precipitation_mm": 1.0, "temp_max_c": 24.0, "temp_min_c": 15.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-22", "precipitation_mm": 3.0, "temp_max_c": 22.0, "temp_min_c": 14.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-23", "precipitation_mm": 1.5, "temp_max_c": 28.0, "temp_min_c": 16.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-24", "precipitation_mm": 0.0, "temp_max_c": 25.0, "temp_min_c": 15.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-25", "precipitation_mm": 0.0, "temp_max_c": 25.0, "temp_min_c": 15.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-26", "precipitation_mm": 0.0, "temp_max_c": 25.0, "temp_min_c": 15.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-27", "precipitation_mm": 0.0, "temp_max_c": 25.0, "temp_min_c": 15.0, "wind_speed_kmh": 5.0},
        ]
    }
    alerts = evaluate_forecast_rules(data_fire)
    dp = [a for a in alerts if a["rule"] == "disease_pressure"]
    assert len(dp) == 1
    assert dp[0]["severity"] == "warning"

    # Only 2 days matching -> does not fire
    data_no = {
        "daily": [
            {"date": "2026-10-21", "precipitation_mm": 1.0, "temp_max_c": 24.0, "temp_min_c": 15.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-22", "precipitation_mm": 3.0, "temp_max_c": 22.0, "temp_min_c": 14.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-23", "precipitation_mm": 0.5, "temp_max_c": 28.0, "temp_min_c": 16.0, "wind_speed_kmh": 5.0},  # precip < 1.0
            {"date": "2026-10-24", "precipitation_mm": 2.0, "temp_max_c": 33.0, "temp_min_c": 15.0, "wind_speed_kmh": 5.0},  # temp > 30.0
            {"date": "2026-10-25", "precipitation_mm": 0.0, "temp_max_c": 25.0, "temp_min_c": 15.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-26", "precipitation_mm": 0.0, "temp_max_c": 25.0, "temp_min_c": 15.0, "wind_speed_kmh": 5.0},
            {"date": "2026-10-27", "precipitation_mm": 0.0, "temp_max_c": 25.0, "temp_min_c": 15.0, "wind_speed_kmh": 5.0},
        ]
    }
    alerts_no = evaluate_forecast_rules(data_no)
    assert not any(a["rule"] == "disease_pressure" for a in alerts_no)


# =====================================================================
# 3. Sensor Rules Evaluation & Deduplication by Date
# =====================================================================

def test_sensor_rules_evaluation_and_dedupe(db: Session, test_farm):
    """Sensor rules reuse interpret.py and dedupe by date."""
    # Create a user (farmer) and a Case on test_farm
    farmer = User(
        username="farmer_sensor_test",
        firebase_uid="uid-sensor-test",
        role="farmer",
        full_name="John Doe",
        language="en",
    )
    db.add(farmer)
    db.commit()

    field = test_farm.fields[0]
    case = Case(
        case_number="C-SENSOR-ALERT-1",
        farm_id=test_farm.id,
        field_id=field.id,
        user_id=farmer.id,
        crop="Corn",
        growth_stage="Vegetative",
        status="DRAFT",
    )
    db.add(case)
    db.commit()

    # Sensor summary with dry soil (< 18% moisture -> critical -> high severity)
    # and fungal pressure (3 conditions -> high severity)
    case.sensor_summary = {
        "latest": {
            "measured_at": "2026-10-21T10:00:00Z",
            "soil_moisture_pct": 14.5,
            "temp_c": 24.0,
            "humidity_pct": 85.0,
        },
        "hours_leaf_wetness_ge_70": 8.0,
        "last_24h": {
            "temp_c": {"mean": 24.0, "max": 28.0},
            "humidity_pct": {"mean": 85.0},
        },
    }
    db.commit()

    with patch("app.services.alerts_engine.notify") as mock_notify:
        count1, alerts1 = check_case_sensor_alerts(db, case)
        assert count1 >= 2  # dry_soil and fungal_pressure
        assert mock_notify.called

        rules = {a.rule: a.severity for a in alerts1}
        assert "sensor_dry_soil" in rules
        assert "sensor_fungal_pressure" in rules

        # Second run on the same date -> deduped, 0 new alerts created
        mock_notify.reset_mock()
        count2, alerts2 = check_case_sensor_alerts(db, case)
        assert count2 == 0
        assert len(alerts2) == 0
        mock_notify.assert_not_called()


# =====================================================================
# 4. Dedupe on Second Run & Notification Rules (Weather Job)
# =====================================================================

@pytest.mark.asyncio
async def test_weather_check_dedupe_and_notifications_only_for_new(db: Session, test_farm):
    """Running weather check twice dedupes and sends notifications only for newly created alerts."""
    clear_weather_cache()

    farmer = User(
        username="farmer_weather_test",
        firebase_uid="uid-weather-test",
        role="farmer",
        full_name="John Doe",
        language="en",
    )
    db.add(farmer)

    # Assign an agronomist with open case on that farm
    agronomist = User(
        username="agro_weather_test",
        firebase_uid="uid-agro-test",
        role="agronomist",
        full_name="Dr. Agro",
        language="en",
    )
    db.add(agronomist)
    db.commit()

    field = test_farm.fields[0]
    field.lat = 42.03
    field.lng = -93.63
    db.commit()

    open_case = Case(
        case_number="C-OPEN-AGRO",
        farm_id=test_farm.id,
        field_id=field.id,
        user_id=farmer.id,
        assigned_agronomist_id=agronomist.id,
        crop="Corn",
        growth_stage="Vegetative",
        status="PENDING_REVIEW",
    )
    db.add(open_case)
    db.commit()

    # Mock Open-Meteo with heat stress (tmax = 36.0 C -> high severity alert)
    mock_forecast = {
        "latitude": 42.03,
        "longitude": -93.63,
        "timezone": "America/Chicago",
        "fetched_at": "2026-10-21T12:00:00",
        "daily": [
            {
                "date": "2026-10-22",
                "temp_max_c": 36.0,
                "temp_min_c": 22.0,
                "precipitation_mm": 10.0,
                "precipitation_probability_pct": 20,
                "wind_speed_kmh": 12.0,
                "uv_index_max": 7.0,
            }
        ],
    }

    with patch("app.services.alerts_engine.get_forecast", return_value=mock_forecast):
        with patch("app.services.alerts_engine.notify") as mock_notify:
            # First run: should create alerts and send notifications
            count1, alerts1 = await check_farm_weather_alerts(db, test_farm, force=True)
            assert count1 >= 1
            assert mock_notify.call_count >= 2  # Notifies owner AND assigned agronomist for high severity

            # Second run: should be deduped on conflict do nothing
            mock_notify.reset_mock()
            count2, alerts2 = await check_farm_weather_alerts(db, test_farm, force=True)
            assert count2 == 0
            assert len(alerts2) == 0
            mock_notify.assert_not_called()


# =====================================================================
# 5. Job Skips Recently Checked Farms
# =====================================================================

@pytest.mark.asyncio
async def test_job_skips_recently_checked_farms(db: Session, test_farm):
    """Job skips farms checked within the last 3 hours unless force=True."""
    clear_weather_cache()

    field = test_farm.fields[0]
    field.lat = 42.03
    field.lng = -93.63
    db.commit()

    mock_forecast = {
        "latitude": 42.03,
        "longitude": -93.63,
        "timezone": "UTC",
        "daily": [],
    }

    with patch("app.services.alerts_engine.get_forecast", return_value=mock_forecast):
        # 1. First run sets last_weather_check_at
        await check_farm_weather_alerts(db, test_farm, force=True)
        assert test_farm.last_weather_check_at is not None

        # 2. Second run without force should skip
        count, _ = await check_farm_weather_alerts(db, test_farm, force=False)
        assert count == 0

        # 3. Third run with force should execute
        test_farm.last_weather_check_at = datetime.datetime.utcnow() - datetime.timedelta(minutes=30)
        db.commit()
        # force=False -> still within 3 hours -> skip
        summary = await run_all_weather_alerts_job(db=db, force=False)
        assert summary["farms_skipped"] >= 1


# =====================================================================
# 6. One Failing Farm Does Not Stop Others
# =====================================================================

@pytest.mark.asyncio
async def test_one_failing_farm_does_not_stop_others(db: Session, test_farm, test_organic_farm):
    """When one farm encounters an error, the remaining farms are still processed."""
    clear_weather_cache()

    test_farm.fields[0].lat = 42.03
    test_farm.fields[0].lng = -93.63
    test_organic_farm.fields[0].lat = 42.05
    test_organic_farm.fields[0].lng = -93.65
    db.commit()

    call_count = 0

    async def mock_forecast_side_effect(lat, lng, force_refresh=False):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("Network timeout to Open-Meteo for farm 1")
        return {
            "latitude": lat,
            "longitude": lng,
            "timezone": "UTC",
            "daily": [
                {
                    "date": "2026-10-23",
                    "temp_max_c": 36.0,
                    "temp_min_c": 18.0,
                    "precipitation_mm": 0.0,
                    "precipitation_probability_pct": 0,
                    "wind_speed_kmh": 10.0,
                    "uv_index_max": 6.0,
                }
            ],
        }

    with patch("app.services.alerts_engine.get_forecast", side_effect=mock_forecast_side_effect):
        summary = await run_all_weather_alerts_job(db=db, force=True)
        assert summary["failures"] >= 1
        assert summary["farms_checked"] >= 1
        assert summary["alerts_created"] >= 1


# =====================================================================
# 7. Role Scoping & Privacy Tests (No Other Farms' Data)
# =====================================================================

def test_alerts_role_scoping_and_privacy(client: TestClient, db: Session, test_farm, test_organic_farm):
    """
    Farmer can only see own farm alerts.
    Agronomist can only see alerts for farms of their assigned cases.
    Admin can see all alerts.
    """
    # 1. Create farmer 1 and farmer 2
    farmer1 = User(
        username="farmer_one",
        firebase_uid="uid-farmer-one",
        role="farmer",
        full_name="John Doe",  # matches test_farm operator_name
        language="en",
    )
    farmer2 = User(
        username="farmer_two",
        firebase_uid="uid-farmer-two",
        role="farmer",
        full_name="Jane Green",  # matches test_organic_farm operator_name
        language="en",
    )
    agronomist = User(
        username="agro_assigned",
        firebase_uid="uid-agro-assigned",
        role="agronomist",
        full_name="Dr. Assigned",
        language="en",
    )
    admin = User(
        username="admin_user",
        firebase_uid="uid-admin-user",
        role="admin",
        full_name="Admin",
        language="en",
    )
    db.add_all([farmer1, farmer2, agronomist, admin])
    db.commit()

    # Agronomist assigned only to a case on test_farm
    case_agro = Case(
        case_number="C-AGRO-SCOPE",
        farm_id=test_farm.id,
        field_id=test_farm.fields[0].id,
        user_id=farmer1.id,
        assigned_agronomist_id=agronomist.id,
        crop="Corn",
        growth_stage="Vegetative",
        status="PENDING_REVIEW",
    )
    db.add(case_agro)
    db.commit()

    # Create alerts on both farms
    alert_farm1 = WeatherAlert(
        farm_id=test_farm.id,
        source="weather",
        rule="heavy_rain",
        severity="warning",
        start_date=datetime.date(2026, 10, 25),
        params={"date": "2026-10-25", "mm": 30.0},
        dedupe_key=f"{test_farm.id}:heavy_rain:2026-10-25",
        created_at=datetime.datetime.utcnow(),
    )
    alert_farm2 = WeatherAlert(
        farm_id=test_organic_farm.id,
        source="sensor",
        rule="sensor_dry_soil",
        severity="high",
        start_date=datetime.date(2026, 10, 25),
        params={"date": "2026-10-25", "moisture": 12.0},
        dedupe_key=f"{test_organic_farm.id}:sensor_dry_soil:2026-10-25",
        created_at=datetime.datetime.utcnow(),
    )
    db.add_all([alert_farm1, alert_farm2])
    db.commit()

    # --- Farmer 1 checks alerts ---
    from app.api.deps import get_current_user
    app = client.app
    app.dependency_overrides[get_current_user] = lambda: farmer1

    res1 = client.get("/v1/alerts")
    assert res1.status_code == 200
    items1 = res1.json()["items"]
    # Farmer 1 only sees test_farm alert
    assert len(items1) == 1
    assert items1[0]["farm_id"] == test_farm.id
    assert items1[0]["rule"] == "heavy_rain"

    # Farmer 1 tries to access farm 2 alerts -> 403 Forbidden
    res1_f2 = client.get(f"/v1/alerts?farm={test_organic_farm.id}")
    assert res1_f2.status_code == 403

    # --- Agronomist checks alerts ---
    app.dependency_overrides[get_current_user] = lambda: agronomist
    res_agro = client.get("/v1/alerts")
    assert res_agro.status_code == 200
    items_agro = res_agro.json()["items"]
    # Agronomist only has cases on test_farm
    assert len(items_agro) == 1
    assert items_agro[0]["farm_id"] == test_farm.id

    # --- Admin checks alerts ---
    app.dependency_overrides[get_current_user] = lambda: admin
    res_admin = client.get("/v1/alerts")
    assert res_admin.status_code == 200
    items_admin = res_admin.json()["items"]
    # Admin sees both alerts
    assert len(items_admin) == 2

    # Clean up overrides
    app.dependency_overrides.pop(get_current_user, None)


def test_mark_alert_read_and_read_all(client: TestClient, db: Session, test_farm):
    """PATCH /alerts/{id}/read and POST /alerts/read-all mark alerts read."""
    farmer = User(
        username="farmer_read_test",
        firebase_uid="uid-farmer-read",
        role="farmer",
        full_name="John Doe",
        language="en",
    )
    db.add(farmer)
    db.commit()

    a1 = WeatherAlert(
        farm_id=test_farm.id,
        source="weather",
        rule="heavy_rain",
        severity="warning",
        start_date=datetime.date(2026, 10, 26),
        params={"date": "2026-10-26", "mm": 28.0},
        dedupe_key=f"{test_farm.id}:heavy_rain:2026-10-26",
    )
    a2 = WeatherAlert(
        farm_id=test_farm.id,
        source="weather",
        rule="strong_wind",
        severity="warning",
        start_date=datetime.date(2026, 10, 27),
        params={"date": "2026-10-27", "speed": 35.0},
        dedupe_key=f"{test_farm.id}:strong_wind:2026-10-27",
    )
    db.add_all([a1, a2])
    db.commit()

    from app.api.deps import get_current_user
    app = client.app
    app.dependency_overrides[get_current_user] = lambda: farmer

    # Mark single alert read
    patch_res = client.patch(f"/v1/alerts/{a1.id}/read")
    assert patch_res.status_code == 200
    assert patch_res.json()["read_at"] is not None

    # Mark all read
    post_res = client.post("/v1/alerts/read-all")
    assert post_res.status_code == 200
    assert post_res.json()["count"] >= 1

    app.dependency_overrides.pop(get_current_user, None)


def test_farm_forecast_endpoint_authorization_and_coordinates(client: TestClient, db: Session, test_farm, test_organic_farm):
    """GET /farms/{id}/forecast validates access and returns normalized forecast."""
    clear_weather_cache()

    farmer = User(
        username="farmer_fc_test",
        firebase_uid="uid-farmer-fc",
        role="farmer",
        full_name="John Doe",
        language="en",
    )
    admin = User(
        username="admin_fc_test",
        firebase_uid="uid-admin-fc",
        role="admin",
        full_name="Admin",
        language="en",
    )
    db.add_all([farmer, admin])
    db.commit()

    test_farm.fields[0].lat = 42.0308
    test_farm.fields[0].lng = -93.6319
    db.commit()

    mock_forecast = {
        "latitude": 42.03,
        "longitude": -93.63,
        "timezone": "America/Chicago",
        "fetched_at": "2026-10-21T14:00:00",
        "daily": [
            {
                "date": "2026-10-22",
                "temp_max_c": 28.5,
                "temp_min_c": 15.0,
                "precipitation_mm": 2.0,
                "precipitation_probability_pct": 30,
                "wind_speed_kmh": 14.0,
                "uv_index_max": 6.0,
            }
        ],
    }

    from app.api.deps import get_current_user
    app = client.app

    with patch("app.api.routes.alerts.get_forecast", return_value=mock_forecast):
        # 1. Farmer accessing own farm -> 200 with precise coordinates
        app.dependency_overrides[get_current_user] = lambda: farmer
        res_own = client.get(f"/v1/farms/{test_farm.id}/forecast")
        assert res_own.status_code == 200
        data = res_own.json()
        assert data["farm_id"] == test_farm.id
        assert data["latitude"] == 42.0308
        assert data["is_coarsened"] is False
        assert len(data["daily"]) == 1

        # 2. Farmer accessing unauthorized farm -> 403 Forbidden
        res_unauth = client.get(f"/v1/farms/{test_organic_farm.id}/forecast")
        assert res_unauth.status_code == 403

        # 3. Admin accessing any farm -> 200
        app.dependency_overrides[get_current_user] = lambda: admin
        res_admin = client.get(f"/v1/farms/{test_organic_farm.id}/forecast")
        # Farm has default coordinates on model
        assert res_admin.status_code == 200

    app.dependency_overrides.pop(get_current_user, None)


def test_admin_alerts_run_endpoint(client: TestClient, db: Session, test_admin, test_user):
    """POST /admin/alerts/run is restricted to admin and returns job summary."""
    from app.api.deps import get_current_user
    app = client.app

    mock_summary = {
        "farms_checked": 3,
        "alerts_created": 2,
        "failures": 0,
        "farms_skipped": 1,
        "details": [],
    }

    with patch("app.api.routes.alerts.run_all_weather_alerts_job", return_value=mock_summary):
        # 1. Non-admin user receives 403
        app.dependency_overrides[get_current_user] = lambda: test_user
        res_farmer = client.post("/v1/admin/alerts/run")
        assert res_farmer.status_code == 403

        # 2. Admin receives 200 and summary
        app.dependency_overrides[get_current_user] = lambda: test_admin
        res_admin = client.post("/v1/admin/alerts/run")
        assert res_admin.status_code == 200
        assert res_admin.json()["farms_checked"] == 3
        assert res_admin.json()["alerts_created"] == 2

    app.dependency_overrides.pop(get_current_user, None)
