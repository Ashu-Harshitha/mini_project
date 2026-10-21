"""
AgriAdvisor AI Real Guardrails Engine.

Evaluates recommendations against active rules from the database:
1. Chemical dose limit vs max_rate / stage window & mandatory agronomist sign-off.
2. Organic farm blocks non-organic compliant inputs (status: BLOCKED).
3. Confidence check: < threshold (80) prevents auto-approval, < 50 hides from farmer.
4. Missing citation check: recommendations without academic/extension citations flagged.

Saves all evaluation results to `guardrail_results`.
"""

from typing import List, Tuple
from sqlalchemy.orm import Session
from app.models.models import Case, ChemicalRule, GuardrailResult, Farm
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
                # Check banned chemical (max_rate <= 0.0)
                if matching_rule.max_rate <= 0.0:
                    is_blocked = True
                    results.append(
                        GuardrailResult(
                            case_id=case.id,
                            rule_name=f"Banned Chemical Restriction: {matching_rule.name}",
                            rule_category="Chemical Safety",
                            status="BLOCKED",
                            details=f"Product '{matching_rule.chemical_name}' is banned/prohibited. Application BLOCKED.",
                        )
                    )

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
            min_visible_conf = getattr(settings, "MIN_FARMER_VISIBLE_CONFIDENCE", 50.0)
            auto_approve_conf = getattr(settings, "AUTO_APPROVE_CONFIDENCE_THRESHOLD", 80.0)
            try:
                from app.models.models import SystemSetting
                setting = db.query(SystemSetting).filter(SystemSetting.key == "guardrails_settings").first()
                if setting and isinstance(setting.value, dict):
                    min_visible_conf = float(setting.value.get("hide_confidence_threshold", min_visible_conf))
                    auto_approve_conf = float(setting.value.get("auto_approve_confidence_threshold", auto_approve_conf))
            except Exception:
                pass

            conf = rec.confidence
            if conf < min_visible_conf:
                # Confidence < hide threshold: hide from farmer
                rec.is_visible_to_farmer = False
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="Low Confidence Farmer Visibility Cutoff",
                        rule_category="Decision Quality",
                        status="FLAGGED",
                        details=(
                            f"Recommendation '{rec.title}' confidence ({conf}%) is below minimum threshold "
                            f"({min_visible_conf}%). Hidden from farmer guidance."
                        ),
                    )
                )
            elif conf < auto_approve_conf:
                # Confidence < auto approval threshold: cannot auto-approve
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="Confidence Threshold Auto-Approval Gate",
                        rule_category="Decision Quality",
                        status="FLAGGED",
                        details=(
                            f"Recommendation '{rec.title}' confidence ({conf}%) is below auto-approval threshold "
                            f"({auto_approve_conf}%). Mandatory human review required."
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

        # -----------------------------------------------------------------
        # DATA QUALITY FLAGS (Severity: FLAGGED warning, shown to agronomists/admins)
        # -----------------------------------------------------------------
        # 1. sensor_stale
        if case.sensor_summary:
            if case.sensor_summary.get("stale"):
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="sensor_stale",
                        rule_category="Data Quality",
                        status="FLAGGED",
                        details=f"Field sensor telemetry is older than {getattr(settings, 'SENSOR_STALE_HOURS', 48)} hours.",
                    )
                )
            else:
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="sensor_stale",
                        rule_category="Data Quality",
                        status="PASSED",
                        details="Sensor telemetry is fresh.",
                    )
                )

        # 2. sensor_out_of_range
        if case.sensor_reports or (case.sensor_summary and case.sensor_summary.get("latest_values")):
            has_out_of_range = False
            for rep in (case.sensor_reports or []):
                for w in (rep.warnings or []):
                    if any(k in str(w).lower() for k in ["outside", "bound", "range"]):
                        has_out_of_range = True
                        break
                if has_out_of_range:
                    break

            if not has_out_of_range and case.sensor_readings:
                for rd in case.sensor_readings:
                    if rd.soil_moisture_pct is not None and not (15.0 <= rd.soil_moisture_pct <= 45.0):
                        has_out_of_range = True
                        break
                    if rd.temp_c is not None and not (15.0 <= rd.temp_c <= 40.0):
                        has_out_of_range = True
                        break
                    if rd.humidity_pct is not None and not (40.0 <= rd.humidity_pct <= 90.0):
                        has_out_of_range = True
                        break
                    if rd.ph is not None and not (4.5 <= rd.ph <= 8.5):
                        has_out_of_range = True
                        break

            if has_out_of_range:
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="sensor_out_of_range",
                        rule_category="Data Quality",
                        status="FLAGGED",
                        details="Sensor readings contain values outside typical expected physical/agronomic ranges.",
                    )
                )
            else:
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="sensor_out_of_range",
                        rule_category="Data Quality",
                        status="PASSED",
                        details="All sensor readings fall within expected agronomic boundaries.",
                    )
                )

        # 3. sensor_weather_conflict (sensor air temperature vs Open-Meteo differ by > 8 C)
        if case.sensor_summary and case.weather_snapshots:
            latest_dict = case.sensor_summary.get("latest") or case.sensor_summary.get("latest_values") or {}
            sensor_temp = latest_dict.get("temp_c")
            if sensor_temp is not None and len(case.weather_snapshots) > 0:
                ws = case.weather_snapshots[0]
                weather_temp = None
                if ws.raw_data and isinstance(ws.raw_data, dict) and "current" in ws.raw_data:
                    weather_temp = ws.raw_data["current"].get("temperature_2m")
                if weather_temp is None:
                    weather_temp = (ws.temp_max_c + ws.temp_min_c) / 2.0

                if weather_temp is not None:
                    diff = abs(float(sensor_temp) - float(weather_temp))
                    if diff > 8.0:
                        results.append(
                            GuardrailResult(
                                case_id=case.id,
                                rule_name="sensor_weather_conflict",
                                rule_category="Data Quality",
                                status="FLAGGED",
                                details=(
                                    f"Sensor air temperature ({sensor_temp}°C) differs from Open-Meteo temperature "
                                    f"({round(weather_temp, 1)}°C) by {round(diff, 1)}°C (>8°C)."
                                ),
                            )
                        )
                    else:
                        results.append(
                            GuardrailResult(
                                case_id=case.id,
                                rule_name="sensor_weather_conflict",
                                rule_category="Data Quality",
                                status="PASSED",
                                details=f"Sensor temperature matches Open-Meteo within 8°C (difference {round(diff, 1)}°C).",
                            )
                        )

        # 4. location_low_accuracy (> LOCATION_MAX_ACCURACY_M)
        accuracy_m = None
        if case.location_snapshot and isinstance(case.location_snapshot, dict):
            accuracy_m = case.location_snapshot.get("accuracy_m")
        if accuracy_m is None and case.field and case.field.accuracy_m:
            accuracy_m = case.field.accuracy_m

        max_acc = getattr(settings, "LOCATION_MAX_ACCURACY_M", 100.0)
        if accuracy_m is not None:
            if float(accuracy_m) > max_acc:
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="location_low_accuracy",
                        rule_category="Data Quality",
                        status="FLAGGED",
                        details=f"Field GPS location accuracy ({accuracy_m}m) exceeds maximum acceptable accuracy of {max_acc}m.",
                    )
                )
            else:
                results.append(
                    GuardrailResult(
                        case_id=case.id,
                        rule_name="location_low_accuracy",
                        rule_category="Data Quality",
                        status="PASSED",
                        details=f"Field GPS accuracy ({accuracy_m}m) is within high-accuracy limit ({max_acc}m).",
                    )
                )

        # 5. weather_unavailable
        if getattr(case, "weather_source", "none") == "none" or not case.weather_snapshots:
            results.append(
                GuardrailResult(
                    case_id=case.id,
                    rule_name="weather_unavailable",
                    rule_category="Data Quality",
                    status="FLAGGED",
                    details="Open-Meteo automated weather telemetry is unavailable; proceeding with fallback or no weather.",
                )
            )
        else:
            results.append(
                GuardrailResult(
                    case_id=case.id,
                    rule_name="weather_unavailable",
                    rule_category="Data Quality",
                    status="PASSED",
                    details="Weather snapshot successfully verified from Open-Meteo API.",
                )
            )

        # Save all guardrail results to database
        for gr in results:
            db.add(gr)
        db.commit()

        return is_blocked, results
