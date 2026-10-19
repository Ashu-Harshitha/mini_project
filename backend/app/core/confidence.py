"""
Unified AgriAdvisor AI Confidence Calculation and Uncertainty Band Determination.

Formula:
  final_confidence = 0.4 * model_confidence + 0.3 * retrieval_confidence + 0.3 * data_completeness

Bands:
  - Low Uncertainty:   final >= 80%
  - Medium Uncertainty: 60% <= final < 80%
  - High Uncertainty:   final < 60%
"""

from typing import Tuple


def calculate_confidence(
    model_confidence: float,
    retrieval_confidence: float,
    data_completeness: float
) -> float:
    """
    Computes final confidence percentage based on model prediction,
    retrieval groundedness, and data completeness.
    Clamped to range [0.0, 100.0] and rounded to 1 decimal place.
    """
    # Normalize input scales if given as 0-1 instead of 0-100
    m = model_confidence if model_confidence > 1.0 else model_confidence * 100.0
    r = retrieval_confidence if retrieval_confidence > 1.0 else retrieval_confidence * 100.0
    d = data_completeness if data_completeness > 1.0 else data_completeness * 100.0

    raw = (0.4 * m) + (0.3 * r) + (0.3 * d)
    clamped = max(0.0, min(100.0, raw))
    return round(clamped, 1)


def get_uncertainty_band(confidence: float) -> str:
    """
    Returns the uncertainty band name matching the required specification:
    Low >= 80, Medium 60-79, High < 60.
    """
    score = float(confidence)
    if score >= 80.0:
        return "Low"
    elif score >= 60.0:
        return "Medium"
    else:
        return "High"


def calculate_data_completeness(
    has_image: bool = False,
    has_sensor_report: bool = False,
    has_description: bool = False,
    has_weather: bool = False,
    has_sensor: bool = None,
) -> float:
    """
    Computes data completeness score as a weighted share of available inputs:
    - image: 0.30
    - sensor report: 0.30
    - description: 0.20
    - weather: 0.20
    Returns score as a percentage [0.0, 100.0] rounded to 1 decimal place.
    """
    if has_sensor is not None:
        has_sensor_report = has_sensor

    score = 0.0
    if has_image:
        score += 0.30
    if has_sensor_report:
        score += 0.30
    if has_description:
        score += 0.20
    if has_weather:
        score += 0.20
    return round(score * 100.0, 1)


def evaluate_confidence(
    model_confidence: float,
    retrieval_confidence: float,
    data_completeness: float
) -> Tuple[float, str]:
    """
    Computes both the single % score and the uncertainty band.
    """
    score = calculate_confidence(model_confidence, retrieval_confidence, data_completeness)
    band = get_uncertainty_band(score)
    return score, band
