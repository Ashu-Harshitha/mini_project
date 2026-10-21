"""
AgriAdvisor AI Outbreak Detection & Map API Routes.

Endpoints:
- GET /admin/outbreaks: List outbreaks with status filter (admin & agronomist)
- GET /admin/outbreaks/{id}: Outbreak details with cases and farms
- PATCH /admin/outbreaks/{id}/resolve: Resolve an outbreak (admin only)
- GET /admin/map/cases: Cases with coordinates, crop, issue_category, date for map display
- GET /alerts/nearby: Privacy-safe regional outbreak alerts for farmers and agronomists
"""

import datetime
import logging
from typing import List, Optional, Set, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.models import (
    User,
    Case,
    Farm,
    Field,
    Outbreak,
    outbreak_cases,
)
from app.schemas.schemas import (
    OutbreakRead,
    OutbreakDetailRead,
    OutbreakCaseItem,
    OutbreakFarmItem,
    AdminMapCaseItem,
    NearbyOutbreakAlert,
)
from app.api.deps import require_role, get_current_user
from app.services.outbreaks import haversine_distance
from app.services.weather import get_farm_location

logger = logging.getLogger("agriadvisor.api.outbreaks")

router = APIRouter(tags=["Outbreaks"])


@router.get("/admin/outbreaks", response_model=List[OutbreakRead])
def list_outbreaks(
    status: Optional[str] = Query(None, description="Filter by status: open or resolved"),
    crop: Optional[str] = Query(None, description="Filter by crop"),
    severity: Optional[str] = Query(None, description="Filter by severity: watch or alert"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "agronomist")),
):
    """
    Lists outbreaks with optional status/crop/severity filter.
    Accessible to admins and agronomists.
    """
    query = db.query(Outbreak)

    if status:
        query = query.filter(func.lower(Outbreak.status) == status.strip().lower())
    if crop:
        query = query.filter(func.lower(Outbreak.crop) == crop.strip().lower())
    if severity:
        query = query.filter(func.lower(Outbreak.severity) == severity.strip().lower())

    outbreaks = query.order_by(Outbreak.last_seen.desc()).all()
    return outbreaks


@router.get("/admin/outbreaks/{id}", response_model=OutbreakDetailRead)
def get_outbreak_details(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "agronomist")),
):
    """
    Retrieves full details of a specific outbreak including associated cases and distinct farms.
    """
    outbreak = db.query(Outbreak).filter(Outbreak.id == id).first()
    if not outbreak:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Outbreak with ID {id} not found.",
        )

    case_items: List[OutbreakCaseItem] = []
    farm_map: Dict[int, OutbreakFarmItem] = {}

    for c in outbreak.cases:
        farm = c.farm
        lat, lng = None, None
        farm_name = None

        if farm:
            farm_name = farm.name
            loc = get_farm_location(farm)
            if loc:
                lat, lng = loc["lat"], loc["lng"]

        if lat is None and c.location_snapshot:
            lat = c.location_snapshot.get("lat")
            lng = c.location_snapshot.get("lng")

        case_item = OutbreakCaseItem(
            id=c.id,
            case_number=c.case_number,
            crop=c.crop,
            issue_category=c.issue_category,
            status=c.status,
            created_at=c.created_at,
            farm_id=c.farm_id,
            farm_name=farm_name,
            lat=lat,
            lng=lng,
        )
        case_items.append(case_item)

        if farm:
            if farm.id in farm_map:
                farm_map[farm.id].case_count += 1
            else:
                farm_map[farm.id] = OutbreakFarmItem(
                    farm_id=farm.id,
                    farm_name=farm.name,
                    operator_name=farm.operator_name,
                    lat=lat,
                    lng=lng,
                    case_count=1,
                )

    return OutbreakDetailRead(
        id=outbreak.id,
        issue_category=outbreak.issue_category,
        crop=outbreak.crop,
        center_lat=outbreak.center_lat,
        center_lng=outbreak.center_lng,
        radius_km=outbreak.radius_km,
        farm_count=outbreak.farm_count,
        case_count=outbreak.case_count,
        severity=outbreak.severity,
        status=outbreak.status,
        first_seen=outbreak.first_seen,
        last_seen=outbreak.last_seen,
        resolved_at=outbreak.resolved_at,
        cases=case_items,
        farms=list(farm_map.values()),
    )


@router.patch("/admin/outbreaks/{id}/resolve", response_model=OutbreakRead)
def resolve_outbreak(
    id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("admin")),
):
    """
    Marks an active outbreak as resolved. Admin only.
    """
    outbreak = db.query(Outbreak).filter(Outbreak.id == id).first()
    if not outbreak:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Outbreak with ID {id} not found.",
        )

    outbreak.status = "resolved"
    outbreak.resolved_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(outbreak)
    return outbreak


@router.get("/admin/map/cases", response_model=List[AdminMapCaseItem])
def get_map_cases(
    crop: Optional[str] = Query(None, description="Filter cases by crop"),
    issue: Optional[str] = Query(None, description="Filter cases by issue category"),
    days: Optional[int] = Query(14, ge=1, le=365, description="Lookback window in days"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "agronomist")),
):
    """
    Returns cases with farm coordinates, crop, issue category, status, and date.
    Agronomists receive only cases relevant to their workload.
    """
    query = db.query(Case)

    if days:
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
        query = query.filter(Case.created_at >= cutoff)

    if crop:
        query = query.filter(func.lower(Case.crop) == crop.strip().lower())

    if issue:
        query = query.filter(func.lower(Case.issue_category) == issue.strip().lower())

    # Role scoping for agronomists
    if current_user.role == "agronomist":
        query = query.filter(Case.assigned_agronomist_id == current_user.id)

    cases = query.order_by(Case.created_at.desc()).all()

    items: List[AdminMapCaseItem] = []
    for c in cases:
        lat, lng = None, None
        farm = c.farm
        farm_name = farm.name if farm else None

        if farm:
            loc = get_farm_location(farm)
            if loc:
                lat, lng = loc["lat"], loc["lng"]

        if lat is None and c.location_snapshot:
            lat = c.location_snapshot.get("lat")
            lng = c.location_snapshot.get("lng")

        # Skip cases without valid coordinates
        if lat is None or lng is None:
            continue

        outbreak_id = c.outbreaks[0].id if c.outbreaks else None

        items.append(
            AdminMapCaseItem(
                id=c.id,
                case_number=c.case_number,
                crop=c.crop,
                issue_category=c.issue_category or "other",
                status=c.status,
                date=c.created_at,
                farm_id=c.farm_id,
                farm_name=farm_name,
                lat=float(lat),
                lng=float(lng),
                outbreak_id=outbreak_id,
            )
        )

    return items


@router.get("/alerts/nearby", response_model=List[NearbyOutbreakAlert])
def get_nearby_outbreak_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns privacy-safe open outbreak alerts nearby.
    - Farmer: open outbreaks near their farms WITHOUT any other farms' details.
    - Agronomist: open outbreaks relevant to their assigned cases.
    - Admin: all open outbreaks.
    """
    open_outbreaks = db.query(Outbreak).filter(Outbreak.status == "open").all()
    if not open_outbreaks:
        return []

    alerts: List[NearbyOutbreakAlert] = []

    if current_user.role == "admin":
        for o in open_outbreaks:
            issue_title = o.issue_category.replace("_", " ").title()
            crop_title = o.crop.title()
            alerts.append(
                NearbyOutbreakAlert(
                    outbreak_id=o.id,
                    issue_category=o.issue_category,
                    crop=o.crop,
                    severity=o.severity,
                    radius_km=o.radius_km,
                    distance_km=0.0,
                    first_seen=o.first_seen,
                    last_seen=o.last_seen,
                    title=f"Regional Advisory: {issue_title} on {crop_title}",
                    message=f"Regional advisory for {issue_title} on {crop_title} active with {o.farm_count} farms affected.",
                    action=f"Scout your {crop_title} for {issue_title}",
                )
            )
        return alerts

    if current_user.role == "farmer":
        # Discover all farms and crops associated with this farmer
        user_name_lower = (current_user.full_name or "").strip().lower()
        user_login_lower = (current_user.username or "").strip().lower()

        farmer_farms = []
        all_farms = db.query(Farm).all()
        for f in all_farms:
            op_lower = (f.operator_name or "").strip().lower()
            if op_lower and (op_lower == user_name_lower or op_lower == user_login_lower):
                farmer_farms.append(f)

        # Also include farms where farmer submitted cases
        farmer_cases = db.query(Case).filter(Case.user_id == current_user.id).all()
        farmer_crops = {c.crop.strip().lower() for c in farmer_cases if c.crop}

        for c in farmer_cases:
            if c.farm and c.farm not in farmer_farms:
                farmer_farms.append(c.farm)

        # Collect farm locations
        farmer_locations: List[Dict[str, float]] = []
        for f in farmer_farms:
            loc = get_farm_location(f)
            if loc:
                farmer_locations.append(loc)
            # Add crops grown in fields of this farm
            for fld in f.fields:
                if fld.current_crop:
                    farmer_crops.add(fld.current_crop.strip().lower())

        if not farmer_locations and farmer_cases:
            for c in farmer_cases:
                if c.location_snapshot and "lat" in c.location_snapshot and "lng" in c.location_snapshot:
                    farmer_locations.append(c.location_snapshot)

        for o in open_outbreaks:
            o_crop_lower = o.crop.strip().lower()
            # If farmer has no recorded crops yet, or farmer grows this crop
            crop_matches = (not farmer_crops) or (o_crop_lower in farmer_crops)
            if not crop_matches:
                continue

            # Check distance to farmer's nearest farm/field
            min_dist: Optional[float] = None
            for loc in farmer_locations:
                d = haversine_distance(o.center_lat, o.center_lng, loc["lat"], loc["lng"])
                if min_dist is None or d < min_dist:
                    min_dist = d

            # If within radius
            if min_dist is not None and min_dist <= o.radius_km:
                issue_title = o.issue_category.replace("_", " ").title()
                crop_title = o.crop.title()
                # STRICT PRIVACY: Zero other farm names, zero other farmer names, zero other case IDs
                alerts.append(
                    NearbyOutbreakAlert(
                        outbreak_id=o.id,
                        issue_category=o.issue_category,
                        crop=o.crop,
                        severity=o.severity,
                        radius_km=o.radius_km,
                        distance_km=round(min_dist, 1),
                        first_seen=o.first_seen,
                        last_seen=o.last_seen,
                        title=f"Regional Advisory: {issue_title} on {crop_title}",
                        message=f"A regional advisory for {issue_title} on {crop_title} has been detected within {int(o.radius_km)} km of your area.",
                        action=f"Scout your {crop_title} for {issue_title}",
                    )
                )

        return alerts

    if current_user.role == "agronomist":
        # Outbreaks relevant to assigned cases
        assigned_cases = db.query(Case).filter(Case.assigned_agronomist_id == current_user.id).all()
        assigned_case_ids = {c.id for c in assigned_cases}
        assigned_crops = {c.crop.strip().lower() for c in assigned_cases if c.crop}

        for o in open_outbreaks:
            # Matches if any assigned case is in the outbreak or crop matches
            outbreak_case_ids = {c.id for c in o.cases}
            has_assigned_case = bool(assigned_case_ids & outbreak_case_ids)
            crop_matches = o.crop.strip().lower() in assigned_crops

            if has_assigned_case or crop_matches:
                issue_title = o.issue_category.replace("_", " ").title()
                crop_title = o.crop.title()
                alerts.append(
                    NearbyOutbreakAlert(
                        outbreak_id=o.id,
                        issue_category=o.issue_category,
                        crop=o.crop,
                        severity=o.severity,
                        radius_km=o.radius_km,
                        distance_km=0.0,
                        first_seen=o.first_seen,
                        last_seen=o.last_seen,
                        title=f"Regional Advisory: {issue_title} on {crop_title}",
                        message=f"Active advisory for {issue_title} on {crop_title} ({o.farm_count} farms, {o.case_count} cases).",
                        action=f"Scout your {crop_title} for {issue_title}",
                    )
                )
        return alerts

    return []
