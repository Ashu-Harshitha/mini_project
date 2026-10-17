import pytest
from app.models.models import Case, Recommendation, Farm, Field
from app.guardrails.engine import GuardrailEngine


def create_case_with_rec(db, farm, user, rec_kwargs):
    field = farm.fields[0]
    case = Case(
        case_number=f"GR-{db.query(Case).count() + 200}",
        farm_id=farm.id,
        field_id=field.id,
        user_id=user.id,
        crop="Corn",
        growth_stage="V8",
        status="PENDING_REVIEW",
    )
    db.add(case)
    db.commit()
    db.refresh(case)

    rec = Recommendation(
        case_id=case.id,
        rank=1,
        category="Fertilizer",
        title="Test Treatment",
        confidence=rec_kwargs.get("confidence", 85.0),
        citation=rec_kwargs.get("citation", "ISU Ext. PM 1688"),
        chemical_name=rec_kwargs.get("chemical_name"),
        chemical_dose=rec_kwargs.get("chemical_dose"),
        chemical_unit=rec_kwargs.get("chemical_unit", "lb N/ac"),
        is_visible_to_farmer=True,
    )
    db.add(rec)
    db.commit()
    db.refresh(case)

    return case, rec


# -----------------------------------------------------------------
# RULE 1: Chemical Dose Limit & Mandatory Agronomist Approval
# -----------------------------------------------------------------
def test_rule1_chemical_dose_pass(db, test_farm, test_user):
    # Urea max rate is 30.0 lb N/ac in chemical_rules.yaml. Applying 20.0 should PASS.
    case, _ = create_case_with_rec(
        db, test_farm, test_user,
        {"chemical_name": "Urea", "chemical_dose": 20.0, "confidence": 85.0}
    )

    is_blocked, results = GuardrailEngine.run_checks(db, case)
    assert not is_blocked

    dose_result = next(r for r in results if "Chemical Dose Limit" in r.rule_name)
    assert dose_result.status == "PASSED"

    agronomist_result = next(r for r in results if "Agronomist Sign-Off" in r.rule_name)
    assert agronomist_result.status == "FLAGGED"  # Chemical inputs always flag for agronomist


def test_rule1_chemical_dose_fail(db, test_farm, test_user):
    # Urea max rate is 30.0 lb N/ac. Applying 55.0 lb N/ac exceeds limit -> FLAGGED.
    case, _ = create_case_with_rec(
        db, test_farm, test_user,
        {"chemical_name": "Urea", "chemical_dose": 55.0, "confidence": 85.0}
    )

    is_blocked, results = GuardrailEngine.run_checks(db, case)
    assert not is_blocked  # Flagged, not completely blocked unless organic

    dose_result = next(r for r in results if "Chemical Dose Limit" in r.rule_name)
    assert dose_result.status == "FLAGGED"
    assert "exceeds maximum label threshold" in dose_result.details


# -----------------------------------------------------------------
# RULE 2: Organic Farm Compliance Check
# -----------------------------------------------------------------
def test_rule2_organic_farm_prohibited_chemical_blocks(db, test_organic_farm, test_user):
    # Synthetic Urea on an organic farm must be BLOCKED!
    case, _ = create_case_with_rec(
        db, test_organic_farm, test_user,
        {"chemical_name": "Urea", "chemical_dose": 20.0, "confidence": 85.0}
    )

    is_blocked, results = GuardrailEngine.run_checks(db, case)
    assert is_blocked is True

    organic_result = next(r for r in results if "Organic Farm Chemical Restriction" in r.rule_name)
    assert organic_result.status == "BLOCKED"
    assert "Prohibited synthetic input" in organic_result.details


def test_rule2_organic_farm_allowed_product_passes(db, test_organic_farm, test_user):
    # Copper Sulfate is organic_allowed: true in chemical_rules.yaml -> PASSES.
    case, _ = create_case_with_rec(
        db, test_organic_farm, test_user,
        {"chemical_name": "Copper Sulfate", "chemical_dose": 1.5, "chemical_unit": "lb/ac", "confidence": 85.0}
    )

    is_blocked, results = GuardrailEngine.run_checks(db, case)
    assert is_blocked is False

    organic_result = next(r for r in results if "Organic Farm Chemical Restriction" in r.rule_name)
    assert organic_result.status == "PASSED"


# -----------------------------------------------------------------
# RULE 3: Confidence Thresholds & Farmer Visibility
# -----------------------------------------------------------------
def test_rule3_confidence_auto_approve_pass(db, test_farm, test_user):
    # Confidence >= 80% passes auto-approval check
    case, _ = create_case_with_rec(
        db, test_farm, test_user,
        {"confidence": 88.0, "citation": "ISU Ext. PM 1688"}
    )

    is_blocked, results = GuardrailEngine.run_checks(db, case)
    assert not is_blocked

    conf_result = next(r for r in results if "Confidence Threshold Auto-Approval Gate" in r.rule_name)
    assert conf_result.status == "PASSED"


def test_rule3_confidence_sub_threshold_flags_for_review(db, test_farm, test_user):
    # Confidence between 50 and 79.9% cannot auto-approve -> FLAGGED for review
    case, _ = create_case_with_rec(
        db, test_farm, test_user,
        {"confidence": 72.0, "citation": "ISU Ext. PM 1688"}
    )

    is_blocked, results = GuardrailEngine.run_checks(db, case)
    assert not is_blocked

    conf_result = next(r for r in results if "Confidence Threshold Auto-Approval Gate" in r.rule_name)
    assert conf_result.status == "FLAGGED"
    assert "Mandatory human review required" in conf_result.details


def test_rule3_low_confidence_hides_from_farmer(db, test_farm, test_user):
    # Confidence < 50% must hide recommendation from farmer
    case, rec = create_case_with_rec(
        db, test_farm, test_user,
        {"confidence": 45.0, "citation": "ISU Ext. PM 1688"}
    )

    is_blocked, results = GuardrailEngine.run_checks(db, case)
    assert not is_blocked
    assert rec.is_visible_to_farmer is False

    visibility_result = next(r for r in results if "Low Confidence Farmer Visibility Cutoff" in r.rule_name)
    assert visibility_result.status == "FLAGGED"
    assert "Hidden from farmer guidance" in visibility_result.details


# -----------------------------------------------------------------
# RULE 4: Agronomic Research / Extension Citation Check
# -----------------------------------------------------------------
def test_rule4_citation_pass(db, test_farm, test_user):
    case, _ = create_case_with_rec(
        db, test_farm, test_user,
        {"citation": "Iowa State University Extension PM 1688"}
    )

    is_blocked, results = GuardrailEngine.run_checks(db, case)
    assert not is_blocked

    citation_result = next(r for r in results if "Grounded Citation Requirement" in r.rule_name)
    assert citation_result.status == "PASSED"


def test_rule4_missing_citation_fail(db, test_farm, test_user):
    case, _ = create_case_with_rec(
        db, test_farm, test_user,
        {"citation": ""}
    )

    is_blocked, results = GuardrailEngine.run_checks(db, case)
    assert not is_blocked

    citation_result = next(r for r in results if "Grounded Citation Requirement" in r.rule_name)
    assert citation_result.status == "FLAGGED"
    assert "does not cite a valid university extension source" in citation_result.details
