"""
AgriAdvisor AI Outbreak Detection Service.

Clusters distinct farms greedily by haversine distance (<= OUTBREAK_RADIUS_KM).
A cluster with >= OUTBREAK_MIN_FARMS distinct farms is an outbreak.
Merges into existing open outbreaks within radius rather than duplicating.
Auto-resolves outbreaks when no new cases arrive for OUTBREAK_WINDOW_DAYS.
Sends privacy-safe notifications to admins and nearby farmers growing the same crop.
"""

import math
import logging
import datetime
from typing import List, Dict, Any, Optional, Tuple, Set
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.models.models import (
    Case,
    Outbreak,
    OutbreakNotified,
    outbreak_cases,
    Farm,
    User,
)
from app.services.case_state import CaseState
from app.services.weather import get_farm_location
from app.services.notifications import notify
from app.core.config import settings
from app.core.database import SessionLocal

logger = logging.getLogger("agriadvisor.outbreaks")


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes Great-Circle distance between two points on Earth in kilometers.
    """
    R = 6371.0  # Earth radius in km
    phi1 = math.radians(float(lat1))
    phi2 = math.radians(float(lat2))
    delta_phi = math.radians(float(lat2) - float(lat1))
    delta_lambda = math.radians(float(lon2) - float(lon1))

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return R * c


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

    case = (
        db.query(Case)
        .filter(Case.farm_id == farm.id)
        .order_by(Case.created_at.desc())
        .first()
    )
    if case and case.user_id:
        return db.query(User).filter(User.id == case.user_id).first()

    return None


def auto_resolve_stale_outbreaks(
    db: Session,
    window_days: int,
    now: Optional[datetime.datetime] = None,
) -> int:
    """
    Auto-resolves open outbreaks that have had no new cases for window_days.
    Returns the count of resolved outbreaks.
    """
    if now is None:
        now = datetime.datetime.utcnow()

    cutoff = now - datetime.timedelta(days=window_days)
    open_outbreaks = db.query(Outbreak).filter(Outbreak.status == "open").all()
    resolved_count = 0

    for ob in open_outbreaks:
        # Check latest case or last_seen
        latest_time = ob.last_seen
        if ob.cases:
            max_case_time = max(c.created_at for c in ob.cases)
            if max_case_time > latest_time:
                latest_time = max_case_time

        if latest_time < cutoff:
            ob.status = "resolved"
            ob.resolved_at = now
            db.add(ob)
            resolved_count += 1
            logger.info(f"Auto-resolved stale outbreak {ob.id} ({ob.issue_category} on {ob.crop}).")

    if resolved_count > 0:
        db.commit()

    return resolved_count


def detect_outbreaks(
    db: Session,
    window_days: Optional[int] = None,
    radius_km: Optional[float] = None,
    min_farms: Optional[int] = None,
    alert_farms: Optional[int] = None,
    now: Optional[datetime.datetime] = None,
) -> List[Outbreak]:
    """
    Main outbreak detection engine:
    1. Auto-resolves stale outbreaks older than window_days.
    2. Takes cases created in window with issue_category not in ('healthy', 'other') and valid farm coordinates.
    3. Groups by (issue_category, crop).
    4. Inside each group, clusters DISTINCT FARMS greedily by haversine distance <= radius_km.
    5. A cluster with >= min_farms distinct farms is an outbreak (severity 'alert' when >= alert_farms, else 'watch').
    6. Merges into existing open outbreaks within radius instead of duplicating.
    7. Dispatches notifications.
    """
    if now is None:
        now = datetime.datetime.utcnow()

    w_days = window_days if window_days is not None else getattr(settings, "OUTBREAK_WINDOW_DAYS", 14)
    r_km = radius_km if radius_km is not None else getattr(settings, "OUTBREAK_RADIUS_KM", 25.0)
    m_farms = min_farms if min_farms is not None else getattr(settings, "OUTBREAK_MIN_FARMS", 3)
    a_farms = alert_farms if alert_farms is not None else getattr(settings, "OUTBREAK_ALERT_FARMS", 6)

    # 1. Auto-resolve stale outbreaks
    auto_resolve_stale_outbreaks(db, window_days=w_days, now=now)

    # 2. Query qualifying cases created in the window
    window_start = now - datetime.timedelta(days=w_days)
    cases = (
        db.query(Case)
        .filter(
            Case.created_at >= window_start,
            Case.issue_category.isnot(None),
            func.lower(Case.issue_category).notin_(["healthy", "other", "none", ""]),
        )
        .all()
    )

    # 3. Associate cases with farm coordinates and group by (category, crop)
    grouped_cases: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}

    for c in cases:
        if not c.crop:
            continue
        farm = c.farm or db.query(Farm).filter(Farm.id == c.farm_id).first()
        if not farm:
            continue
        loc = get_farm_location(farm)
        if not loc:
            continue

        cat_key = c.issue_category.strip().lower()
        crop_key = c.crop.strip().lower()

        grouped_cases.setdefault((cat_key, crop_key), []).append({
            "case": c,
            "farm_id": farm.id,
            "lat": float(loc["lat"]),
            "lng": float(loc["lng"]),
            "created_at": c.created_at,
        })

    resulting_outbreaks: List[Outbreak] = []

    # 4. Cluster distinct farms greedily inside each group
    for (cat, crop_name), items in grouped_cases.items():
        # clusters: list of dicts with center_lat, center_lng, farms: {farm_id: (lat, lng)}, cases: [case]
        clusters: List[Dict[str, Any]] = []

        for item in items:
            p_lat, p_lng = item["lat"], item["lng"]
            assigned_cluster = None
            min_dist = float("inf")

            for cl in clusters:
                dist = haversine_distance(p_lat, p_lng, cl["center_lat"], cl["center_lng"])
                if dist <= r_km and dist < min_dist:
                    min_dist = dist
                    assigned_cluster = cl

            if assigned_cluster is not None:
                assigned_cluster["farms"][item["farm_id"]] = (p_lat, p_lng)
                assigned_cluster["cases"].append(item["case"])
                # Update centroid of distinct farms
                farm_coords = list(assigned_cluster["farms"].values())
                assigned_cluster["center_lat"] = sum(f[0] for f in farm_coords) / len(farm_coords)
                assigned_cluster["center_lng"] = sum(f[1] for f in farm_coords) / len(farm_coords)
            else:
                clusters.append({
                    "center_lat": p_lat,
                    "center_lng": p_lng,
                    "farms": {item["farm_id"]: (p_lat, p_lng)},
                    "cases": [item["case"]],
                })

        # 5. Check cluster thresholds & merge or create outbreaks
        for cl in clusters:
            distinct_farms_count = len(cl["farms"])
            if distinct_farms_count < m_farms:
                continue

            sev = "alert" if distinct_farms_count >= a_farms else "watch"
            case_count = len(cl["cases"])
            first_seen = min(c.created_at for c in cl["cases"])
            last_seen = max(c.created_at for c in cl["cases"])
            c_lat = cl["center_lat"]
            c_lng = cl["center_lng"]

            # Search existing open outbreak of the same category and crop within radius
            existing_open = (
                db.query(Outbreak)
                .filter(
                    Outbreak.status == "open",
                    func.lower(Outbreak.issue_category) == cat,
                    func.lower(Outbreak.crop) == crop_name,
                )
                .all()
            )

            matched_ob: Optional[Outbreak] = None
            for ob_candidate in existing_open:
                dist_to_center = haversine_distance(c_lat, c_lng, ob_candidate.center_lat, ob_candidate.center_lng)
                if dist_to_center <= r_km:
                    matched_ob = ob_candidate
                    break

            if matched_ob is not None:
                # Merge into existing open outbreak
                existing_case_ids = {c.id for c in matched_ob.cases}
                for c_item in cl["cases"]:
                    if c_item.id not in existing_case_ids:
                        matched_ob.cases.append(c_item)

                # Recompute distinct farms from all linked cases
                all_farms: Dict[int, Tuple[float, float]] = {}
                for case_obj in matched_ob.cases:
                    f_obj = case_obj.farm or db.query(Farm).filter(Farm.id == case_obj.farm_id).first()
                    if f_obj:
                        coords = get_farm_location(f_obj)
                        if coords:
                            all_farms[f_obj.id] = (coords["lat"], coords["lng"])

                if all_farms:
                    matched_ob.center_lat = sum(f[0] for f in all_farms.values()) / len(all_farms)
                    matched_ob.center_lng = sum(f[1] for f in all_farms.values()) / len(all_farms)
                matched_ob.farm_count = len(all_farms)
                matched_ob.case_count = len(matched_ob.cases)
                matched_ob.last_seen = max(matched_ob.last_seen, last_seen)
                matched_ob.severity = "alert" if matched_ob.farm_count >= a_farms else "watch"

                db.add(matched_ob)
                db.commit()
                db.refresh(matched_ob)
                target_ob = matched_ob
            else:
                # Create brand new outbreak
                new_ob = Outbreak(
                    issue_category=cat,
                    crop=crop_name,
                    center_lat=c_lat,
                    center_lng=c_lng,
                    radius_km=r_km,
                    farm_count=distinct_farms_count,
                    case_count=case_count,
                    severity=sev,
                    status="open",
                    first_seen=first_seen,
                    last_seen=last_seen,
                )
                new_ob.cases = cl["cases"]
                db.add(new_ob)
                db.commit()
                db.refresh(new_ob)
                target_ob = new_ob

            # Dispatch notifications
            dispatch_outbreak_notifications(db, target_ob)
            resulting_outbreaks.append(target_ob)

    return resulting_outbreaks


def dispatch_outbreak_notifications(db: Session, outbreak: Outbreak) -> None:
    """
    Sends outbreak notifications:
    1. Admins: notified once per outbreak (outbreak_detected).
    2. Farmers: whose farm is within the radius and grows the same crop, notified ONCE per outbreak.
       Privacy-safe payload: no farm or farmer names, approximate area only, generic action line.
    """
    already_notified_user_ids: Set[int] = set(
        uid for (uid,) in db.query(OutbreakNotified.user_id).filter(OutbreakNotified.outbreak_id == outbreak.id).all()
    )

    issue_title = outbreak.issue_category.replace("_", " ").title()
    crop_title = outbreak.crop.title()

    # 1. Notify Admins
    admins = db.query(User).filter(User.role == "admin", User.active == True).all()
    for admin in admins:
        if admin.id in already_notified_user_ids:
            continue

        admin_payload = {
            "pest": issue_title,
            "crop": crop_title,
            "location": f"Regional Cluster ({outbreak.farm_count} farms within {int(outbreak.radius_km)} km)",
            "case_url": f"{settings.FRONTEND_URL}/admin/outbreaks",
            "severity": outbreak.severity,
            "title": f"Outbreak Alert: {issue_title} on {crop_title}",
            "message": f"A regional outbreak of {issue_title} on {crop_title} has reached {outbreak.farm_count} farms.",
        }
        try:
            notify(
                event="outbreak_detected",
                user=admin,
                payload=admin_payload,
                db=db,
            )
        except Exception as e:
            logger.warning(f"Failed to notify admin {admin.id}: {e}")

        notif_record = OutbreakNotified(
            outbreak_id=outbreak.id,
            user_id=admin.id,
            notified_at=datetime.datetime.utcnow(),
        )
        db.add(notif_record)
        try:
            db.commit()
            already_notified_user_ids.add(admin.id)
        except IntegrityError:
            db.rollback()

    # 2. Notify Farmers within radius growing the same crop
    all_farms = db.query(Farm).all()
    target_crop_lower = outbreak.crop.strip().lower()

    for farm in all_farms:
        # Check crop match
        grows_crop = False
        if farm.primary_crops and isinstance(farm.primary_crops, list):
            for cr in farm.primary_crops:
                if str(cr).strip().lower() == target_crop_lower:
                    grows_crop = True
                    break

        if not grows_crop and farm.fields:
            for fld in farm.fields:
                if fld.current_crop and fld.current_crop.strip().lower() == target_crop_lower:
                    grows_crop = True
                    break

        if not grows_crop:
            continue

        # Check distance to outbreak center
        loc = get_farm_location(farm)
        if not loc:
            continue

        dist = haversine_distance(outbreak.center_lat, outbreak.center_lng, loc["lat"], loc["lng"])
        if dist > outbreak.radius_km:
            continue

        owner = get_farm_owner(db, farm)
        if not owner or owner.role != "farmer" or not owner.active:
            continue

        if owner.id in already_notified_user_ids:
            continue

        # PRIVACY SAFE MESSAGE:
        # No farm or farmer names or IDs from other farms.
        # Approximate area only.
        # Action line: "Scout your {crop} for {issue}".
        farmer_payload = {
            "pest": issue_title,
            "crop": crop_title,
            "location": f"within {int(outbreak.radius_km)} km of your area",
            "case_url": f"{settings.FRONTEND_URL}/alerts",
            "title": f"Regional Advisory: {issue_title} on {crop_title}",
            "message": f"A regional advisory for {issue_title} on {crop_title} has been detected within {int(outbreak.radius_km)} km of your area.",
            "action": f"Scout your {crop_title} for {issue_title}",
        }

        try:
            notify(
                event="outbreak_detected",
                user=owner,
                payload=farmer_payload,
                db=db,
            )
        except Exception as e:
            logger.warning(f"Failed to notify farmer {owner.id} for outbreak {outbreak.id}: {e}")

        notif_record = OutbreakNotified(
            outbreak_id=outbreak.id,
            user_id=owner.id,
            notified_at=datetime.datetime.utcnow(),
        )
        db.add(notif_record)
        try:
            db.commit()
            already_notified_user_ids.add(owner.id)
        except IntegrityError:
            db.rollback()


def run_outbreak_detection_task():
    """Background task runner for outbreak detection."""
    db = SessionLocal()
    try:
        outbreaks = detect_outbreaks(db)
        logger.info(f"Outbreak detection background job completed: {len(outbreaks)} active outbreaks.")
    except Exception as e:
        logger.error(f"Outbreak detection background job failed: {e}", exc_info=True)
    finally:
        db.close()
