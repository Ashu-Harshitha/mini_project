import os
import yaml
import datetime
import logging
from typing import Dict, Any, List, Optional, Tuple, Set
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.models import Farm, Field, Case, User, WeatherAlert
from app.services.weather import get_forecast, get_farm_location
from app.sensors.interpret import interpret_sensor_data
from app.services.notifications import notify
from app.core.database import SessionLocal

logger = logging.getLogger("agriadvisor.alerts")

RULES_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "weather_rules.yaml",
)

_RULES_CACHE: Optional[Dict[str, Any]] = None


def load_weather_rules() -> Dict[str, Any]:
    """Loads weather and sensor rules configuration from YAML."""
    global _RULES_CACHE
    if _RULES_CACHE is None:
        if os.path.exists(RULES_CONFIG_PATH):
            try:
                with open(RULES_CONFIG_PATH, "r", encoding="utf-8") as f:
                    _RULES_CACHE = yaml.safe_load(f) or {}
            except Exception as e:
                logger.error(f"Failed to load weather_rules.yaml: {e}")
                _RULES_CACHE = {}
        else:
            _RULES_CACHE = {}
    return _RULES_CACHE or {}


def get_farm_owner(db: Session, farm: Farm) -> Optional[User]:
    """Resolves the user who owns or manages the given farm."""
    if farm and farm.operator_name:
        u = (
            db.query(User)
            .filter(
                User.role == "farmer",
                (User.full_name == farm.operator_name) | (User.username == farm.operator_name),
            )
            .first()
        )
        if u:
            return u

    # Fallback to case owner on this farm
    case = (
        db.query(Case)
        .filter(Case.farm_id == farm.id)
        .order_by(Case.created_at.desc())
        .first()
    )
    if case and case.user_id:
        u = db.query(User).filter(User.id == case.user_id).first()
        if u:
            return u

    # General fallback to any farmer
    return db.query(User).filter(User.role == "farmer").first()


def get_assigned_agronomists_for_farm(db: Session, farm_id: int) -> List[User]:
    """Returns assigned agronomists who currently have open cases on the given farm."""
    closed_statuses = ("DELIVERED", "OUTCOME_REPORTED", "CLOSED")
    cases = (
        db.query(Case)
        .filter(
            Case.farm_id == farm_id,
            Case.assigned_agronomist_id.isnot(None),
            ~Case.status.in_(closed_statuses),
        )
        .all()
    )
    agronomist_ids = {c.assigned_agronomist_id for c in cases if c.assigned_agronomist_id}
    if not agronomist_ids:
        return []
    return db.query(User).filter(User.id.in_(agronomist_ids)).all()


def evaluate_forecast_rules(forecast_data: Dict[str, Any], rules_cfg: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Evaluates 7-day daily forecast data against the 6 forecast rules:
    - heavy_rain (>=25 mm/day)
    - heat_stress (tmax >= 35 C)
    - frost_risk (tmin <= 2 C)
    - strong_wind (>= 30 km/h)
    - dry_spell (7-day rain < 5 mm)
    - disease_pressure (>= 3 days with rain >= 1 mm and tmax 20-30 C)

    Returns a list of candidate alert dictionaries:
    [{rule, severity, start_date, params}]
    """
    if not rules_cfg:
        rules_cfg = load_weather_rules()
    fc_rules = rules_cfg.get("forecast_rules", {})

    daily = forecast_data.get("daily", [])
    if not daily:
        return []

    alerts: List[Dict[str, Any]] = []

    # 1. Rule: Heavy Rain (daily rain >= threshold)
    hr_cfg = fc_rules.get("heavy_rain", {})
    hr_thresh = float(hr_cfg.get("threshold_mm", 25.0))
    hr_sev = hr_cfg.get("severity", "warning")
    for d in daily:
        precip = float(d.get("precipitation_mm", 0.0))
        if precip >= hr_thresh:
            alerts.append({
                "rule": "heavy_rain",
                "severity": hr_sev,
                "start_date": d["date"],
                "params": {"date": d["date"], "mm": round(precip, 1)},
            })

    # 2. Rule: Heat Stress (daily tmax >= threshold)
    hs_cfg = fc_rules.get("heat_stress", {})
    hs_thresh = float(hs_cfg.get("threshold_tmax_c", 35.0))
    hs_sev = hs_cfg.get("severity", "high")
    for d in daily:
        tmax = float(d.get("temp_max_c", 0.0))
        if tmax >= hs_thresh:
            alerts.append({
                "rule": "heat_stress",
                "severity": hs_sev,
                "start_date": d["date"],
                "params": {"date": d["date"], "temp": round(tmax, 1)},
            })

    # 3. Rule: Frost Risk (daily tmin <= threshold)
    fr_cfg = fc_rules.get("frost_risk", {})
    fr_thresh = float(fr_cfg.get("threshold_tmin_c", 2.0))
    fr_sev = fr_cfg.get("severity", "high")
    for d in daily:
        tmin = float(d.get("temp_min_c", 0.0))
        if tmin <= fr_thresh:
            alerts.append({
                "rule": "frost_risk",
                "severity": fr_sev,
                "start_date": d["date"],
                "params": {"date": d["date"], "temp": round(tmin, 1)},
            })

    # 4. Rule: Strong Wind (wind speed >= threshold)
    sw_cfg = fc_rules.get("strong_wind", {})
    sw_thresh = float(sw_cfg.get("threshold_kmh", 30.0))
    sw_sev = sw_cfg.get("severity", "warning")
    for d in daily:
        wind = float(d.get("wind_speed_kmh", 0.0))
        if wind >= sw_thresh:
            alerts.append({
                "rule": "strong_wind",
                "severity": sw_sev,
                "start_date": d["date"],
                "params": {"date": d["date"], "speed": round(wind, 1)},
            })

    # 5. Rule: Dry Spell (7-day rain < threshold)
    ds_cfg = fc_rules.get("dry_spell", {})
    ds_thresh = float(ds_cfg.get("threshold_7d_rain_mm", 5.0))
    ds_sev = ds_cfg.get("severity", "warning")
    total_7d_rain = sum(float(d.get("precipitation_mm", 0.0)) for d in daily)
    if total_7d_rain < ds_thresh:
        first_date = daily[0]["date"]
        alerts.append({
            "rule": "dry_spell",
            "severity": ds_sev,
            "start_date": first_date,
            "params": {"date": first_date, "mm": round(total_7d_rain, 1), "days": len(daily)},
        })

    # 6. Rule: Disease Pressure (>= 3 days with rain >= 1 mm and tmax 20-30 C)
    dp_cfg = fc_rules.get("disease_pressure", {})
    min_days = int(dp_cfg.get("min_days", 3))
    min_rain = float(dp_cfg.get("min_daily_rain_mm", 1.0))
    tmin_range = float(dp_cfg.get("temp_range_min_c", 20.0))
    tmax_range = float(dp_cfg.get("temp_range_max_c", 30.0))
    dp_sev = dp_cfg.get("severity", "warning")

    matching_days = []
    for d in daily:
        precip = float(d.get("precipitation_mm", 0.0))
        tmax = float(d.get("temp_max_c", 0.0))
        if precip >= min_rain and (tmin_range <= tmax <= tmax_range):
            matching_days.append(d["date"])

    if len(matching_days) >= min_days:
        first_match_date = matching_days[0]
        alerts.append({
            "rule": "disease_pressure",
            "severity": dp_sev,
            "start_date": first_match_date,
            "params": {
                "date": first_match_date,
                "days": len(matching_days),
                "mm": min_rain,
                "temp": f"{int(tmin_range)}-{int(tmax_range)}",
            },
        })

    return alerts


def evaluate_sensor_rules(
    sensor_summary: Dict[str, Any],
    crop: Optional[str] = "corn",
    reading_date: Optional[datetime.date] = None,
) -> List[Dict[str, Any]]:
    """
    Evaluates sensor rules by reusing interpret_sensor_data from interpret.py:
    - sensor_dry_soil (status active: warning, or critical: high)
    - sensor_fungal_pressure (watch -> warning, high -> high)
    - sensor_heat_stress (high -> high)

    start_date = the date of the latest reading.
    """
    if not sensor_summary:
        return []

    if reading_date is None:
        latest = sensor_summary.get("latest") or sensor_summary.get("latest_values") or {}
        measured_at = latest.get("measured_at")
        if measured_at:
            if isinstance(measured_at, str):
                reading_date = datetime.date.fromisoformat(measured_at[:10])
            elif hasattr(measured_at, "date"):
                reading_date = measured_at.date()
        if not reading_date:
            reading_date = datetime.date.today()

    reading_date_str = reading_date.isoformat() if hasattr(reading_date, "isoformat") else str(reading_date)

    items = interpret_sensor_data(sensor_summary, crop=crop)
    alerts: List[Dict[str, Any]] = []

    for item in items:
        key = item.get("key")
        status = item.get("status")
        sev = item.get("severity")
        val = item.get("value")

        if key == "dry_soil" and status == "active":
            alert_sev = "high" if sev == "critical" else "warning"
            alerts.append({
                "rule": "sensor_dry_soil",
                "severity": alert_sev,
                "start_date": reading_date_str,
                "params": {
                    "date": reading_date_str,
                    "moisture": round(float(val), 1) if val is not None else 18.0,
                },
            })

        elif key == "fungal_pressure":
            if status in ("watch", "high"):
                alert_sev = "high" if status == "high" else "warning"
                alerts.append({
                    "rule": "sensor_fungal_pressure",
                    "severity": alert_sev,
                    "start_date": reading_date_str,
                    "params": {
                        "date": reading_date_str,
                    },
                })

        elif key == "heat_stress" and status == "high":
            alerts.append({
                "rule": "sensor_heat_stress",
                "severity": "high",
                "start_date": reading_date_str,
                "params": {
                    "date": reading_date_str,
                    "temp": round(float(val), 1) if val is not None else 36.0,
                },
            })

    return alerts


def create_and_notify_alerts(
    db: Session,
    farm: Farm,
    candidate_alerts: List[Dict[str, Any]],
    source: str = "weather",
    field_id: Optional[int] = None,
) -> Tuple[int, List[WeatherAlert]]:
    """
    Inserts candidate alerts with deduplication (on conflict do nothing).
    Notifies farm owner ONLY for newly created alerts.
    If severity is 'high', also notifies assigned agronomists with open cases on that farm.
    Never includes other farms' data.
    """
    new_alerts: List[WeatherAlert] = []
    owner = get_farm_owner(db, farm)
    agronomists = get_assigned_agronomists_for_farm(db, farm.id)

    for item in candidate_alerts:
        rule = item["rule"]
        severity = item["severity"]
        s_date_raw = item["start_date"]
        if isinstance(s_date_raw, str):
            s_date = datetime.date.fromisoformat(s_date_raw[:10])
        elif isinstance(s_date_raw, datetime.date):
            s_date = s_date_raw
        elif hasattr(s_date_raw, "date"):
            s_date = s_date_raw.date()
        else:
            s_date = datetime.date.today()

        dedupe_key = f"{farm.id}:{rule}:{s_date.isoformat()}"

        # Deduplication check
        existing = db.query(WeatherAlert).filter(WeatherAlert.dedupe_key == dedupe_key).first()
        if existing:
            continue

        now_utc = datetime.datetime.utcnow()
        alert = WeatherAlert(
            farm_id=farm.id,
            field_id=field_id,
            source=source,
            rule=rule,
            severity=severity,
            start_date=s_date,
            params=item.get("params", {}),
            dedupe_key=dedupe_key,
            created_at=now_utc,
            notified_at=now_utc,
            read_at=None,
            is_demo=False,
        )
        try:
            db.add(alert)
            db.commit()
            db.refresh(alert)
            new_alerts.append(alert)
        except IntegrityError:
            db.rollback()
            continue

        # Notification payload: farm and alert specific only
        notify_payload = {
            "farm_name": farm.name,
            "condition": rule.replace("_", " ").title(),
            "severity": severity,
            "date": s_date.isoformat(),
            "case_number": f"Farm-{farm.id}",
            "case_url": f"/alerts?farm_id={farm.id}",
        }

        # 1. Notify farm owner
        if owner:
            try:
                notify(
                    event="weather_alert",
                    user=owner,
                    payload=notify_payload,
                    db=db,
                    case_id=None,
                )
            except Exception as e:
                logger.warning(f"Failed to notify owner {owner.id} of alert {alert.id}: {e}")

        # 2. For severity high, notify assigned agronomists with open cases on that farm
        if severity == "high" and agronomists:
            for agro in agronomists:
                try:
                    notify(
                        event="weather_alert",
                        user=agro,
                        payload=notify_payload,
                        db=db,
                        case_id=None,
                    )
                except Exception as e:
                    logger.warning(f"Failed to notify agronomist {agro.id} of high severity alert {alert.id}: {e}")

    return len(new_alerts), new_alerts


async def check_farm_weather_alerts(
    db: Session,
    farm: Farm,
    force: bool = False,
) -> Tuple[int, List[WeatherAlert]]:
    """
    Checks forecast rules for a single farm.
    - Skips if checked within the last 3 hours (unless force=True).
    - Obtains coordinates from first field with coordinates, falling back to farm lat/lng.
    - Fetches 7-day forecast.
    - Evaluates rules, dedupes, saves alerts, and dispatches notifications.
    """
    now = datetime.datetime.utcnow()

    # Skip if checked in the last 3 hours
    if not force and farm.last_weather_check_at is not None:
        elapsed_sec = (now - farm.last_weather_check_at).total_seconds()
        if elapsed_sec < 3 * 3600:
            logger.info(f"Skipping farm {farm.id} ({farm.name}): checked {int(elapsed_sec // 60)}m ago (<3h).")
            return 0, []

    loc = get_farm_location(farm)
    if not loc:
        logger.info(f"Skipping farm {farm.id} ({farm.name}): no valid coordinates found.")
        return 0, []

    forecast = await get_forecast(loc["lat"], loc["lng"])
    if not forecast:
        logger.warning(f"Failed to retrieve forecast for farm {farm.id} at ({loc['lat']}, {loc['lng']})")
        return 0, []

    # Mark farm as checked
    farm.last_weather_check_at = now
    db.commit()

    candidates = evaluate_forecast_rules(forecast)
    count, created = create_and_notify_alerts(
        db=db,
        farm=farm,
        candidate_alerts=candidates,
        source="weather",
        field_id=loc.get("field_id"),
    )
    return count, created


def check_case_sensor_alerts(
    db: Session,
    case: Case,
    reading_date: Optional[datetime.date] = None,
) -> Tuple[int, List[WeatherAlert]]:
    """
    Evaluates sensor alerts right after a sensor report or manual reading is saved on a case.
    Reuses interpret.py logic without duplication.
    """
    if not case or not case.sensor_summary:
        return 0, []

    farm = case.farm
    if not farm:
        return 0, []

    candidates = evaluate_sensor_rules(
        sensor_summary=case.sensor_summary,
        crop=case.crop,
        reading_date=reading_date,
    )

    count, created = create_and_notify_alerts(
        db=db,
        farm=farm,
        candidate_alerts=candidates,
        source="sensor",
        field_id=case.field_id,
    )
    return count, created


async def run_all_weather_alerts_job(
    db: Optional[Session] = None,
    force: bool = False,
) -> Dict[str, Any]:
    """
    APScheduler job / admin runner.
    Checks all farms with per-farm try/except so one failure never stops the run.
    Logs a summary line: (farms checked, alerts created, failures).
    """
    owns_db = False
    if db is None:
        db = SessionLocal()
        owns_db = True

    farms_checked = 0
    alerts_created = 0
    failures = 0
    farms_skipped = 0
    details = []

    try:
        farms = db.query(Farm).all()
        for farm in farms:
            try:
                # Check if skipped due to 3-hour check
                now = datetime.datetime.utcnow()
                if not force and farm.last_weather_check_at:
                    elapsed = (now - farm.last_weather_check_at).total_seconds()
                    if elapsed < 3 * 3600:
                        farms_skipped += 1
                        details.append({"farm_id": farm.id, "status": "skipped", "reason": "checked_recently"})
                        continue

                loc = get_farm_location(farm)
                if not loc:
                    farms_skipped += 1
                    details.append({"farm_id": farm.id, "status": "skipped", "reason": "no_coordinates"})
                    continue

                created_count, _ = await check_farm_weather_alerts(db, farm, force=force)
                farms_checked += 1
                alerts_created += created_count
                details.append({
                    "farm_id": farm.id,
                    "status": "success",
                    "alerts_created": created_count,
                })
            except Exception as e:
                failures += 1
                logger.error(f"Error checking weather alerts for farm {farm.id} ({farm.name}): {e}", exc_info=True)
                details.append({
                    "farm_id": farm.id,
                    "status": "error",
                    "error": str(e),
                })

        summary_msg = (
            f"Weather alert check finished: {farms_checked} farms checked, "
            f"{alerts_created} alerts created, {failures} failures, {farms_skipped} skipped."
        )
        logger.info(summary_msg)

        return {
            "farms_checked": farms_checked,
            "alerts_created": alerts_created,
            "failures": failures,
            "farms_skipped": farms_skipped,
            "details": details,
        }
    finally:
        if owns_db:
            db.close()
