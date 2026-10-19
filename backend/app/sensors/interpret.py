import os
import yaml
from typing import List, Dict, Any, Optional

THRESHOLDS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "sensor_thresholds.yaml",
)


def load_sensor_thresholds() -> Dict[str, Any]:
    """Loads agronomic thresholds from YAML."""
    if os.path.exists(THRESHOLDS_FILE):
        try:
            with open(THRESHOLDS_FILE, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        except Exception:
            pass

    # In-code fallback if file not found
    return {
        "default": {
            "moisture": {"severe_low": 18.0, "low": 22.0, "adequate_min": 22.0, "adequate_max": 38.0, "high": 38.0, "severe_high": 42.0},
            "nitrogen": {"low": 35.0, "adequate_min": 35.0, "adequate_max": 110.0, "high": 110.0},
            "phosphorus": {"low": 25.0, "adequate_min": 25.0, "adequate_max": 90.0, "high": 90.0},
            "potassium": {"low": 55.0, "adequate_min": 55.0, "adequate_max": 120.0, "high": 120.0},
            "ph": {"low": 5.5, "adequate_min": 5.5, "adequate_max": 7.5, "high": 7.5},
        },
        "corn": {
            "moisture": {"severe_low": 18.0, "low": 22.0, "adequate_min": 22.0, "adequate_max": 38.0, "high": 38.0, "severe_high": 42.0},
            "nitrogen": {"low": 40.0, "adequate_min": 40.0, "adequate_max": 110.0, "high": 110.0},
            "phosphorus": {"low": 30.0, "adequate_min": 30.0, "adequate_max": 90.0, "high": 90.0},
            "potassium": {"low": 60.0, "adequate_min": 60.0, "adequate_max": 120.0, "high": 120.0},
            "ph": {"low": 5.8, "adequate_min": 5.8, "adequate_max": 7.0, "high": 7.0},
        },
        "soybean": {
            "moisture": {"severe_low": 18.0, "low": 22.0, "adequate_min": 22.0, "adequate_max": 38.0, "high": 38.0, "severe_high": 42.0},
            "nitrogen": {"low": 30.0, "adequate_min": 30.0, "adequate_max": 110.0, "high": 110.0},
            "phosphorus": {"low": 25.0, "adequate_min": 25.0, "adequate_max": 90.0, "high": 90.0},
            "potassium": {"low": 55.0, "adequate_min": 55.0, "adequate_max": 120.0, "high": 120.0},
            "ph": {"low": 5.5, "adequate_min": 5.5, "adequate_max": 7.5, "high": 7.5},
        },
        "rice": {
            "moisture": {"severe_low": 25.0, "low": 35.0, "adequate_min": 35.0, "adequate_max": 45.0, "high": 45.0, "severe_high": 55.0},
            "nitrogen": {"low": 35.0, "adequate_min": 35.0, "adequate_max": 110.0, "high": 110.0},
            "phosphorus": {"low": 25.0, "adequate_min": 25.0, "adequate_max": 90.0, "high": 90.0},
            "potassium": {"low": 55.0, "adequate_min": 55.0, "adequate_max": 120.0, "high": 120.0},
            "ph": {"low": 5.5, "adequate_min": 5.5, "adequate_max": 7.0, "high": 7.0},
        },
        "wheat": {
            "moisture": {"severe_low": 18.0, "low": 22.0, "adequate_min": 22.0, "adequate_max": 38.0, "high": 38.0, "severe_high": 42.0},
            "nitrogen": {"low": 35.0, "adequate_min": 35.0, "adequate_max": 110.0, "high": 110.0},
            "phosphorus": {"low": 25.0, "adequate_min": 25.0, "adequate_max": 90.0, "high": 90.0},
            "potassium": {"low": 55.0, "adequate_min": 55.0, "adequate_max": 120.0, "high": 120.0},
            "ph": {"low": 5.5, "adequate_min": 5.5, "adequate_max": 7.5, "high": 7.5},
        },
    }


def interpret_sensor_data(
    sensor_summary: Dict[str, Any],
    crop: Optional[str] = "corn",
) -> List[Dict[str, Any]]:
    """
    Evaluates sensor summary against crop thresholds and rules.
    Returns list of items: {key, status, severity, label_key}
    No LLM text used; all descriptions map to i18n label_key.
    """
    thresholds = load_sensor_thresholds()
    crop_key = (crop or "default").lower().strip()
    crop_thresh = thresholds.get(crop_key, thresholds.get("default", {}))
    default_thresh = thresholds.get("default", {})

    latest = sensor_summary.get("latest") or sensor_summary.get("latest_values") or {}
    last_24h = sensor_summary.get("last_24h") or sensor_summary.get("stats_24h") or {}
    results: List[Dict[str, Any]] = []

    # 1. Soil Moisture
    moisture_val = latest.get("soil_moisture_pct")
    m_cfg = crop_thresh.get("moisture", default_thresh.get("moisture", {}))
    if moisture_val is not None:
        val = float(moisture_val)
        if val < m_cfg.get("severe_low", 18.0):
            results.append({
                "key": "soil_moisture",
                "status": "severely_low",
                "severity": "critical",
                "label_key": "sensors.soil_moisture.severely_low",
                "value": val,
            })
        elif val < m_cfg.get("adequate_min", 22.0):
            results.append({
                "key": "soil_moisture",
                "status": "low",
                "severity": "warning",
                "label_key": "sensors.soil_moisture.low",
                "value": val,
            })
        elif val > m_cfg.get("severe_high", 42.0):
            results.append({
                "key": "soil_moisture",
                "status": "severely_high",
                "severity": "critical",
                "label_key": "sensors.soil_moisture.severely_high",
                "value": val,
            })
        elif val > m_cfg.get("adequate_max", 38.0):
            results.append({
                "key": "soil_moisture",
                "status": "high",
                "severity": "warning",
                "label_key": "sensors.soil_moisture.high",
                "value": val,
            })
        else:
            results.append({
                "key": "soil_moisture",
                "status": "adequate",
                "severity": "normal",
                "label_key": "sensors.soil_moisture.adequate",
                "value": val,
            })

    # 2. Nitrogen
    n_val = latest.get("n_mgkg")
    n_cfg = crop_thresh.get("nitrogen", default_thresh.get("nitrogen", {}))
    if n_val is not None:
        val = float(n_val)
        if val < n_cfg.get("low", 35.0):
            results.append({
                "key": "nitrogen",
                "status": "low",
                "severity": "warning",
                "label_key": "sensors.nitrogen.low",
                "value": val,
            })
        elif val > n_cfg.get("high", 110.0):
            results.append({
                "key": "nitrogen",
                "status": "high",
                "severity": "warning",
                "label_key": "sensors.nitrogen.high",
                "value": val,
            })
        else:
            results.append({
                "key": "nitrogen",
                "status": "adequate",
                "severity": "normal",
                "label_key": "sensors.nitrogen.adequate",
                "value": val,
            })

    # 3. Phosphorus
    p_val = latest.get("p_mgkg")
    p_cfg = crop_thresh.get("phosphorus", default_thresh.get("phosphorus", {}))
    if p_val is not None:
        val = float(p_val)
        if val < p_cfg.get("low", 25.0):
            results.append({
                "key": "phosphorus",
                "status": "low",
                "severity": "warning",
                "label_key": "sensors.phosphorus.low",
                "value": val,
            })
        elif val > p_cfg.get("high", 90.0):
            results.append({
                "key": "phosphorus",
                "status": "high",
                "severity": "warning",
                "label_key": "sensors.phosphorus.high",
                "value": val,
            })
        else:
            results.append({
                "key": "phosphorus",
                "status": "adequate",
                "severity": "normal",
                "label_key": "sensors.phosphorus.adequate",
                "value": val,
            })

    # 4. Potassium
    k_val = latest.get("k_mgkg")
    k_cfg = crop_thresh.get("potassium", default_thresh.get("potassium", {}))
    if k_val is not None:
        val = float(k_val)
        if val < k_cfg.get("low", 55.0):
            results.append({
                "key": "potassium",
                "status": "low",
                "severity": "warning",
                "label_key": "sensors.potassium.low",
                "value": val,
            })
        elif val > k_cfg.get("high", 120.0):
            results.append({
                "key": "potassium",
                "status": "high",
                "severity": "warning",
                "label_key": "sensors.potassium.high",
                "value": val,
            })
        else:
            results.append({
                "key": "potassium",
                "status": "adequate",
                "severity": "normal",
                "label_key": "sensors.potassium.adequate",
                "value": val,
            })

    # 5. Soil pH
    ph_val = latest.get("ph")
    ph_cfg = crop_thresh.get("ph", default_thresh.get("ph", {}))
    if ph_val is not None:
        val = float(ph_val)
        if val < ph_cfg.get("low", 5.5):
            results.append({
                "key": "ph",
                "status": "low",
                "severity": "warning",
                "label_key": "sensors.ph.low",
                "value": val,
            })
        elif val > ph_cfg.get("high", 7.5):
            results.append({
                "key": "ph",
                "status": "high",
                "severity": "warning",
                "label_key": "sensors.ph.high",
                "value": val,
            })
        else:
            results.append({
                "key": "ph",
                "status": "adequate",
                "severity": "normal",
                "label_key": "sensors.ph.adequate",
                "value": val,
            })

    # -----------------------------------------------------------------
    # RULES: fungal_pressure, heat_stress, dry_soil, waterlogged
    # -----------------------------------------------------------------
    # Rule 1: Fungal Pressure
    # leaf wetness >= 70% for >= 6 of the last 24 h AND mean humidity >= 80% AND mean temp 18-30 C = high; any two of the three = watch
    leaf_wetness_hours = (
        sensor_summary.get("hours_leaf_wetness_ge_70")
        if sensor_summary.get("hours_leaf_wetness_ge_70") is not None
        else (sensor_summary.get("hours_leaf_wetness_ge_70_24h") or 0.0)
    )
    last_24h = sensor_summary.get("last_24h") or sensor_summary.get("stats_24h") or {}
    hum_stats = last_24h.get("humidity_pct", {})

    temp_stats = last_24h.get("temp_c", {})
    mean_hum = hum_stats.get("mean")
    mean_temp = temp_stats.get("mean")

    c1 = leaf_wetness_hours >= 6.0
    c2 = (mean_hum is not None) and (mean_hum >= 80.0)
    c3 = (mean_temp is not None) and (18.0 <= mean_temp <= 30.0)
    matched_fungal_conditions = sum([c1, c2, c3])

    if matched_fungal_conditions == 3:
        results.append({
            "key": "fungal_pressure",
            "status": "high",
            "severity": "high",
            "label_key": "sensors.fungal_pressure.high",
        })
    elif matched_fungal_conditions == 2:
        results.append({
            "key": "fungal_pressure",
            "status": "watch",
            "severity": "warning",
            "label_key": "sensors.fungal_pressure.watch",
        })
    else:
        results.append({
            "key": "fungal_pressure",
            "status": "low",
            "severity": "normal",
            "label_key": "sensors.fungal_pressure.low",
        })

    # Rule 2: Heat Stress (temp max >= 35)
    max_temp = temp_stats.get("max") or latest.get("temp_c")
    if max_temp is not None and float(max_temp) >= 35.0:
        results.append({
            "key": "heat_stress",
            "status": "high",
            "severity": "high",
            "label_key": "sensors.heat_stress.active",
            "value": float(max_temp),
        })

    # Rule 3: Dry Soil (moisture below adequate)
    if moisture_val is not None:
        m_val = float(moisture_val)
        if m_val < m_cfg.get("adequate_min", 22.0):
            results.append({
                "key": "dry_soil",
                "status": "active",
                "severity": "warning" if m_val >= m_cfg.get("severe_low", 18.0) else "critical",
                "label_key": "sensors.dry_soil.active",
                "value": m_val,
            })
        elif m_val > m_cfg.get("adequate_max", 38.0):
            results.append({
                "key": "waterlogged",
                "status": "active",
                "severity": "warning" if m_val <= m_cfg.get("severe_high", 42.0) else "critical",
                "label_key": "sensors.waterlogged.active",
                "value": m_val,
            })

    return results
