"""
Admin Analytics Service.
Provides SQL aggregates, KPI computations, period comparisons, zero-filled daily charts,
grouped breakdowns, agronomist workload statistics, sensor findings, and CSV exports.
No LLM calls anywhere in this module.
"""

import io
import csv
import datetime
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from app.models.models import (
    Case,
    Review,
    Assignment,
    Message,
    OutcomeFeedback,
    User,
    Farm,
    WeatherAlert,
    SensorReport,
)
from app.services.case_state import CaseState
from app.sensors.interpret import interpret_sensor_data


# 60-second in-memory cache
_ANALYTICS_CACHE: Dict[str, Tuple[datetime.datetime, Dict[str, Any]]] = {}


def clear_analytics_cache() -> None:
    """Clears the in-memory analytics cache (useful in tests)."""
    global _ANALYTICS_CACHE
    _ANALYTICS_CACHE.clear()


def parse_and_validate_range(
    from_raw: Optional[str] = None,
    to_raw: Optional[str] = None,
) -> Tuple[datetime.datetime, datetime.datetime, datetime.datetime, datetime.datetime]:
    """
    Parses and validates from/to date range.
    Defaults to last 30 days if not provided.
    Enforces from < to and range <= 366 days.
    Returns: (from_dt, to_dt, prev_from_dt, prev_to_dt)
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    if to_raw:
        try:
            to_clean = to_raw.strip().replace("Z", "+00:00")
            to_dt = datetime.datetime.fromisoformat(to_clean)
        except Exception:
            raise ValueError("Invalid 'to' timestamp format. Expected ISO 8601.")
    else:
        to_dt = now

    if from_raw:
        try:
            from_clean = from_raw.strip().replace("Z", "+00:00")
            from_dt = datetime.datetime.fromisoformat(from_clean)
        except Exception:
            raise ValueError("Invalid 'from' timestamp format. Expected ISO 8601.")
    else:
        from_dt = to_dt - datetime.timedelta(days=30)

    # Standardize to timezone-naive UTC
    if from_dt.tzinfo is not None:
        from_dt = from_dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    if to_dt.tzinfo is not None:
        to_dt = to_dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)

    if from_dt >= to_dt:
        raise ValueError("'from' date must be strictly earlier than 'to' date.")

    duration_days = (to_dt - from_dt).total_seconds() / 86400.0
    if duration_days > 366.0:
        raise ValueError("Date range cannot exceed 366 days.")

    duration = to_dt - from_dt
    prev_to_dt = from_dt
    prev_from_dt = from_dt - duration

    return from_dt, to_dt, prev_from_dt, prev_to_dt


def get_admin_analytics_data(
    db: Session,
    from_dt: datetime.datetime,
    to_dt: datetime.datetime,
    prev_from_dt: datetime.datetime,
    prev_to_dt: datetime.datetime,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """
    Gathers all analytics SQL aggregates for the given range and previous period.
    """
    cache_key = f"{from_dt.isoformat()}_{to_dt.isoformat()}"
    now_utc = datetime.datetime.utcnow()

    if use_cache and cache_key in _ANALYTICS_CACHE:
        cached_time, cached_data = _ANALYTICS_CACHE[cache_key]
        if (now_utc - cached_time).total_seconds() < 60:
            return cached_data

    # 1. Total cases (all-time & prior)
    total_cases = db.query(func.count(Case.id)).scalar() or 0
    prev_total_cases = db.query(func.count(Case.id)).filter(Case.created_at < from_dt).scalar() or 0

    # 2. Cases in range & prior range
    cases_in_range = (
        db.query(func.count(Case.id))
        .filter(Case.created_at >= from_dt, Case.created_at <= to_dt)
        .scalar()
        or 0
    )
    prev_cases_in_range = (
        db.query(func.count(Case.id))
        .filter(Case.created_at >= prev_from_dt, Case.created_at < prev_to_dt)
        .scalar()
        or 0
    )

    # 3. Case stats (reassign, ai_degraded, assigned, decided, delivered)
    def query_case_metrics(start_d: datetime.datetime, end_d: datetime.datetime):
        row = (
            db.query(
                func.count(Case.id).label("total"),
                func.sum(case((Case.reassign_count > 0, 1), else_=0)).label("reassigned"),
                func.sum(case((Case.ai_degraded == True, 1), else_=0)).label("ai_degraded"),
                func.sum(case((Case.assigned_at.isnot(None), 1), else_=0)).label("assigned"),
                func.sum(
                    case(
                        (
                            Case.status.in_(
                                [
                                    CaseState.APPROVED,
                                    CaseState.APPROVED_WITH_EDITS,
                                    CaseState.REJECTED,
                                    CaseState.DELIVERED,
                                    CaseState.OUTCOME_REPORTED,
                                ]
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ).label("decided"),
                func.sum(
                    case(
                        (
                            Case.status.in_(
                                [CaseState.DELIVERED, CaseState.OUTCOME_REPORTED]
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ).label("delivered"),
            )
            .filter(Case.created_at >= start_d, Case.created_at <= end_d)
            .first()
        )
        total = row.total or 0 if row else 0
        reassigned = row.reassigned or 0 if row else 0
        ai_deg = row.ai_degraded or 0 if row else 0
        assigned = row.assigned or 0 if row else 0
        decided = row.decided or 0 if row else 0
        delivered = row.delivered or 0 if row else 0
        return {
            "total": total,
            "reassigned": reassigned,
            "ai_degraded": ai_deg,
            "assigned": assigned,
            "decided": decided,
            "delivered": delivered,
        }

    curr_case_stats = query_case_metrics(from_dt, to_dt)
    prev_case_stats = query_case_metrics(prev_from_dt, prev_to_dt)

    reassign_rate = (
        round(float(curr_case_stats["reassigned"]) / float(cases_in_range), 4)
        if cases_in_range > 0
        else None
    )
    prev_reassign_rate = (
        round(float(prev_case_stats["reassigned"]) / float(prev_cases_in_range), 4)
        if prev_cases_in_range > 0
        else None
    )

    ai_degraded_rate = (
        round(float(curr_case_stats["ai_degraded"]) / float(cases_in_range), 4)
        if cases_in_range > 0
        else None
    )
    prev_ai_degraded_rate = (
        round(float(prev_case_stats["ai_degraded"]) / float(prev_cases_in_range), 4)
        if prev_cases_in_range > 0
        else None
    )

    # Sensor report rate (share of cases in range with a sensor report)
    curr_sensor_cases = (
        db.query(func.count(func.distinct(SensorReport.case_id)))
        .join(Case, Case.id == SensorReport.case_id)
        .filter(Case.created_at >= from_dt, Case.created_at <= to_dt)
        .scalar()
        or 0
    )
    sensor_report_rate = (
        round(float(curr_sensor_cases) / float(cases_in_range), 4)
        if cases_in_range > 0
        else None
    )

    prev_sensor_cases = (
        db.query(func.count(func.distinct(SensorReport.case_id)))
        .join(Case, Case.id == SensorReport.case_id)
        .filter(Case.created_at >= prev_from_dt, Case.created_at < prev_to_dt)
        .scalar()
        or 0
    )
    prev_sensor_report_rate = (
        round(float(prev_sensor_cases) / float(prev_cases_in_range), 4)
        if prev_cases_in_range > 0
        else None
    )

    # 4. Turnaround: avg_hours_to_decision (assigned_at -> decision)
    def compute_turnaround(start_d: datetime.datetime, end_d: datetime.datetime):
        rows = (
            db.query(Review, Case.assigned_at)
            .join(Case, Case.id == Review.case_id)
            .filter(
                func.coalesce(Review.decided_at, Review.created_at) >= start_d,
                func.coalesce(Review.decided_at, Review.created_at) <= end_d,
                Case.assigned_at.isnot(None),
            )
            .all()
        )
        diffs = []
        buckets = {"lt_1h": 0, "1_4h": 0, "4_24h": 0, "gt_24h": 0}
        for r, assigned_at in rows:
            decided_time = r.decided_at or r.created_at
            if assigned_at and decided_time and decided_time >= assigned_at:
                hrs = (decided_time - assigned_at).total_seconds() / 3600.0
                diffs.append(hrs)
                if hrs < 1.0:
                    buckets["lt_1h"] += 1
                elif hrs < 4.0:
                    buckets["1_4h"] += 1
                elif hrs <= 24.0:
                    buckets["4_24h"] += 1
                else:
                    buckets["gt_24h"] += 1

        avg_hrs = round(sum(diffs) / len(diffs), 2) if diffs else None
        return avg_hrs, buckets

    avg_hours_to_decision, response_time_buckets = compute_turnaround(from_dt, to_dt)
    prev_avg_hours_to_decision, _ = compute_turnaround(prev_from_dt, prev_to_dt)

    # 5. Current snapshot KPIs (unassigned_now, pending_now)
    unassigned_now = (
        db.query(func.count(Case.id))
        .filter(
            Case.assigned_agronomist_id.is_(None),
            Case.status.in_(
                [
                    CaseState.DRAFT,
                    CaseState.ANALYZING,
                    CaseState.ANALYZED,
                    CaseState.PENDING_REVIEW,
                ]
            ),
        )
        .scalar()
        or 0
    )
    pending_now = (
        db.query(func.count(Case.id))
        .filter(Case.status == CaseState.PENDING_REVIEW)
        .scalar()
        or 0
    )

    # 6. Ratings & Outcome success rate
    def compute_rating_and_outcome(start_d: datetime.datetime, end_d: datetime.datetime):
        rating_row = (
            db.query(
                func.count(OutcomeFeedback.id).label("count"),
                func.avg(OutcomeFeedback.rating).label("avg_rating"),
            )
            .filter(
                OutcomeFeedback.created_at >= start_d,
                OutcomeFeedback.created_at <= end_d,
            )
            .first()
        )
        avg_r = (
            round(float(rating_row.avg_rating), 2)
            if rating_row and rating_row.avg_rating is not None
            else None
        )

        outcome_row = (
            db.query(
                func.count(OutcomeFeedback.id).label("total"),
                func.sum(
                    case((func.lower(OutcomeFeedback.outcome) == "improved", 1), else_=0)
                ).label("improved"),
            )
            .filter(
                OutcomeFeedback.created_at >= start_d,
                OutcomeFeedback.created_at <= end_d,
                OutcomeFeedback.outcome.isnot(None),
            )
            .first()
        )
        tot_outcomes = outcome_row.total or 0 if outcome_row else 0
        imp_outcomes = outcome_row.improved or 0 if outcome_row else 0
        succ_rate = (
            round(float(imp_outcomes) / float(tot_outcomes), 4)
            if tot_outcomes > 0
            else None
        )
        return avg_r, succ_rate

    avg_rating, outcome_success_rate = compute_rating_and_outcome(from_dt, to_dt)
    prev_avg_rating, prev_outcome_success_rate = compute_rating_and_outcome(
        prev_from_dt, prev_to_dt
    )

    # 7. Cases per day (zero-filled)
    created_per_day_rows = (
        db.query(func.date(Case.created_at).label("d"), func.count(Case.id).label("cnt"))
        .filter(Case.created_at >= from_dt, Case.created_at <= to_dt)
        .group_by(func.date(Case.created_at))
        .all()
    )
    created_map = {str(r.d): r.cnt for r in created_per_day_rows}

    decided_per_day_rows = (
        db.query(
            func.date(func.coalesce(Review.decided_at, Review.created_at)).label("d"),
            func.count(Review.id).label("cnt"),
        )
        .filter(
            func.coalesce(Review.decided_at, Review.created_at) >= from_dt,
            func.coalesce(Review.decided_at, Review.created_at) <= to_dt,
        )
        .group_by(func.date(func.coalesce(Review.decided_at, Review.created_at)))
        .all()
    )
    decided_map = {str(r.d): r.cnt for r in decided_per_day_rows}

    cases_per_day: List[Dict[str, Any]] = []
    curr_date = from_dt.date()
    end_date = to_dt.date()
    while curr_date <= end_date:
        d_str = curr_date.isoformat()
        cases_per_day.append({
            "date": d_str,
            "created": created_map.get(d_str, 0),
            "decided": decided_map.get(d_str, 0),
        })
        curr_date += datetime.timedelta(days=1)

    # 8. By crop & by issue category
    by_crop_rows = (
        db.query(Case.crop, func.count(Case.id).label("cnt"))
        .filter(Case.created_at >= from_dt, Case.created_at <= to_dt)
        .group_by(Case.crop)
        .order_by(func.count(Case.id).desc())
        .all()
    )
    by_crop = [{"crop": r[0] or "Unknown", "count": r[1]} for r in by_crop_rows]

    by_issue_rows = (
        db.query(
            func.coalesce(Case.issue_category, "uncategorized").label("cat"),
            func.count(Case.id).label("cnt"),
        )
        .filter(Case.created_at >= from_dt, Case.created_at <= to_dt)
        .group_by(func.coalesce(Case.issue_category, "uncategorized"))
        .order_by(func.count(Case.id).desc())
        .all()
    )
    by_issue_category = [{"category": r[0], "count": r[1]} for r in by_issue_rows]

    # 9. Status funnel (submitted -> assigned -> decided -> delivered -> outcome reported)
    outcome_reported_cases = (
        db.query(func.count(func.distinct(OutcomeFeedback.case_id)))
        .join(Case, Case.id == OutcomeFeedback.case_id)
        .filter(
            Case.created_at >= from_dt,
            Case.created_at <= to_dt,
            OutcomeFeedback.outcome.isnot(None),
        )
        .scalar()
        or 0
    )

    stage_submitted = curr_case_stats["total"]
    stage_assigned = curr_case_stats["assigned"]
    stage_decided = curr_case_stats["decided"]
    stage_delivered = curr_case_stats["delivered"]
    stage_outcome = outcome_reported_cases

    def drop_off(prev: int, curr: int) -> float:
        if prev <= 0:
            return 0.0
        return round(max(0.0, (1.0 - (float(curr) / float(prev))) * 100.0), 1)

    status_funnel = [
        {"stage": "submitted", "label_key": "analytics.funnel.submitted", "count": stage_submitted, "drop_off_pct": 0.0},
        {"stage": "assigned", "label_key": "analytics.funnel.assigned", "count": stage_assigned, "drop_off_pct": drop_off(stage_submitted, stage_assigned)},
        {"stage": "decided", "label_key": "analytics.funnel.decided", "count": stage_decided, "drop_off_pct": drop_off(stage_assigned, stage_decided)},
        {"stage": "delivered", "label_key": "analytics.funnel.delivered", "count": stage_delivered, "drop_off_pct": drop_off(stage_decided, stage_delivered)},
        {"stage": "outcome_reported", "label_key": "analytics.funnel.outcome_reported", "count": stage_outcome, "drop_off_pct": drop_off(stage_delivered, stage_outcome)},
    ]

    # 10. Decision mix & AI agreement rate
    review_status_rows = (
        db.query(
            func.upper(func.coalesce(Review.decision, Review.status)).label("st"),
            func.count(Review.id).label("cnt"),
        )
        .filter(
            func.coalesce(Review.decided_at, Review.created_at) >= from_dt,
            func.coalesce(Review.decided_at, Review.created_at) <= to_dt,
        )
        .group_by(func.upper(func.coalesce(Review.decision, Review.status)))
        .all()
    )
    mix_map = {r.st: r.cnt for r in review_status_rows}
    approve_cnt = mix_map.get("APPROVED", 0) + mix_map.get("APPROVE", 0)
    approve_edits_cnt = mix_map.get("APPROVED_WITH_EDITS", 0) + mix_map.get("APPROVE_WITH_EDITS", 0)
    reject_cnt = mix_map.get("REJECTED", 0) + mix_map.get("REJECT", 0)
    total_decisions = approve_cnt + approve_edits_cnt + reject_cnt

    ai_agreement_rate = (
        round(float(approve_cnt) / float(total_decisions), 4)
        if total_decisions > 0
        else None
    )
    decision_mix = {
        "approve": approve_cnt,
        "approve_with_edits": approve_edits_cnt,
        "reject": reject_cnt,
    }

    # 11. Agent stats
    agronomists = db.query(User).filter(User.role == "agronomist").all()
    agent_stats: List[Dict[str, Any]] = []

    # Pre-aggregate open cases in PENDING_REVIEW
    open_cases_by_agro = dict(
        db.query(Case.assigned_agronomist_id, func.count(Case.id))
        .filter(Case.status == CaseState.PENDING_REVIEW, Case.assigned_agronomist_id.isnot(None))
        .group_by(Case.assigned_agronomist_id)
        .all()
    )

    # Pre-aggregate timeout assignments from agronomist in range
    timeouts_by_agro = dict(
        db.query(Assignment.from_user_id, func.count(Assignment.id))
        .filter(
            Assignment.reason == "timeout",
            Assignment.created_at >= from_dt,
            Assignment.created_at <= to_dt,
        )
        .group_by(Assignment.from_user_id)
        .all()
    )

    # Reviews and ratings by agronomist in range
    reviews_by_agro_rows = (
        db.query(Review, Case.assigned_at)
        .join(Case, Case.id == Review.case_id)
        .filter(
            func.coalesce(Review.decided_at, Review.created_at) >= from_dt,
            func.coalesce(Review.decided_at, Review.created_at) <= to_dt,
        )
        .all()
    )
    agro_review_turnarounds: Dict[int, List[float]] = {}
    agro_review_counts: Dict[int, int] = {}
    for r, ass_time in reviews_by_agro_rows:
        aid = r.reviewer_id
        agro_review_counts[aid] = agro_review_counts.get(aid, 0) + 1
        dec_time = r.decided_at or r.created_at
        if ass_time and dec_time and dec_time >= ass_time:
            diff_h = (dec_time - ass_time).total_seconds() / 3600.0
            agro_review_turnarounds.setdefault(aid, []).append(diff_h)

    # Feedback ratings by agronomist
    ratings_by_agro_rows = (
        db.query(
            OutcomeFeedback.agronomist_id,
            func.avg(OutcomeFeedback.rating).label("avg_rating"),
        )
        .filter(
            OutcomeFeedback.created_at >= from_dt,
            OutcomeFeedback.created_at <= to_dt,
            OutcomeFeedback.agronomist_id.isnot(None),
        )
        .group_by(OutcomeFeedback.agronomist_id)
        .all()
    )
    agro_ratings = {r[0]: round(float(r[1]), 2) for r in ratings_by_agro_rows}

    for agro in agronomists:
        diff_list = agro_review_turnarounds.get(agro.id, [])
        avg_turnaround = round(sum(diff_list) / len(diff_list), 2) if diff_list else None
        agent_stats.append({
            "agronomist_id": agro.id,
            "agronomist": agro.full_name or agro.username,
            "open": open_cases_by_agro.get(agro.id, 0),
            "reviewed": agro_review_counts.get(agro.id, 0),
            "avg_hours_to_decision": avg_turnaround,
            "avg_rating": agro_ratings.get(agro.id),
            "timeout_count": timeouts_by_agro.get(agro.id, 0),
            "available": bool(agro.available),
        })

    # Sort agronomists by reviewed count desc
    agent_stats.sort(key=lambda x: x["reviewed"], reverse=True)

    # 12. Language mix
    farmer_lang_rows = (
        db.query(User.language, func.count(User.id))
        .filter(User.role == "farmer")
        .group_by(User.language)
        .all()
    )
    farmer_languages = [{"language": r[0] or "en", "count": r[1]} for r in farmer_lang_rows]

    msg_lang_rows = (
        db.query(Message.original_lang, func.count(Message.id))
        .filter(Message.created_at >= from_dt, Message.created_at <= to_dt)
        .group_by(Message.original_lang)
        .all()
    )
    message_languages = [{"language": r[0] or "en", "count": r[1]} for r in msg_lang_rows]

    # 13. Rating distribution (1 to 5)
    rating_dist_rows = (
        db.query(OutcomeFeedback.rating, func.count(OutcomeFeedback.id))
        .filter(
            OutcomeFeedback.created_at >= from_dt,
            OutcomeFeedback.created_at <= to_dt,
        )
        .group_by(OutcomeFeedback.rating)
        .all()
    )
    rating_dist_map = {r[0]: r[1] for r in rating_dist_rows}
    rating_distribution = [
        {"rating": star, "count": rating_dist_map.get(star, 0)} for star in range(1, 6)
    ]

    # 14. Top farms by cases (limit 10)
    top_farm_rows = (
        db.query(Farm.id, Farm.name, func.count(Case.id).label("cnt"))
        .join(Case, Case.farm_id == Farm.id)
        .filter(Case.created_at >= from_dt, Case.created_at <= to_dt)
        .group_by(Farm.id, Farm.name)
        .order_by(func.count(Case.id).desc())
        .limit(10)
        .all()
    )
    top_farms_by_cases = [
        {"farm_id": r[0], "farm_name": r[1], "count": r[2]} for r in top_farm_rows
    ]

    # 15. Sensor findings & alerts by rule
    sensor_cases = (
        db.query(Case.sensor_summary, Case.crop)
        .filter(
            Case.created_at >= from_dt,
            Case.created_at <= to_dt,
            Case.sensor_summary.isnot(None),
        )
        .all()
    )

    finding_counts = {
        "low_nitrogen": 0,
        "dry_soil": 0,
        "fungal_pressure": 0,
        "heat_stress": 0,
        "high_leaf_wetness": 0,
    }

    for s_summary, crop_name in sensor_cases:
        if not s_summary or not isinstance(s_summary, dict):
            continue
        try:
            interp = interpret_sensor_data(s_summary, crop=crop_name or "default")
            keys_present = {item["key"]: item for item in interp}

            if "nitrogen" in keys_present and keys_present["nitrogen"].get("status") in ("low", "severely_low"):
                finding_counts["low_nitrogen"] += 1
            if "dry_soil" in keys_present and keys_present["dry_soil"].get("status") == "active":
                finding_counts["dry_soil"] += 1
            elif "soil_moisture" in keys_present and keys_present["soil_moisture"].get("status") in ("low", "severely_low"):
                finding_counts["dry_soil"] += 1

            if "fungal_pressure" in keys_present and keys_present["fungal_pressure"].get("status") in ("watch", "high"):
                finding_counts["fungal_pressure"] += 1
            if "heat_stress" in keys_present and keys_present["heat_stress"].get("status") in ("active", "high"):
                finding_counts["heat_stress"] += 1

            # High leaf wetness
            lw_hours = s_summary.get("hours_leaf_wetness_ge_70") or s_summary.get("hours_leaf_wetness_ge_70_24h") or 0.0
            latest_lw = (s_summary.get("latest") or {}).get("leaf_wetness_pct") or 0.0
            if float(lw_hours) >= 6.0 or float(latest_lw) >= 70.0:
                finding_counts["high_leaf_wetness"] += 1
        except Exception:
            continue

    sensor_findings = [
        {"key": "low_nitrogen", "label_key": "analytics.sensor.low_nitrogen", "count": finding_counts["low_nitrogen"]},
        {"key": "dry_soil", "label_key": "analytics.sensor.dry_soil", "count": finding_counts["dry_soil"]},
        {"key": "fungal_pressure", "label_key": "analytics.sensor.fungal_pressure", "count": finding_counts["fungal_pressure"]},
        {"key": "heat_stress", "label_key": "analytics.sensor.heat_stress", "count": finding_counts["heat_stress"]},
        {"key": "high_leaf_wetness", "label_key": "analytics.sensor.high_leaf_wetness", "count": finding_counts["high_leaf_wetness"]},
    ]

    alert_rows = (
        db.query(WeatherAlert.rule, func.count(WeatherAlert.id))
        .filter(WeatherAlert.created_at >= from_dt, WeatherAlert.created_at <= to_dt)
        .group_by(WeatherAlert.rule)
        .order_by(func.count(WeatherAlert.id).desc())
        .all()
    )
    alerts_by_rule = [{"rule": r[0], "count": r[1]} for r in alert_rows]

    # Assemble KPIs dictionary with current and previous period values
    kpis = {
        "total_cases": {
            "value": total_cases,
            "previous_value": prev_total_cases,
        },
        "cases_in_range": {
            "value": cases_in_range,
            "previous_value": prev_cases_in_range,
        },
        "avg_hours_to_decision": {
            "value": avg_hours_to_decision,
            "previous_value": prev_avg_hours_to_decision,
        },
        "unassigned_now": {
            "value": unassigned_now,
            "previous_value": unassigned_now,  # snapshot
        },
        "pending_now": {
            "value": pending_now,
            "previous_value": pending_now,  # snapshot
        },
        "avg_rating": {
            "value": avg_rating,
            "previous_value": prev_avg_rating,
        },
        "reassign_rate": {
            "value": reassign_rate,
            "previous_value": prev_reassign_rate,
        },
        "ai_degraded_rate": {
            "value": ai_degraded_rate,
            "previous_value": prev_ai_degraded_rate,
        },
        "sensor_report_rate": {
            "value": sensor_report_rate,
            "previous_value": prev_sensor_report_rate,
        },
        "outcome_success_rate": {
            "value": outcome_success_rate,
            "previous_value": prev_outcome_success_rate,
        },
    }

    result = {
        "from": from_dt.isoformat() + "Z",
        "to": to_dt.isoformat() + "Z",
        "previous_from": prev_from_dt.isoformat() + "Z",
        "previous_to": prev_to_dt.isoformat() + "Z",
        "kpis": kpis,
        "cases_per_day": cases_per_day,
        "by_crop": by_crop,
        "by_issue_category": by_issue_category,
        "status_funnel": status_funnel,
        "decision_mix": decision_mix,
        "ai_agreement_rate": ai_agreement_rate,
        "agent_stats": agent_stats,
        "language_mix": {
            "farmers": farmer_languages,
            "messages": message_languages,
        },
        "rating_distribution": rating_distribution,
        "top_farms_by_cases": top_farms_by_cases,
        "response_time_buckets": response_time_buckets,
        "sensor_findings": sensor_findings,
        "alerts_by_rule": alerts_by_rule,
    }

    # Store in 60s cache
    _ANALYTICS_CACHE[cache_key] = (now_utc, result)

    return result


def sanitize_csv_val(val: Any) -> str:
    """
    Sanitizes values to prevent CSV formula injection:
    Prefixes cell values starting with =, +, -, @ with an apostrophe.
    """
    if val is None:
        return ""
    s = str(val)
    if s and s[0] in ("=", "+", "-", "@"):
        return "'" + s
    return s


def export_analytics_csv(
    data: Dict[str, Any],
    section: str,
) -> str:
    """
    Generates CSV string with UTF-8 BOM (\ufeff) and formula injection protection.
    """
    out = io.StringIO()
    # Write BOM
    out.write("\ufeff")
    writer = csv.writer(out)

    sec = (section or "").lower().strip()

    if sec == "kpis":
        writer.writerow(["KPI", "Current Value", "Previous Period Value", "Unit / Format"])
        kpis = data.get("kpis", {})
        for kpi_name, vals in kpis.items():
            curr_v = vals.get("value")
            prev_v = vals.get("previous_value")
            unit = "rate (0-1)" if "rate" in kpi_name else ("hours" if "hours" in kpi_name else "count")
            writer.writerow([
                sanitize_csv_val(kpi_name),
                sanitize_csv_val(curr_v if curr_v is not None else "-"),
                sanitize_csv_val(prev_v if prev_v is not None else "-"),
                sanitize_csv_val(unit),
            ])

    elif sec == "cases":
        writer.writerow(["Date", "Cases Created", "Cases Decided"])
        for day in data.get("cases_per_day", []):
            writer.writerow([
                sanitize_csv_val(day.get("date")),
                sanitize_csv_val(day.get("created")),
                sanitize_csv_val(day.get("decided")),
            ])

    elif sec == "agents":
        writer.writerow([
            "Agronomist ID",
            "Agronomist Name",
            "Open Cases",
            "Reviewed Cases",
            "Avg Turnaround (hours)",
            "Avg Rating",
            "Timeout Count",
            "Available",
        ])
        for ag in data.get("agent_stats", []):
            writer.writerow([
                sanitize_csv_val(ag.get("agronomist_id")),
                sanitize_csv_val(ag.get("agronomist")),
                sanitize_csv_val(ag.get("open")),
                sanitize_csv_val(ag.get("reviewed")),
                sanitize_csv_val(ag.get("avg_hours_to_decision") if ag.get("avg_hours_to_decision") is not None else "-"),
                sanitize_csv_val(ag.get("avg_rating") if ag.get("avg_rating") is not None else "-"),
                sanitize_csv_val(ag.get("timeout_count")),
                sanitize_csv_val("Yes" if ag.get("available") else "No"),
            ])

    elif sec == "sensors":
        writer.writerow(["Type", "Key / Rule", "Count"])
        for sf in data.get("sensor_findings", []):
            writer.writerow([
                sanitize_csv_val("Sensor Finding"),
                sanitize_csv_val(sf.get("key")),
                sanitize_csv_val(sf.get("count")),
            ])
        for al in data.get("alerts_by_rule", []):
            writer.writerow([
                sanitize_csv_val("Weather Alert"),
                sanitize_csv_val(al.get("rule")),
                sanitize_csv_val(al.get("count")),
            ])

    else:
        raise ValueError(f"Unknown export section '{section}'. Expected one of: kpis, cases, agents, sensors")

    return out.getvalue()
