"""
AgriAdvisor AI Real Guardrails Engine.

Evaluates recommendations against active rules from the database:
1. Chemical dose limit vs max_rate / stage window & mandatory agronomist sign-off.
2. Organic farm blocks non-organic compliant inputs (status: BLOCKED).
3. Confidence check: < threshold (80) prevents auto-approval, < 50 hides from farmer.
4. Missing citation check: recommendations without academic/extension citations flagged.

Saves all evaluation results to `guardrail_results`.
"""

from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from app.models.models import Case, Recommendation, ChemicalRule, GuardrailResult, Farm
from app.core.config import settings


class GuardrailEngine:
    @classmethod
    def run_checks(
        cls,
        db: Session,
        case: Case,
    ) -> Tuple[bool, List[GuardrailResult]]:
        """
        Runs all active guardrail rules for the given case.
        Returns:
            (is_blocked: bool, results: List[GuardrailResult])
        """
        results: List[GuardrailResult] = []
        is_blocked = False
        farm: Farm = case.farm

        # Query all active chemical rules
        chemical_rules = {r.chemical_name.lower(): r for r in db.query(ChemicalRule).all()}

        # Evaluate each recommendation for this case
        for rec in case.recommendations:
            # -------------------------------------------------------------
            # RULE 1: Chemical Dose Limit & Mandatory Agronomist Approval
            # -------------------------------------------------------------
            chem_name = (rec.chemical_name or "").strip().lower()
            matching_rule = chemical_rules.get(chem_name)
            
            # If not explicitly named, check if title mentions a known chemical
            if not matching_rule:
                for k, v in chemical_rules.items():
                    if k in rec.title.lower():
                        matching_rule = v
                        break

            if matching_rule:
                # Check dose limit
                if rec.chemical_dose is not None and rec.chemical_dose > matching_rule.max_rate:
                    gr = GuardrailResult(
                        case_id=case.id,
                        rule_name=f"Chemical Dose Limit: {matching_rule.name}",
                        rule_category="Chemical Safety",
                        status="FLAGGED",
                        details=(
                            f"Proposed rate of {rec.chemical_dose} {rec.chemical_unit or matching_rule.unit} "
                            f"exceeds maximum label threshold of {matching_rule.max_rate} {matching_rule.unit} "
                            f"for growth window '{matching_rule.stage_window}'."
                        ),
                    )
                    results.append(gr)
                else:
                    results.append(
                        GuardrailResult(
                            case_id=case.id,
                            rule_name=f"Chemical Dose Limit: {matching_rule.name}",
                            rule_category="Chemical Safety",
                            status="PASSED",
                            details=f"Dose within label limits ({matching_rule.max_rate} {matching_rule.unit}).",
                        )
                    )

                # Chemical input mandatory agronomist sign-off
                if matching_rule.requires_agronomist:
                    results.append(
                        GuardrailResult(
                            case_id=case.id,
                            rule_name=f"Agronomist Sign-Off Required: {matching_rule.name}",
                            rule_category="Chemical Safety",
                            status="FLAGGED",
                            details="Chemical inputs always require agronomist sign-off before farmer application.",
                        )
                    )

                # ---------------------------------------------------------
                # RULE 2: Organic Farm Compliance Check
                # ---------------------------------------------------------
                if farm and farm.is_organic and not matching_rule.organic_allowed:
                    is_blocked = True
                    results.append(
                        GuardrailResult(
                            case_id=case.id,
                            rule_name="Organic Farm Chemical Restriction",
                            rule_category="Organic Compliance",
                            status="BLOCKED",
                            details=(
                                f"Farm '{farm.name}' is certified organic. Prohibited synthetic input "
                                f"'{matching_rule.chemical_name}' cannot be applied. Recommendation BLOCKED."
                            ),
                        )
                    )
                elif farm and farm.is_organic and matching_rule.organic_allowed:
                    results.append(
                        GuardrailResult(
                            case_id=case.id,
                            rule_name="Organic Farm Chemical Restriction",
                            rule_category="Organic Compliance",
                            status="PASSED",
                            details=f"Product '{matching_rule.chemical_name}' is organic compliant.",
                        )
                    )

            # -------------------------------------------------------------
            # RULE 3: Confidence Auto-Approval and Visibility Gates
            # -------------------------------------------------------------
            conf = rec.confidence
            if conf < settings.MIN_FARMER_VISIBLE_CONFIDENCE:
                # Confidence < 50: hide from farmer
                rec.is_visible_to_farmer = False
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="Low Confidence Farmer Visibility Cutoff",
                        rule_category="Decision Quality",
                        status="FLAGGED",
                        details=(
                            f"Recommendation '{rec.title}' confidence ({conf}%) is below minimum threshold "
                            f"({settings.MIN_FARMER_VISIBLE_CONFIDENCE}%). Hidden from farmer guidance."
                        ),
                    )
                )
            elif conf < settings.AUTO_APPROVE_CONFIDENCE_THRESHOLD:
                # Confidence < 80: cannot auto-approve
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="Confidence Threshold Auto-Approval Gate",
                        rule_category="Decision Quality",
                        status="FLAGGED",
                        details=(
                            f"Recommendation '{rec.title}' confidence ({conf}%) is below auto-approval threshold "
                            f"({settings.AUTO_APPROVE_CONFIDENCE_THRESHOLD}%). Mandatory human review required."
                        ),
                    )
                )
            else:
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="Confidence Threshold Auto-Approval Gate",
                        rule_category="Decision Quality",
                        status="PASSED",
                        details=f"Confidence ({conf}%) meets auto-approval criteria.",
                    )
                )

            # -------------------------------------------------------------
            # RULE 4: Agronomic Research / Extension Citation Check
            # -------------------------------------------------------------
            if not rec.citation or not rec.citation.strip():
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="Grounded Citation Requirement",
                        rule_category="Explainability",
                        status="FLAGGED",
                        details=f"Recommendation '{rec.title}' does not cite a valid university extension source.",
                    )
                )
            else:
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="Grounded Citation Requirement",
                        rule_category="Explainability",
                        status="PASSED",
                        details=f"Cited source: {rec.citation}",
                    )
                )

        # Save all guardrail results to database
        for gr in results:
            db.add(gr)
        db.commit()

        return is_blocked, results
