import os
import yaml
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.models import User, EvalRun, LLMCall, SystemSetting
from app.api.deps import require_role, get_current_user
from app.core.config import settings

logger = logging.getLogger("agriadvisor.models")

router = APIRouter(prefix="/models", tags=["Model Comparison"], dependencies=[Depends(get_current_user)])


class ActiveModelUpdate(BaseModel):
    model: str


def find_model_catalog_path() -> Path:
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "data" / "model_catalog.yaml",
        Path("backend/data/model_catalog.yaml").resolve(),
        Path("data/model_catalog.yaml").resolve(),
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[0]


def load_model_catalog() -> Dict[str, Any]:
    cat_path = find_model_catalog_path()
    if not cat_path.exists():
        logger.warning(f"Model catalog not found at {cat_path}. Using internal fallback.")
        return {
            "weights": {
                "image_accuracy": 0.25,
                "groundedness": 0.20,
                "uncertainty_calibration": 0.15,
                "safety_score": 0.20,
                "farmer_clarity": 0.10,
                "environmental_awareness": 0.10,
            },
            "models": [
                {
                    "id": "gemini-2.5-flash-lite",
                    "name": "Gemini 2.5 Flash Lite",
                    "model_key": "gemini-2.5-flash-lite",
                    "provider": "Google",
                    "is_live": True,
                    "benchmark_only": False,
                    "is_reference": False,
                    "cost_input_per_m": 0.0,
                    "cost_output_per_m": 0.0,
                    "free_tier": True,
                    "latency_ms": 450,
                    "metrics": {
                        "image_accuracy": 84.0,
                        "groundedness": 86.0,
                        "uncertainty_calibration": 88.0,
                        "safety_score": 96.0,
                        "farmer_clarity": 85.0,
                        "environmental_awareness": 78.0,
                    },
                },
                {
                    "id": "gemini-2.5-flash",
                    "name": "Gemini 2.5 Flash",
                    "model_key": "gemini-2.5-flash",
                    "provider": "Google",
                    "is_live": True,
                    "benchmark_only": False,
                    "is_reference": False,
                    "cost_input_per_m": 0.0,
                    "cost_output_per_m": 0.0,
                    "free_tier": True,
                    "latency_ms": 620,
                    "metrics": {
                        "image_accuracy": 89.0,
                        "groundedness": 90.0,
                        "uncertainty_calibration": 91.0,
                        "safety_score": 98.0,
                        "farmer_clarity": 88.0,
                        "environmental_awareness": 82.0,
                    },
                },
            ],
        }
    with open(cat_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def compute_agriadvisor_score(metrics: Dict[str, float], weights: Dict[str, float]) -> float:
    total_score = 0.0
    for dim, weight in weights.items():
        val = float(metrics.get(dim, 80.0))
        total_score += weight * val
    return round(total_score, 1)


@router.get("/comparison")
def get_model_comparison(db: Session = Depends(get_db)):
    """
    Combines the model catalog with measured latency and eval metrics per model.
    The AgriAdvisor score is a weighted sum of metrics (weights in YAML).
    Top Pick badge follows the highest score.
    """
    catalog = load_model_catalog()
    weights = catalog.get("weights", {
        "image_accuracy": 0.25,
        "groundedness": 0.20,
        "uncertainty_calibration": 0.15,
        "safety_score": 0.20,
        "farmer_clarity": 0.10,
        "environmental_awareness": 0.10,
    })

    # Fetch measured metrics from latest eval_runs per model
    runs = (
        db.query(EvalRun)
        .filter(EvalRun.status == "completed")
        .order_by(EvalRun.id.desc())
        .all()
    )
    latest_run_by_model: Dict[str, EvalRun] = {}
    for r in runs:
        m_key = r.model.lower().strip()
        if m_key not in latest_run_by_model:
            latest_run_by_model[m_key] = r

    # Fetch active model setting
    active_setting = db.query(SystemSetting).filter(SystemSetting.key == "active_model").first()
    active_model_name = "gemini-2.5-flash-lite"
    if active_setting and isinstance(active_setting.value, dict):
        active_model_name = active_setting.value.get("model", active_model_name)
    elif active_setting and isinstance(active_setting.value, str):
        active_model_name = active_setting.value

    models_out = []
    for m in catalog.get("models", []):
        m_key = m.get("model_key", m.get("id", "")).lower().strip()
        metrics = dict(m.get("metrics", {}))
        latency = m.get("latency_ms", 500)

        # Merge with live measured metrics if this is a live model and has eval runs
        if m.get("is_live") and m_key in latest_run_by_model:
            live_run = latest_run_by_model[m_key]
            if live_run.metrics:
                for k, v in live_run.metrics.items():
                    if k in metrics:
                        metrics[k] = float(v)
                if live_run.metrics.get("avg_latency_ms"):
                    latency = int(live_run.metrics["avg_latency_ms"])

        score = compute_agriadvisor_score(metrics, weights)

        models_out.append({
            "id": m.get("id"),
            "name": m.get("name"),
            "model_key": m.get("model_key"),
            "provider": m.get("provider"),
            "is_live": bool(m.get("is_live")),
            "benchmark_only": bool(m.get("benchmark_only")),
            "is_reference": bool(m.get("is_reference")),
            "cost_input_per_m": float(m.get("cost_input_per_m", 0.0)),
            "cost_output_per_m": float(m.get("cost_output_per_m", 0.0)),
            "free_tier": bool(m.get("free_tier")),
            "context_window": m.get("context_window", "1M tokens"),
            "latency_ms": latency,
            "metrics": metrics,
            "agriAdvisorScore": score,
            "source_note": m.get("source_note"),
            "is_active": (m_key == active_model_name.lower().strip() or m.get("name", "").lower() == active_model_name.lower()),
        })

    # Determine highest AgriAdvisor score
    max_score = max((m["agriAdvisorScore"] for m in models_out), default=0.0)
    for m in models_out:
        m["is_top_pick"] = (m["agriAdvisorScore"] == max_score and max_score > 0)

    return {
        "weights": weights,
        "models": models_out,
        "active_model": active_model_name,
        "highest_score": max_score,
    }


@router.get("/live")
def get_live_models(db: Session = Depends(get_db)):
    """Returns only live models available for selection in top-bar."""
    comparison = get_model_comparison(db)
    live = [m for m in comparison["models"] if m["is_live"]]
    return {
        "live_models": live,
        "active_model": comparison["active_model"],
    }


@router.get("/active")
def get_active_model(db: Session = Depends(get_db)):
    """Returns the currently active model."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == "active_model").first()
    if setting and isinstance(setting.value, dict):
        return {"active_model": setting.value.get("model", "gemini-2.5-flash-lite")}
    return {"active_model": settings.GEMINI_MODEL or "gemini-2.5-flash-lite"}


@router.put("/active")
def set_active_model(
    payload: ActiveModelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Stores the active model selection in system_settings row (admin only).
    Used by Gemini client without restarting.
    """
    catalog = load_model_catalog()
    valid_keys = {
        m.get("model_key", m.get("id")).lower()
        for m in catalog.get("models", [])
        if m.get("is_live")
    }
    # Also allow standard model name forms
    valid_names = {
        m.get("name", "").lower()
        for m in catalog.get("models", [])
        if m.get("is_live")
    }
    input_norm = payload.model.lower().strip()

    if input_norm not in valid_keys and input_norm not in valid_names:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Model '{payload.model}' is not a valid live model. Available: {list(valid_keys)}",
        )

    # Standardize to key
    selected_key = payload.model
    for m in catalog.get("models", []):
        if m.get("name", "").lower() == input_norm:
            selected_key = m.get("model_key", payload.model)
            break

    setting = db.query(SystemSetting).filter(SystemSetting.key == "active_model").first()
    if not setting:
        setting = SystemSetting(key="active_model", value={"model": selected_key})
        db.add(setting)
    else:
        setting.value = {"model": selected_key}

    db.commit()
    logger.info(f"Updated active model in system_settings to '{selected_key}'")

    return {
        "active_model": selected_key,
        "message": f"Active model set to '{selected_key}'. Instant live switch without restart.",
    }


@router.get("")
def list_models_flat(db: Session = Depends(get_db)):
    """Flat list endpoint for frontend backwards compatibility."""
    comp = get_model_comparison(db)
    return comp["models"]


@router.get("/{model_id}")
def get_model_by_id(model_id: str, db: Session = Depends(get_db)):
    comp = get_model_comparison(db)
    for m in comp["models"]:
        if m["id"] == model_id or m.get("model_key") == model_id:
            return m
    raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found.")
