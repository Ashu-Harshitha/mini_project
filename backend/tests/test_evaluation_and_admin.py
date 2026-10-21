import os
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import User, EvalRun, EvalCase, EvalCaseResult, SystemSetting, ChemicalRule
from app.services.eval_metrics import (
    compute_ece,
    compute_flesch_reading_ease,
    compute_clarity_checklist,
    compute_farmer_clarity,
    compute_environmental_awareness,
    check_image_case_accuracy,
)
from app.services.eval_runner import (
    QuotaExceededError,
    run_deterministic_safety_case,
    run_evaluation_suite,
)


# ---------------------------------------------------------------------------
# 1. Metric functions tests (ECE, Flesch, checklist, keyword, accuracy)
# ---------------------------------------------------------------------------

def test_ece_3_bins_calculation():
    # Perfectly calibrated case: 100% confidence with 100% correctness
    confidences = [0.95, 0.90, 0.85, 0.50, 0.45]
    accuracies = [True, True, True, False, False]
    ece, calib_score = compute_ece(confidences, accuracies, n_bins=3)
    assert 0.0 <= ece <= 1.0
    assert 0.0 <= calib_score <= 100.0

    # Overconfident case: High confidence, low accuracy -> high ECE, lower calib_score
    over_conf = [0.99, 0.95, 0.92, 0.98]
    over_acc = [False, False, False, False]
    over_ece, over_score = compute_ece(over_conf, over_acc, n_bins=3)
    assert over_ece > 0.5
    assert over_score < 50.0

    # Empty case fallback
    empty_ece, empty_score = compute_ece([], [])
    assert empty_ece == 0.0
    assert empty_score == 100.0


def test_flesch_reading_ease():
    simple_text = "The corn looks healthy. Check the soil moisture today. Water the plants."
    complex_text = "The pathological phytoplasma manifestation necessitates immediate stoichiometric chemigation and agrochemical remediation."

    simple_score = compute_flesch_reading_ease(simple_text)
    complex_score = compute_flesch_reading_ease(complex_text)

    assert simple_score > complex_score
    assert 0.0 <= simple_score <= 100.0
    assert 0.0 <= complex_score <= 100.0


def test_farmer_clarity_checklist():
    good_text = "We inspected your corn crop. The leaves have minor rust spots. Apply the approved fungicide spray. Keep monitoring neighboring rows next week."
    chk = compute_clarity_checklist(good_text)
    assert chk["checklist_score"] == 100.0
    assert chk["no_jargon"] is True
    assert chk["no_ai_words"] is True

    # Test jargon hit
    jargon_text = "The AI model with confidence 94% recommends a stoichiometric pesticide application to suppress chlorosis."
    j_chk = compute_clarity_checklist(jargon_text)
    assert j_chk["checklist_score"] < 100.0
    assert j_chk["no_jargon"] is False or j_chk["no_ai_words"] is False

    # Test combined farmer clarity
    clarity_val = compute_farmer_clarity(good_text)
    assert 0.0 <= clarity_val <= 100.0


def test_environmental_keyword_score():
    relevant_report = "Be careful with chemical runoff near the drainage ditch. Maintain a 50 foot buffer zone to prevent drift and protect local pollinators."
    score = compute_environmental_awareness(relevant_report, is_relevant=True)
    assert score >= 60.0

    empty_report = "No guidance."
    zero_score = compute_environmental_awareness(empty_report, is_relevant=True)
    assert zero_score == 0.0

    # Non-chemical case (e.g. healthy crop) defaults to 100
    healthy_score = compute_environmental_awareness("Corn is doing well.", is_relevant=False)
    assert healthy_score == 100.0


def test_check_image_case_accuracy():
    matched = check_image_case_accuracy(
        predicted_label="Common rust on upper foliage",
        observations=["Pustules observed on leaf"],
        expected_keywords=["common rust", "rust"],
    )
    assert matched is True

    mismatched = check_image_case_accuracy(
        predicted_label="Nitrogen Deficiency",
        observations=[],
        expected_keywords=["northern leaf blight", "blight"],
    )
    assert mismatched is False


# ---------------------------------------------------------------------------
# 2. Safety score uses NO LLM test
# ---------------------------------------------------------------------------

def test_safety_score_uses_no_llm(db):
    uan_case = EvalCase(
        case_identifier="unsafe_uan_midseason",
        case_type="unsafe_proposal",
        crop="corn",
        is_unsafe=True,
        extra_data={
            "proposal": {"product": "UAN 28%", "rate": 80, "unit": "lb N/ac"},
            "expected_guardrail": "Chemical Dose Limit: UAN 28%",
            "farm_profile": {"is_organic": False},
        },
    )

    # Mock any LLM call to raise if called
    with patch("app.services.eval_runner.get_gemini_client") as mock_gemini:
        mock_gemini.side_effect = RuntimeError("LLM must not be called for deterministic safety scoring")
        passed, reason, details = run_deterministic_safety_case(uan_case, db=db)

    assert passed is True
    assert reason == ""
    assert "raised_rules" in details


# ---------------------------------------------------------------------------
# 3. Data quality cases raise expected flags
# ---------------------------------------------------------------------------

def test_data_quality_cases_raise_expected_flags(db):
    stale_case = EvalCase(
        case_identifier="dq_sensor_stale",
        case_type="data_quality",
        crop="corn",
        is_unsafe=False,
        extra_data={"expected_guardrail": "sensor_stale"},
    )
    passed_stale, reason_stale, details_stale = run_deterministic_safety_case(stale_case, db=db)
    assert passed_stale is True
    assert any("sensor_stale" in r.lower() for r in details_stale.get("raised_rules", []))

    conflict_case = EvalCase(
        case_identifier="dq_sensor_weather_conflict",
        case_type="data_quality",
        crop="corn",
        is_unsafe=False,
        extra_data={"expected_guardrail": "sensor_weather_conflict"},
    )
    passed_conf, reason_conf, details_conf = run_deterministic_safety_case(conflict_case, db=db)
    assert passed_conf is True
    assert any("sensor_weather_conflict" in r.lower() for r in details_conf.get("raised_rules", []))


# ---------------------------------------------------------------------------
# 4. Missing images are skipped with warning
# ---------------------------------------------------------------------------

def test_missing_images_are_skipped(db):
    missing_case = EvalCase(
        case_identifier="test_missing_img_case",
        case_type="image",
        crop="corn",
        image_path="non_existent_image_12345.jpg",
        expected_keywords=["healthy"],
    )
    db.add(missing_case)
    db.commit()

    # The runner must handle missing images gracefully and skip without failing
    run = run_evaluation_suite(max_cases=1)
    assert run.status in ["completed", "running"]


# ---------------------------------------------------------------------------
# 5. Runner pauses and resumes on QuotaExceededError
# ---------------------------------------------------------------------------

def test_runner_pauses_and_resumes_on_quota_error(db):
    # First run triggers QuotaExceededError
    with patch("app.services.eval_runner.evaluate_groundedness", side_effect=QuotaExceededError("ResourceExhausted: 429 Quota Exceeded")):
        paused_run = run_evaluation_suite(max_cases=2)

    assert paused_run.status == "paused"
    paused_id = paused_run.id

    # Second run resumes the paused run successfully
    with patch("app.services.eval_runner.evaluate_groundedness", return_value=(0.90, [])):
        resumed_run = run_evaluation_suite(resume=True, run_id=paused_id, max_cases=2)

    assert resumed_run.id == paused_id
    assert resumed_run.status == "completed"


# ---------------------------------------------------------------------------
# 6. Top Pick selection follows highest score
# ---------------------------------------------------------------------------

def test_top_pick_selection_follows_highest_score(client, test_admin):
    app.dependency_overrides[get_current_user] = lambda: test_admin
    response = client.get("/models/comparison")
    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    assert "highest_score" in data

    models = data["models"]
    highest = max(m["agriAdvisorScore"] for m in models)
    for m in models:
        if m["agriAdvisorScore"] == highest and highest > 0:
            assert m["is_top_pick"] is True
        else:
            assert m["is_top_pick"] is False


# ---------------------------------------------------------------------------
# 7. Settings validation (0-100, hide < auto_approve)
# ---------------------------------------------------------------------------

def test_settings_validation(client, test_admin):
    app.dependency_overrides[get_current_user] = lambda: test_admin

    # Out of range (< 0)
    res_neg = client.put("/guardrails/settings", json={"auto_approve_confidence_threshold": -10, "hide_confidence_threshold": 50})
    assert res_neg.status_code in [400, 422]

    # Out of range (> 100)
    res_high = client.put("/guardrails/settings", json={"auto_approve_confidence_threshold": 120, "hide_confidence_threshold": 50})
    assert res_high.status_code in [400, 422]

    # hide >= auto_approve
    res_conflict = client.put("/guardrails/settings", json={"auto_approve_confidence_threshold": 60, "hide_confidence_threshold": 70})
    assert res_conflict.status_code in [400, 422]

    # Equal
    res_equal = client.put("/guardrails/settings", json={"auto_approve_confidence_threshold": 70, "hide_confidence_threshold": 70})
    assert res_equal.status_code in [400, 422]

    # Valid
    res_valid = client.put("/guardrails/settings", json={"auto_approve_confidence_threshold": 85, "hide_confidence_threshold": 45})
    assert res_valid.status_code == 200
    assert res_valid.json()["auto_approve_confidence_threshold"] == 85.0
    assert res_valid.json()["hide_confidence_threshold"] == 45.0


# ---------------------------------------------------------------------------
# 8. Role guards (farmer & agronomist get 403 on admin endpoints)
# ---------------------------------------------------------------------------

def test_role_guards_farmer_and_agronomist(client, test_user, test_agronomist, test_admin):
    # 1. Farmer gets 403 on admin endpoints
    app.dependency_overrides[get_current_user] = lambda: test_user
    res_farmer_eval = client.get("/eval/overview")
    assert res_farmer_eval.status_code == 403

    res_farmer_preview = client.post("/prompts/image_analysis/preview", json={})
    assert res_farmer_preview.status_code == 403

    res_farmer_settings = client.put("/guardrails/settings", json={"auto_approve_confidence_threshold": 80, "hide_confidence_threshold": 50})
    assert res_farmer_settings.status_code == 403

    res_farmer_rules = client.get("/guardrails/rules")
    assert res_farmer_rules.status_code == 403

    # 2. Agronomist gets 403 on admin endpoints
    app.dependency_overrides[get_current_user] = lambda: test_agronomist
    res_agro_eval = client.get("/eval/overview")
    assert res_agro_eval.status_code == 403

    res_agro_preview = client.post("/prompts/image_analysis/preview", json={})
    assert res_agro_preview.status_code == 403

    res_agro_settings = client.put("/guardrails/settings", json={"auto_approve_confidence_threshold": 80, "hide_confidence_threshold": 50})
    assert res_agro_settings.status_code == 403

    # 3. Agronomist gets 200 on /guardrails/rules
    res_agro_rules = client.get("/guardrails/rules")
    assert res_agro_rules.status_code == 200
    assert "rules" in res_agro_rules.json()

    # 4. Admin gets 200 on all admin endpoints
    app.dependency_overrides[get_current_user] = lambda: test_admin
    res_admin_eval = client.get("/eval/overview")
    assert res_admin_eval.status_code == 200

    res_admin_rules = client.get("/guardrails/rules")
    assert res_admin_rules.status_code == 200


# ---------------------------------------------------------------------------
# 9. Prompt comparison job test
# ---------------------------------------------------------------------------

def test_prompt_compare_job(client, test_admin):
    app.dependency_overrides[get_current_user] = lambda: test_admin
    res = client.post("/prompts/compare", json={"step": "image_analysis", "version_a": 1, "version_b": 1, "max_cases": 2})
    assert res.status_code == 200
    data = res.json()
    assert "job_id" in data
    job_id = data["job_id"]

    # Status check
    res_status = client.get(f"/prompts/compare/{job_id}")
    assert res_status.status_code == 200
    assert res_status.json()["job_id"] == job_id
