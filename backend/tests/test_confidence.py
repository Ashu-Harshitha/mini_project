from app.core.confidence import calculate_confidence, get_uncertainty_band, evaluate_confidence


def test_confidence_formula_exact_weights():
    # 0.4*100 + 0.3*100 + 0.3*100 = 100.0
    assert calculate_confidence(100.0, 100.0, 100.0) == 100.0

    # 0.4*90 + 0.3*70 + 0.3*60 = 36 + 21 + 18 = 75.0
    assert calculate_confidence(90.0, 70.0, 60.0) == 75.0

    # 0.4*80 + 0.3*85 + 0.3*90 = 32 + 25.5 + 27 = 84.5
    assert calculate_confidence(80.0, 85.0, 90.0) == 84.5

    # 0.4*40 + 0.3*50 + 0.3*50 = 16 + 15 + 15 = 46.0
    assert calculate_confidence(40.0, 50.0, 50.0) == 46.0


def test_confidence_clamping():
    # Never exceed 100 or drop below 0
    assert calculate_confidence(120.0, 110.0, 105.0) == 100.0
    assert calculate_confidence(-10.0, -5.0, 0.0) == 0.0


def test_uncertainty_bands_definition():
    # Low Uncertainty: >= 80%
    assert get_uncertainty_band(80.0) == "Low"
    assert get_uncertainty_band(85.5) == "Low"
    assert get_uncertainty_band(100.0) == "Low"

    # Medium Uncertainty: 60 - 79.9%
    assert get_uncertainty_band(79.9) == "Medium"
    assert get_uncertainty_band(72.0) == "Medium"
    assert get_uncertainty_band(60.0) == "Medium"

    # High Uncertainty: < 60%
    assert get_uncertainty_band(59.9) == "High"
    assert get_uncertainty_band(45.0) == "High"
    assert get_uncertainty_band(0.0) == "High"


def test_evaluate_confidence_tuple():
    score, band = evaluate_confidence(85.0, 80.0, 80.0)
    # 0.4*85 + 0.3*80 + 0.3*80 = 34 + 24 + 24 = 82.0
    assert score == 82.0
    assert band == "Low"
