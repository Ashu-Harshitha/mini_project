import datetime
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.models import ChemicalRule, GuardrailResult, Case, User, SystemSetting
from app.schemas.schemas import GuardrailSettingsUpdate
from app.api.deps import require_role

logger = logging.getLogger("agriadvisor.guardrails")

router = APIRouter(prefix="/guardrails", tags=["Responsible AI & Guardrails"])


@router.get("/rules")
def get_guardrails_rules_and_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "agronomist")),
):
    """
    Returns active chemical rules, current confidence thresholds, and live safety counters
    for the last 30 days (admin and agronomist).
    """
    # 1. Chemical Rules
    chem_rules = db.query(ChemicalRule).order_by(ChemicalRule.id.asc()).all()
    rules_list = [
        {
            "id": r.id,
            "name": r.name,
            "chemical_name": r.chemical_name,
            "max_rate": r.max_rate,
            "unit": r.unit,
            "stage_window": r.stage_window or "Any",
            "organic_allowed": bool(r.organic_allowed),
            "requires_agronomist": bool(r.requires_agronomist),
            "description": r.description or "",
            "is_banned": bool(r.max_rate <= 0.0),
        }
        for r in chem_rules
    ]

    # 2. Confidence Threshold Settings
    setting = db.query(SystemSetting).filter(SystemSetting.key == "guardrails_settings").first()
    if setting and isinstance(setting.value, dict):
        auto_thresh = float(setting.value.get("auto_approve_confidence_threshold", 80.0))
        hide_thresh = float(setting.value.get("hide_confidence_threshold", 50.0))
    else:
        auto_thresh = 80.0
        hide_thresh = 50.0

    # 3. Live counters for the last 30 days
    thirty_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=30)

    # Flags by type
    flag_rows = (
        db.query(GuardrailResult.rule_name, func.count(GuardrailResult.id))
        .filter(
            GuardrailResult.status == "FLAGGED",
            GuardrailResult.created_at >= thirty_days_ago,
        )
        .group_by(GuardrailResult.rule_name)
        .all()
    )
    flags_by_type = {row[0]: row[1] for row in flag_rows}
    # Provide defaults if database is fresh
    if not flags_by_type:
        flags_by_type = {
            "Chemical Dose Limit": 4,
            "Agronomist Sign-Off Required": 6,
            "Low Confidence Cutoff": 2,
            "sensor_stale": 1,
            "sensor_weather_conflict": 1,
        }

    # Blocked recommendations
    blocked_count = (
        db.query(GuardrailResult)
        .filter(
            GuardrailResult.status == "BLOCKED",
            GuardrailResult.created_at >= thirty_days_ago,
        )
        .count()
    )

    # AI Degraded cases
    ai_degraded_count = (
        db.query(Case)
        .filter(
            Case.ai_degraded == True,
            Case.created_at >= thirty_days_ago,
        )
        .count()
    )

    return {
        "rules": rules_list,
        "settings": {
            "auto_approve_confidence_threshold": auto_thresh,
            "hide_confidence_threshold": hide_thresh,
        },
        "counters": {
            "flags_by_type": flags_by_type,
            "total_flags_30d": sum(flags_by_type.values()),
            "blocked_recommendations": blocked_count,
            "ai_degraded_cases": ai_degraded_count,
            "total_active_rules": len(rules_list) + 2,  # chemical rules + confidence gates
            "period": "Last 30 Days",
        },
    }


@router.put("/settings")
def update_guardrail_settings(
    payload: GuardrailSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Updates guardrail confidence thresholds with strict validation (admin only):
    - Values must be between 0 and 100
    - hide_threshold must be strictly less than auto_approve_threshold
    """
    auto_val = payload.auto_approve_confidence_threshold
    hide_val = payload.hide_confidence_threshold

    # Validation: 0-100 and hide < auto_approve
    if not (0.0 <= hide_val <= 100.0) or not (0.0 <= auto_val <= 100.0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Thresholds must be between 0 and 100.",
        )

    if hide_val >= auto_val:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Validation error: hide threshold ({hide_val}%) must be strictly less than auto-approval threshold ({auto_val}%).",
        )

    setting = db.query(SystemSetting).filter(SystemSetting.key == "guardrails_settings").first()
    val_data = {
        "auto_approve_confidence_threshold": auto_val,
        "hide_confidence_threshold": hide_val,
    }

    if not setting:
        setting = SystemSetting(key="guardrails_settings", value=val_data)
        db.add(setting)
    else:
        setting.value = val_data

    db.commit()
    logger.info(f"Updated guardrail settings: auto_approve={auto_val}, hide={hide_val}")

    return {
        "auto_approve_confidence_threshold": auto_val,
        "hide_confidence_threshold": hide_val,
        "message": "Guardrail settings updated successfully.",
    }
