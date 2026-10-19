import logging
import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.models import (
    Case,
    Observation,
    SoilResult,
    WeatherSnapshot,
    Recommendation,
    GuardrailResult,
    User,
)
from app.services.case_state import CaseStateMachine, CaseState
from app.services.ai.factory import (
    get_image_analyzer,
    get_recommender,
    get_retriever,
)
from app.services.weather import fetch_open_meteo_weather
from app.services.soil_parser import parse_soil_pdf
from app.guardrails.engine import GuardrailEngine
from app.services.assignment import assign_case
from app.services.notifications import notify

logger = logging.getLogger("agriadvisor.pipeline")


def run_case_pipeline(case_id: int, user_id: Optional[int] = None, db: Optional[Session] = None):
    """
    Executes the diagnostic AI pipeline for a submitted case:
    1. analyze (ImageAnalyzer for images, Soil PDF parser for soil reports, weather)
    2. recommend (Recommender synthesis: issue_label, issue_category, ranked candidates)
    3. risk-check (GuardrailEngine checks)
    4. transitions to PENDING_REVIEW and calls assign_case
    On QuotaExceededError or any AI failure:
    - Sets ai_degraded = True
    - Adds risk flag "AI analysis unavailable - manual expert review"
    - Still moves to PENDING_REVIEW and calls assign_case
    - Farmer is never blocked
    """
    session = db or SessionLocal()
    should_close = (db is None)

    try:
        case = session.query(Case).filter(Case.id == case_id).first()
        if not case:
            logger.error(f"Pipeline error: Case {case_id} not found.")
            return

        try:
            # --------------------------------------------------
            # STEP 1: ANALYZE (Images, Soil, Weather)
            # --------------------------------------------------
            # Check for image files
            image_files = [f for f in case.files if f.file_type in ("crop_image", "leaf_macro", "image")]
            observations_data: List[Dict[str, Any]] = []

            if image_files:
                analyzer = get_image_analyzer()
                first_img = image_files[0].file_path
                analysis_res = analyzer.analyze_image(
                    file_path=first_img,
                    crop=case.crop,
                    growth_stage=case.growth_stage,
                    case_id=case.id,
                    field_id=case.field_id,
                    farmer_description=case.description,
                    db=session,
                )

                # Clear previous observations if any
                session.query(Observation).filter(Observation.case_id == case.id).delete()

                raw_obs = analysis_res.get("observations", []) if isinstance(analysis_res, dict) else analysis_res
                for o in raw_obs:
                    obs_text = o.get("text") or o.get("description") or "Visual observation"
                    obs_conf = float(o.get("confidence", 80.0))
                    obs_unc = o.get("uncertainty") or ("Low" if obs_conf >= 80 else "Medium" if obs_conf >= 60 else "High")
                    obs_record = Observation(
                        case_id=case.id,
                        description=obs_text,
                        confidence=obs_conf,
                        uncertainty=obs_unc,
                        note=o.get("note"),
                    )
                    session.add(obs_record)
                    observations_data.append({"description": obs_text, "text": obs_text, "confidence": obs_conf, "note": o.get("note")})

                if isinstance(analysis_res, dict):
                    if analysis_res.get("uncertainty_level"):
                        case.uncertainty = analysis_res["uncertainty_level"]
                    if analysis_res.get("issue_hint"):
                        case.issue_category = analysis_res["issue_hint"]
            else:
                logger.info(f"Case {case.case_number} has no image files. ImageAnalyzer skipped.")

            # Check for soil reports (PDF)
            soil_files = [f for f in case.files if f.file_type in ("soil_report", "soil_pdf", "pdf")]
            if soil_files:
                soil_file_path = soil_files[0].file_path
                parsed_soil = parse_soil_pdf(soil_file_path, case_id=case.id, db=session)
                
                # Upsert SoilResult
                soil_record = session.query(SoilResult).filter(SoilResult.case_id == case.id).first()
                if not soil_record:
                    soil_record = SoilResult(case_id=case.id, n_value="Extracted from report")
                    session.add(soil_record)
                
                soil_record.n_ppm = parsed_soil.n_ppm
                soil_record.p_ppm = parsed_soil.p_ppm
                soil_record.k_ppm = parsed_soil.k_ppm
                soil_record.ph = parsed_soil.ph
                soil_record.sample_date = parsed_soil.sample_date
                soil_record.needs_confirmation = parsed_soil.needs_confirmation
                if parsed_soil.n_ppm is not None:
                    soil_record.n_value = f"{parsed_soil.n_ppm:.1f} ppm NO3-N"
                if parsed_soil.ph is not None:
                    soil_record.ph_value = f"pH {parsed_soil.ph:.1f}"
            elif not case.soil_results:
                # Default baseline soil result if none attached
                default_soil = SoilResult(
                    case_id=case.id,
                    n_value="18 ppm NO3-N",
                    n_status="Marginal",
                    n_citation="ISU Ext. PM 1714",
                    ph_value="pH 6.2",
                    ph_status="Adequate",
                    ph_citation="ISU Ext. PM 1688",
                    pk_value="P & K Sufficient",
                    pk_status="Adequate",
                    n_ppm=18.0,
                    p_ppm=24.0,
                    k_ppm=170.0,
                    ph=6.2,
                    needs_confirmation=False,
                )
                session.add(default_soil)

            # Weather Snapshot
            weather_dict = {}
            if not case.weather_snapshots:
                lat = None
                lng = None
                if case.location_snapshot and isinstance(case.location_snapshot, dict):
                    lat = case.location_snapshot.get("lat")
                    lng = case.location_snapshot.get("lng")
                if lat is None and case.field and case.field.lat is not None:
                    lat = case.field.lat
                    lng = case.field.lng
                if lat is None and case.farm:
                    lat = case.farm.latitude or 42.0308
                    lng = case.farm.longitude or -93.6319

                if lat is not None and lng is not None:
                    try:
                        import asyncio
                        weather_res = asyncio.run(fetch_open_meteo_weather(lat=lat, lng=lng))
                        if weather_res:
                            case.weather_source = "api"
                            snap = WeatherSnapshot(
                                case_id=case.id,
                                temp_max_c=weather_res.get("temp_max_c", 28.0),
                                temp_min_c=weather_res.get("temp_min_c", 16.0),
                                rainfall_7d_mm=weather_res.get("rainfall_7d_mm", 12.0),
                                humidity=weather_res.get("humidity", 65.0),
                                wind_kmh=weather_res.get("wind_kmh", 15.0),
                                uv_index=weather_res.get("uv_index", 6.0),
                                rainfall_status=weather_res.get("rainfall_status", "Below Average"),
                                temp_status=weather_res.get("temp_status", "Optimal"),
                                lat=weather_res.get("lat", lat),
                                lng=weather_res.get("lng", lng),
                                fetched_at=datetime.datetime.now(datetime.timezone.utc),
                                source="open-meteo",
                                raw_data=weather_res.get("raw_data"),
                            )
                            session.add(snap)
                            weather_dict = weather_res
                        else:
                            case.weather_source = "none"
                            logger.warning(f"Live weather fetch returned None for case {case.id}.")
                    except Exception as w_err:
                        case.weather_source = "none"
                        logger.warning(f"Could not fetch live weather: {w_err}. Proceeding without weather.")
            elif case.weather_snapshots:
                ws = case.weather_snapshots[0]
                weather_dict = {
                    "temp_max_c": ws.temp_max_c,
                    "temp_min_c": ws.temp_min_c,
                    "rainfall_7d_mm": ws.rainfall_7d_mm,
                    "humidity": ws.humidity,
                    "wind_kmh": ws.wind_kmh,
                }

            session.commit()

            # --------------------------------------------------
            # STEP 2: RECOMMEND
            # --------------------------------------------------
            recommender = get_recommender()
            retriever = get_retriever()

            current_soil = session.query(SoilResult).filter(SoilResult.case_id == case.id).first()
            soil_payload = {}
            if current_soil:
                soil_payload = {
                    "n_value": current_soil.n_value,
                    "n_ppm": current_soil.n_ppm,
                    "p_ppm": current_soil.p_ppm,
                    "k_ppm": current_soil.k_ppm,
                    "ph": current_soil.ph,
                    "needs_confirmation": current_soil.needs_confirmation,
                }

            field_obj = case.field
            farm_obj = case.farm
            field_profile = {
                "field_id": case.field_id,
                "crop": case.crop,
                "growth_stage": case.growth_stage,
                "soil_type": getattr(field_obj, "soil_type", "Loam") if field_obj else "Loam",
                "irrigation_system": getattr(farm_obj, "irrigation_system", "Center pivot") if farm_obj else "Center pivot",
                "is_organic": getattr(farm_obj, "is_organic", False) if farm_obj else False,
            }

            # Evaluate sensor summary & interpretation
            sensor_interpretation = []
            if case.sensor_summary:
                try:
                    from app.sensors.interpret import interpret_sensor_data
                    sensor_interpretation = interpret_sensor_data(case.sensor_summary, crop=case.crop)
                except Exception as interp_err:
                    logger.warning(f"Sensor interpretation error: {interp_err}")

            rec_output = recommender.generate_recommendations(
                crop=case.crop,
                growth_stage=case.growth_stage,
                observations=observations_data,
                soil_data=soil_payload,
                weather_data=weather_dict,
                case_id=case.id,
                farmer_description=case.description,
                farmer_language=case.description_lang or "en",
                field_profile=field_profile,
                retriever=retriever,
                db=session,
                sensor_summary=case.sensor_summary,
                interpretation=sensor_interpretation,
            )

            # Persist issue_label, issue_category, confidence
            if isinstance(rec_output, dict):
                if rec_output.get("issue_label"):
                    case.issue_label = rec_output["issue_label"]
                if rec_output.get("issue_category"):
                    case.issue_category = rec_output["issue_category"]
                if rec_output.get("confidence") is not None:
                    case.confidence = rec_output["confidence"]
                if rec_output.get("uncertainty"):
                    case.uncertainty = rec_output["uncertainty"]

                rec_candidates = rec_output.get("recommendations", [])
            else:
                rec_candidates = rec_output

            # Delete old recommendations and persist new ranked ones
            session.query(Recommendation).filter(Recommendation.case_id == case.id).delete()

            for item in rec_candidates:
                rec_record = Recommendation(
                    case_id=case.id,
                    rank=item.get("rank", 1),
                    category=item.get("category", "Crop"),
                    title=item.get("action") or item.get("title") or "Recommended Action",
                    confidence=float(item.get("confidence", 75.0)),
                    uncertainty=item.get("uncertainty", "Medium"),
                    evidence=item.get("evidence"),
                    assumptions=item.get("assumptions"),
                    why=item.get("why"),
                    why_line=item.get("why_line") or (f"Why: {item.get('why')}" if item.get("why") else None),
                    citation=item.get("citation"),
                    chunk_ids=item.get("chunk_ids", []),
                    is_visible_to_farmer=item.get("is_visible_to_farmer", True),
                    chemical_name=item.get("chemical_name"),
                    chemical_dose=item.get("chemical_dose"),
                    chemical_unit=item.get("chemical_unit"),
                )
                session.add(rec_record)

            session.commit()

            # --------------------------------------------------
            # STEP 3: RISK-CHECK (Guardrails)
            # --------------------------------------------------
            is_blocked, results = GuardrailEngine.run_checks(session, case)
            if is_blocked:
                blocked_reason = next((r.details for r in results if r.status == "BLOCKED"), "Safety violation detected.")
                try:
                    CaseStateMachine.transition(
                        session, case, CaseState.BLOCKED, user_id=user_id or case.user_id, action="GUARDRAILS_BLOCKED", details=blocked_reason
                    )
                except Exception:
                    case.status = CaseState.BLOCKED
                session.commit()

                # Notify admins
                admins = session.query(User).filter(User.role == "admin", User.active == True).all()
                for adm in admins:
                    notify(
                        "high_risk_flag",
                        adm,
                        {"case_number": case.case_number, "reason": blocked_reason, "case_id": case.id},
                        session,
                        case_id=case.id,
                    )
                return

            # --------------------------------------------------
            # STEP 4: PENDING_REVIEW & ASSIGN
            # --------------------------------------------------
            try:
                CaseStateMachine.transition(
                    session, case, CaseState.PENDING_REVIEW, user_id=user_id or case.user_id, action="PIPELINE_SUCCESS", details="AI analysis complete."
                )
            except Exception:
                case.status = CaseState.PENDING_REVIEW
            session.commit()

            # Assign case to eligible agronomist
            assign_case(case.id, session, reason="auto")
            logger.info(f"Pipeline completed successfully for Case {case.case_number}. Assigned.")

        except Exception as ai_err:
            # --------------------------------------------------
            # DEGRADED FAILOVER: QuotaExceededError or any AI Failure
            # --------------------------------------------------
            logger.error(f"AI Pipeline failed for Case {case.case_number}: {ai_err}. Applying degraded mode failover.", exc_info=True)
            case.ai_degraded = True

            # Add the risk flag
            flag_record = GuardrailResult(
                case_id=case.id,
                rule_name="ai_availability",
                rule_category="System",
                status="FLAGGED",
                details="AI analysis unavailable - manual expert review",
            )
            session.add(flag_record)

            # Move to PENDING_REVIEW without blocking the farmer
            try:
                CaseStateMachine.transition(
                    session, case, CaseState.PENDING_REVIEW, user_id=user_id or case.user_id, action="AI_DEGRADED_FAILOVER", details="AI degraded. Moved to manual review."
                )
            except Exception:
                case.status = CaseState.PENDING_REVIEW

            session.commit()

            # Still assign case to an agronomist
            try:
                assign_case(case.id, session, reason="auto")
            except Exception as assign_err:
                logger.error(f"Assignment failed during degraded failover for Case {case.case_number}: {assign_err}")

    finally:
        if should_close:
            session.close()
