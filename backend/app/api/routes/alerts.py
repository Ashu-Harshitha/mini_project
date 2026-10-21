import datetime
import logging
from typing import List, Optional, Set
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.models import Farm, Field, Case, User, WeatherAlert
from app.schemas.schemas import (
    WeatherAlertRead,
    AlertsListResponse,
    AlertJobSummary,
    FarmForecastResponse,
    ForecastDayItem,
)
from app.api.deps import get_current_user
from app.services.weather import get_forecast, get_farm_location, coarsen
from app.services.alert_renderer import render_alert
from app.services.alerts_engine import run_all_weather_alerts_job

logger = logging.getLogger("agriadvisor.api.alerts")

router = APIRouter(tags=["Alerts & Weather"])


def get_user_accessible_farm_ids(db: Session, user: User) -> Optional[Set[int]]:
    """
    Returns the set of farm IDs the user is authorized to view.
    Returns None for admin (unrestricted access).
    """
    if user.role == "admin":
        return None

    if user.role == "farmer":
        farm_ids: Set[int] = set()
        user_name_lower = (user.full_name or "").strip().lower()
        user_login_lower = (user.username or "").strip().lower()

        # Farms where operator_name matches farmer name/username
        farms = db.query(Farm).all()
        for f in farms:
            op_lower = (f.operator_name or "").strip().lower()
            if op_lower and (op_lower == user_name_lower or op_lower == user_login_lower):
                farm_ids.add(f.id)

        # Farms where farmer has submitted cases
        case_farms = (
            db.query(Case.farm_id)
            .filter(Case.user_id == user.id)
            .distinct()
            .all()
        )
        for (fid,) in case_farms:
            if fid:
                farm_ids.add(fid)

        return farm_ids

    if user.role == "agronomist":
        # Farms associated with cases assigned to this agronomist
        case_farms = (
            db.query(Case.farm_id)
            .filter(Case.assigned_agronomist_id == user.id)
            .distinct()
            .all()
        )
        return {fid for (fid,) in case_farms if fid}

    return set()


def _format_alert_read(alert: WeatherAlert, lang: str) -> WeatherAlertRead:
    """Renders localized title, message, and action and builds WeatherAlertRead."""
    rendered = render_alert(alert.rule, lang, alert.params or {})
    start_date_str = alert.start_date.isoformat() if hasattr(alert.start_date, "isoformat") else str(alert.start_date)
    return WeatherAlertRead(
        id=alert.id,
        farm_id=alert.farm_id,
        farm_name=alert.farm.name if alert.farm else None,
        field_id=alert.field_id,
        field_name=alert.field.name if alert.field else None,
        source=alert.source,
        rule=alert.rule,
        severity=alert.severity,
        start_date=start_date_str,
        title=rendered["title"],
        message=rendered["message"],
        action=rendered["action"],
        params=alert.params,
        created_at=alert.created_at,
        notified_at=alert.notified_at,
        read_at=alert.read_at,
        is_demo=alert.is_demo,
    )


@router.get("/alerts", response_model=AlertsListResponse)
def list_alerts(
    unread: Optional[bool] = Query(None, description="Filter by unread status"),
    severity: Optional[str] = Query(None, description="Filter by severity: info, warning, high"),
    farm: Optional[int] = Query(None, description="Filter by farm ID"),
    farm_id: Optional[int] = Query(None, description="Alias for farm ID"),
    source: Optional[str] = Query(None, description="Filter by source: weather or sensor"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns alerts scoped by user role:
    - Farmer: own farms only
    - Agronomist: farms with assigned cases
    - Admin: all farms
    Rendered strictly in the viewer's language without LLMs.
    """
    accessible = get_user_accessible_farm_ids(db, current_user)
    target_farm_id = farm if farm is not None else farm_id

    # If user specifies a farm, verify accessibility
    if target_farm_id is not None:
        if accessible is not None and target_farm_id not in accessible:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: you do not have permission to view alerts for farm {target_farm_id}.",
            )

    query = db.query(WeatherAlert)

    # Role scoping
    if accessible is not None:
        if not accessible:
            return AlertsListResponse(items=[], total=0, unread_count=0, page=page, limit=limit)
        query = query.filter(WeatherAlert.farm_id.in_(accessible))

    # Farm filter
    if target_farm_id is not None:
        query = query.filter(WeatherAlert.farm_id == target_farm_id)

    # Severity filter
    if severity:
        query = query.filter(WeatherAlert.severity == severity.lower().strip())

    # Source filter
    if source:
        query = query.filter(WeatherAlert.source == source.lower().strip())

    # Unread filter
    if unread is True:
        query = query.filter(WeatherAlert.read_at.is_(None))
    elif unread is False:
        query = query.filter(WeatherAlert.read_at.isnot(None))

    total = query.count()

    # Calculate overall unread count for accessible scope
    unread_query = db.query(func.count(WeatherAlert.id)).filter(WeatherAlert.read_at.is_(None))
    if accessible is not None:
        unread_query = unread_query.filter(WeatherAlert.farm_id.in_(accessible))
    if target_farm_id is not None:
        unread_query = unread_query.filter(WeatherAlert.farm_id == target_farm_id)
    unread_count = unread_query.scalar() or 0

    # Paging
    offset = (page - 1) * limit
    alerts = (
        query.order_by(WeatherAlert.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    user_lang = current_user.language or "en"
    formatted_items = [_format_alert_read(a, user_lang) for a in alerts]

    return AlertsListResponse(
        items=formatted_items,
        total=total,
        unread_count=unread_count,
        page=page,
        limit=limit,
    )


@router.patch("/alerts/{id}/read", response_model=WeatherAlertRead)
def mark_alert_read(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marks a single alert as read."""
    alert = db.query(WeatherAlert).filter(WeatherAlert.id == id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    accessible = get_user_accessible_farm_ids(db, current_user)
    if accessible is not None and alert.farm_id not in accessible:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: you do not have permission to modify this alert.",
        )

    if alert.read_at is None:
        alert.read_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(alert)

    user_lang = current_user.language or "en"
    return _format_alert_read(alert, user_lang)


@router.post("/alerts/read-all")
def mark_all_alerts_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marks all unread alerts within the current user's accessible scope as read."""
    accessible = get_user_accessible_farm_ids(db, current_user)
    query = db.query(WeatherAlert).filter(WeatherAlert.read_at.is_(None))

    if accessible is not None:
        if not accessible:
            return {"count": 0, "message": "No unread alerts found."}
        query = query.filter(WeatherAlert.farm_id.in_(accessible))

    now = datetime.datetime.utcnow()
    count = query.update({WeatherAlert.read_at: now}, synchronize_session=False)
    db.commit()

    return {"count": count, "message": f"Marked {count} alerts as read."}


@router.get("/farms/{id}/forecast", response_model=FarmForecastResponse)
async def get_farm_forecast(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns normalized 7-day forecast for the given farm.
    Accessible to farm owner, assigned agronomists, and admins.
    Precise coordinates are shown for authorized roles; others receive coarsened coordinates.
    """
    farm = db.query(Farm).filter(Farm.id == id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    accessible = get_user_accessible_farm_ids(db, current_user)
    is_authorized = (accessible is None) or (id in accessible)

    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: you do not have permission to view forecast for this farm.",
        )

    loc = get_farm_location(farm)
    if not loc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Farm does not have valid coordinates configured.",
        )

    forecast = await get_forecast(loc["lat"], loc["lng"])
    if not forecast:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to fetch forecast from Open-Meteo service.",
        )

    # Privacy scoping: Precise coordinates only for owner, assigned agronomist, admin
    lat = loc["lat"]
    lng = loc["lng"]
    is_coarsened = False
    if current_user.role not in ("admin", "farmer", "agronomist") or not is_authorized:
        lat, lng = coarsen(lat, lng, decimals=1)
        is_coarsened = True

    active_alerts_count = (
        db.query(func.count(WeatherAlert.id))
        .filter(WeatherAlert.farm_id == farm.id, WeatherAlert.read_at.is_(None))
        .scalar()
        or 0
    )

    daily_items = [
        ForecastDayItem(
            date=d["date"],
            temp_max_c=d["temp_max_c"],
            temp_min_c=d["temp_min_c"],
            precipitation_mm=d["precipitation_mm"],
            precipitation_probability_pct=d["precipitation_probability_pct"],
            wind_speed_kmh=d["wind_speed_kmh"],
            uv_index_max=d["uv_index_max"],
        )
        for d in forecast.get("daily", [])
    ]

    return FarmForecastResponse(
        farm_id=farm.id,
        farm_name=farm.name,
        field_id=loc.get("field_id"),
        field_name=loc.get("field_name"),
        latitude=lat,
        longitude=lng,
        is_coarsened=is_coarsened,
        timezone=forecast.get("timezone", "UTC"),
        fetched_at=forecast.get("fetched_at", datetime.datetime.utcnow().isoformat()),
        daily=daily_items,
        active_alerts_count=active_alerts_count,
    )


@router.post("/admin/alerts/run", response_model=AlertJobSummary)
async def admin_run_alerts_job(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Admin-only endpoint to trigger an immediate check of weather alerts for all farms.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: admin access required to run alerts job.",
        )

    summary = await run_all_weather_alerts_job(db=db, force=True)
    return AlertJobSummary(**summary)
