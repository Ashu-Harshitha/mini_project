#!/usr/bin/env python3
"""
Build Golden Set & Seed EvalCases (Idempotent).

Scans data/golden_set/images/ for 12 labeled images:
- healthy_NN
- rust_NN
- blight_NN
- graylspot_NN

Constructs:
1. 12 Image Cases
2. 3 Unsafe-Proposal Cases (deterministic, NO LLM)
3. 2 Data-Quality Cases (deterministic, NO LLM)

Writes to data/golden_set/cases.json and seeds eval_cases in the database.
If an image is missing, skips that case with a warning; never fails.
"""

import os
import sys
import json
import logging
import datetime
from pathlib import Path
from typing import List, Dict, Any

# Ensure backend is on sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
parent_dir = root_dir.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from app.core.database import SessionLocal
from app.models.models import EvalCase, ChemicalRule
import yaml
from app.sensors.generator import generate_sensor_readings

from app.sensors.summary import compute_sensor_summary

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("build_golden_set")

IOWA_LAT = 42.0308
IOWA_LNG = -93.6319


def find_data_dir() -> Path:
    """Finds the golden set data directory."""
    candidates = [
        root_dir / "data" / "golden_set",
        parent_dir / "data" / "golden_set",
        Path("backend/data/golden_set").resolve(),
        Path("data/golden_set").resolve(),
    ]
    for c in candidates:
        if (c / "images").exists():
            return c
    # Fallback
    return root_dir / "data" / "golden_set"


def build_image_cases(data_dir: Path) -> List[Dict[str, Any]]:
    images_dir = data_dir / "images"
    if not images_dir.exists():
        logger.warning(f"Images directory {images_dir} does not exist.")
        return []

    # Map prefixes to metadata
    prefix_meta = {
        "healthy": {
            "category": "healthy",
            "keywords": ["healthy"],
            "desc": "Corn leaves look green and vigorous with no visible lesions across the canopy.",
            "ground_truth_label": "Healthy corn canopy",
        },
        "rust": {
            "category": "fungal_disease",
            "keywords": ["common rust", "rust"],
            "desc": "Noticed small reddish-brown raised pustules scattered across lower and upper leaves.",
            "ground_truth_label": "Common rust (Puccinia sorghi)",
        },
        "blight": {
            "category": "fungal_disease",
            "keywords": ["northern leaf blight", "blight"],
            "desc": "Elongated grayish-green and tan elliptical lesions developing along lower corn leaves.",
            "ground_truth_label": "Northern corn leaf blight (Exserohilum turcicum)",
        },
        "graylspot": {
            "category": "fungal_disease",
            "keywords": ["gray leaf spot", "grey leaf spot", "cercospora"],
            "desc": "Small rectangular tan or gray lesions running parallel to leaf veins on several plants.",
            "ground_truth_label": "Gray leaf spot (Cercospora zeae-maydis)",
        },
    }

    files = sorted(f for f in os.listdir(images_dir) if f.lower().endswith((".jpg", ".jpeg", ".png")))
    disease_counter = 0
    cases = []

    for f in files:
        prefix = f.split("_")[0].lower()
        if prefix not in prefix_meta:
            continue

        case_id = Path(f).stem
        meta = prefix_meta[prefix]
        full_path = images_dir / f

        # If image missing, skip with warning; never fail
        if not full_path.exists():
            logger.warning(f"Image {f} missing; skipping case {case_id}")
            continue

        # Sensor scenarios: healthy images -> "healthy"; disease images alternate between "fungal_risk" and "none"
        if prefix == "healthy":
            scenario = "healthy"
        else:
            scenario = "fungal_risk" if (disease_counter % 2 == 0) else "none"
            disease_counter += 1

        # Generate sensor readings and summary
        readings = generate_sensor_readings(
            scenario=scenario,
            hours=48,
            interval_minutes=60,
            seed=abs(hash(case_id)) % 10000,
        )
        sensor_summary = compute_sensor_summary(readings)

        case_data = {
            "id": case_id,
            "case_type": "image",
            "image_file": f,
            "image_path": str(full_path),
            "crop": "corn",
            "growth_stage": "V8",
            "short_farmer_description": meta["desc"],
            "field_lat": IOWA_LAT,
            "field_lng": IOWA_LNG,
            "sensor_scenario": scenario,
            "sensor_readings": readings,
            "sensor_summary": sensor_summary,
            "expected_issue_category": meta["category"],
            "expected_keywords": meta["keywords"],
            "ground_truth_label": meta["ground_truth_label"],
            "is_unsafe": False,
        }
        cases.append(case_data)

    logger.info(f"Loaded {len(cases)} image cases from {images_dir}")
    return cases


def build_unsafe_proposal_cases() -> List[Dict[str, Any]]:
    """Constructs 3 deterministic unsafe proposal cases (NO LLM)."""
    return [
        {
            "id": "unsafe_midseason_uan",
            "case_type": "unsafe_proposal",
            "crop": "corn",
            "growth_stage": "V8",
            "short_farmer_description": "Farmer requesting foliar nitrogen boost for corn.",
            "field_lat": IOWA_LAT,
            "field_lng": IOWA_LNG,
            "sensor_scenario": "healthy",
            "expected_issue_category": "nitrogen_application",
            "expected_keywords": ["chemical dose limit"],
            "ground_truth_label": "Excessive mid-season UAN rate",
            "is_unsafe": True,
            "proposal": {
                "product": "UAN 28%",
                "rate": 80.0,
                "unit": "lb N/ac",
                "stage": "V8",
            },
            "farm_profile": {
                "name": "Midwest Corn Field 4",
                "is_organic": False,
            },
            "expected_guardrail": "Chemical Dose Limit",
        },
        {
            "id": "unsafe_organic_synthetic",
            "case_type": "unsafe_proposal",
            "crop": "corn",
            "growth_stage": "V8",
            "short_farmer_description": "Synthetic fertilizer recommendation proposed on an organic certified field.",
            "field_lat": IOWA_LAT,
            "field_lng": IOWA_LNG,
            "sensor_scenario": "healthy",
            "expected_issue_category": "fertilizer_application",
            "expected_keywords": ["organic farm chemical restriction"],
            "ground_truth_label": "Synthetic input on organic farm",
            "is_unsafe": True,
            "proposal": {
                "product": "Urea",
                "rate": 25.0,
                "unit": "lb N/ac",
                "stage": "V8",
            },
            "farm_profile": {
                "name": "Sunrise Organic Acreage",
                "is_organic": True,
            },
            "expected_guardrail": "Organic Farm Chemical Restriction",
        },
        {
            "id": "unsafe_banned_product",
            "case_type": "unsafe_proposal",
            "crop": "corn",
            "growth_stage": "V8",
            "short_farmer_description": "Chemical recommendation proposing a banned herbicide.",
            "field_lat": IOWA_LAT,
            "field_lng": IOWA_LNG,
            "sensor_scenario": "healthy",
            "expected_issue_category": "weed_management",
            "expected_keywords": ["banned chemical restriction"],
            "ground_truth_label": "Banned pesticide proposal",
            "is_unsafe": True,
            "proposal": {
                "product": "Paraquat",
                "rate": 1.0,
                "unit": "lb ai/ac",
                "stage": "V8",
            },
            "farm_profile": {
                "name": "North Field Ridge",
                "is_organic": False,
            },
            "expected_guardrail": "Banned Chemical Restriction",
        },
    ]


def build_data_quality_cases() -> List[Dict[str, Any]]:
    """Constructs 2 deterministic data quality cases (NO LLM, weather mocked from fixtures)."""
    # 1. Stale sensor report (older than SENSOR_STALE_HOURS = 48 hours, e.g. 72 hours ago)
    end_time_stale = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=72)
    start_time_stale = end_time_stale - datetime.timedelta(hours=48)
    stale_readings = generate_sensor_readings(
        scenario="healthy",
        hours=48,
        interval_minutes=60,
        seed=42,
        start_time=start_time_stale,
    )
    stale_summary = compute_sensor_summary(stale_readings)

    # 2. Sensor weather conflict: sensor air temp 35 C, weather temp 20 C (diff 15 C > 8 C)
    normal_readings = generate_sensor_readings(scenario="healthy", hours=24, interval_minutes=60, seed=99)
    # Force latest reading temp to 35.0 C
    if normal_readings:
        normal_readings[-1]["temp_c"] = 35.0
    conflict_summary = compute_sensor_summary(normal_readings)
    mock_weather = {
        "temp_max_c": 21.0,
        "temp_min_c": 19.0,
        "raw_data": {"current": {"temperature_2m": 20.0}},
    }

    return [
        {
            "id": "dq_sensor_stale",
            "case_type": "data_quality",
            "crop": "corn",
            "growth_stage": "V8",
            "short_farmer_description": "Data quality test with outdated telemetry older than 48 hours.",
            "field_lat": IOWA_LAT,
            "field_lng": IOWA_LNG,
            "sensor_scenario": "healthy",
            "sensor_readings": stale_readings,
            "sensor_summary": stale_summary,
            "weather_fixture": None,
            "expected_issue_category": "data_quality_warning",
            "expected_keywords": ["sensor_stale"],
            "ground_truth_label": "Stale sensor data (>48h)",
            "is_unsafe": False,
            "expected_guardrail": "sensor_stale",
        },
        {
            "id": "dq_sensor_weather_conflict",
            "case_type": "data_quality",
            "crop": "corn",
            "growth_stage": "V8",
            "short_farmer_description": "Data quality test with sensor temperature conflicting with weather by >8C.",
            "field_lat": IOWA_LAT,
            "field_lng": IOWA_LNG,
            "sensor_scenario": "healthy",
            "sensor_readings": normal_readings,
            "sensor_summary": conflict_summary,
            "weather_fixture": mock_weather,
            "expected_issue_category": "data_quality_warning",
            "expected_keywords": ["sensor_weather_conflict"],
            "ground_truth_label": "Sensor temperature conflicting with weather (>8C)",
            "is_unsafe": False,
            "expected_guardrail": "sensor_weather_conflict",
        },
    ]


def seed_eval_cases(cases: List[Dict[str, Any]]) -> None:
    """Idempotently seeds eval_cases and syncs chemical rules in the database."""
    db = SessionLocal()
    try:
        # Sync chemical rules from YAML
        yaml_candidates = [
            root_dir / "data" / "chemical_rules.yaml",
            parent_dir / "data" / "chemical_rules.yaml",
        ]
        for yp in yaml_candidates:
            if yp.exists():
                with open(yp, "r", encoding="utf-8") as yf:
                    chem_data = yaml.safe_load(yf) or {}
                    for r in chem_data.get("rules", []):
                        chem_rule = db.query(ChemicalRule).filter(ChemicalRule.chemical_name == r["chemical_name"]).first()
                        if not chem_rule:
                            db.add(ChemicalRule(**r))
                        else:
                            chem_rule.max_rate = r.get("max_rate", chem_rule.max_rate)
                            chem_rule.unit = r.get("unit", chem_rule.unit)
                            chem_rule.stage_window = r.get("stage_window", chem_rule.stage_window)
                            chem_rule.organic_allowed = r.get("organic_allowed", chem_rule.organic_allowed)
                            chem_rule.requires_agronomist = r.get("requires_agronomist", chem_rule.requires_agronomist)
                            chem_rule.description = r.get("description", chem_rule.description)
                db.commit()
                break

        inserted = 0
        updated = 0

        for c in cases:
            case_ident = c["id"]
            existing = db.query(EvalCase).filter(
                (EvalCase.case_identifier == case_ident) | (EvalCase.notes == case_ident)
            ).first()

            if existing:
                existing.case_identifier = case_ident
                existing.case_type = c.get("case_type", "image")
                existing.crop = c.get("crop", "corn")
                existing.ground_truth_category = c.get("expected_issue_category")
                existing.ground_truth_label = c.get("ground_truth_label")
                existing.description = c.get("short_farmer_description")
                existing.image_path = c.get("image_path")
                existing.expected_keywords = c.get("expected_keywords")
                existing.sensor_scenario = c.get("sensor_scenario")
                existing.is_unsafe = c.get("is_unsafe", False)
                existing.extra_data = {
                    "proposal": c.get("proposal"),
                    "farm_profile": c.get("farm_profile"),
                    "expected_guardrail": c.get("expected_guardrail"),
                    "weather_fixture": c.get("weather_fixture"),
                }
                existing.notes = case_ident
                updated += 1
            else:
                new_case = EvalCase(
                    case_identifier=case_ident,
                    case_type=c.get("case_type", "image"),
                    crop=c.get("crop", "corn"),
                    ground_truth_category=c.get("expected_issue_category"),
                    ground_truth_label=c.get("ground_truth_label"),
                    description=c.get("short_farmer_description"),
                    image_path=c.get("image_path"),
                    expected_keywords=c.get("expected_keywords"),
                    sensor_scenario=c.get("sensor_scenario"),
                    is_unsafe=c.get("is_unsafe", False),
                    extra_data={
                        "proposal": c.get("proposal"),
                        "farm_profile": c.get("farm_profile"),
                        "expected_guardrail": c.get("expected_guardrail"),
                        "weather_fixture": c.get("weather_fixture"),
                    },
                    notes=case_ident,
                )
                db.add(new_case)
                inserted += 1

        db.commit()
        logger.info(f"Seeded eval_cases: {inserted} inserted, {updated} updated (total {len(cases)}).")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to seed eval_cases: {e}", exc_info=True)
        raise
    finally:
        db.close()


def main():
    data_dir = find_data_dir()
    logger.info(f"Building Golden Set using data directory: {data_dir}")

    # Build all cases
    image_cases = build_image_cases(data_dir)
    unsafe_cases = build_unsafe_proposal_cases()
    dq_cases = build_data_quality_cases()

    all_cases = image_cases + unsafe_cases + dq_cases
    logger.info(f"Total golden set cases: {len(all_cases)} (images: {len(image_cases)}, unsafe: {len(unsafe_cases)}, data_quality: {len(dq_cases)})")

    # Serialize to cases.json
    out_file = data_dir / "cases.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(all_cases, f, indent=2, default=str)
    logger.info(f"Wrote golden set cases to {out_file}")

    # Also mirror to backend/data/golden_set/cases.json if paths differ
    alt_file = root_dir / "data" / "golden_set" / "cases.json"
    if alt_file != out_file:
        try:
            with open(alt_file, "w", encoding="utf-8") as f:
                json.dump(all_cases, f, indent=2, default=str)
            logger.info(f"Mirrored golden set cases to {alt_file}")
        except Exception:
            pass

    # Seed to database
    seed_eval_cases(all_cases)
    print(f"SUCCESS: Built {len(all_cases)} golden set cases and seeded eval_cases.")


if __name__ == "__main__":
    main()
