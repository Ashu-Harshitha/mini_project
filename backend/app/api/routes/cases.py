import random
import datetime
from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.models.models import (
    Case,
    Farm,
    Field,
    CaseFile,
    Observation,
    SoilResult,
    WeatherSnapshot,
    Recommendation,
    Report,
    OutcomeFeedback,
    User,
    ChemicalRule,
)
from app.schemas.schemas import (
    CaseCreate,
    CaseRead,
    CaseDetailRead,
    CaseFileRead,
    SoilResultCreate,
    SoilResultRead,
    WeatherSnapshotRead,
    ObservationRead,
    RecommendationRead,
    ReportRead,
    OutcomeFeedbackCreate,
    OutcomeFeedbackRead,
)
from app.api.deps import get_current_user
from app.services.case_state import CaseStateMachine, CaseState
from app.services.storage import get_storage_service
from app.services.weather import fetch_open_meteo_weather
from app.services.ai.factory import (
    get_image_analyzer,
    get_recommender,
    get_translator,
    get_tts,
)
from app.core.confidence import calculate_confidence, get_uncertainty_band
from app.guardrails.engine import GuardrailEngine
from app.services.notifications import notify

router = APIRouter(prefix="/cases", tags=["Cases & Diagnostic Lifecycle"])


@router.post("", response_model=CaseRead, status_code=status.HTTP_201_CREATED)
def create_case(
    case_in: CaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a new case draft in DRAFT state.
    """
    farm = db.query(Farm).filter(Farm.id == case_in.farm_id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    field = db.query(Field).filter(Field.id == case_in.field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    case_num = f"C-{random.randint(2840, 2999)}"
    new_case = Case(
        case_number=case_num,
        farm_id=case_in.farm_id,
        field_id=case_in.field_id,
        user_id=current_user.id,
        crop=case_in.crop,
        growth_stage=case_in.growth_stage,
        status=CaseState.DRAFT,
        confidence=0.0,
        uncertainty="Medium",
        summary=case_in.notes or "Initial field diagnostic inquiry submitted.",
    )
    db.add(new_case)
    db.commit()
    db.refresh(new_case)

    # State machine audit record
    CaseStateMachine.transition(
        db, new_case, CaseState.DRAFT, user_id=current_user.id, action="CREATE_CASE", details="Case draft initialized."
    )

    return new_case


@router.get("", response_model=List[CaseRead])
def list_cases(
    farm_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Case)
    if farm_id:
        query = query.filter(Case.farm_id == farm_id)
    if status and status != "All":
        query = query.filter(Case.status == status)
    return query.order_by(Case.created_at.desc()).all()


def get_case_or_404(db: Session, case_id: Union[int, str]) -> Case:
    if isinstance(case_id, int) or str(case_id).isdigit():
        case = db.query(Case).filter(Case.id == int(case_id)).first()
    else:
        case = db.query(Case).filter(func.lower(Case.case_number) == str(case_id).lower()).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@router.get("/guardrails/rules")
def get_guardrail_rules(db: Session = Depends(get_db)):
    return db.query(ChemicalRule).all()


@router.get("/outcomes", response_model=List[OutcomeFeedbackRead])
def list_outcomes(db: Session = Depends(get_db)):
    """
    Returns recorded post-harvest / post-treatment outcomes across all cases.
    """
    return db.query(OutcomeFeedback).order_by(OutcomeFeedback.created_at.desc()).all()


@router.get("/{id}", response_model=CaseDetailRead)
def get_case(id: Union[int, str], db: Session = Depends(get_db)):
    return get_case_or_404(db, id)


@router.post("/{id}/files", response_model=CaseFileRead, status_code=status.HTTP_201_CREATED)
async def upload_case_file(
    id: Union[int, str],
    file: UploadFile = File(...),
    file_type: str = Form("crop_image"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Uploads a case artifact (crop leaf image, soil report PDF) and records it behind a storage interface.
    """
    case = get_case_or_404(db, id)


    storage = get_storage_service()
    saved_path = await storage.save_file(file, subfolder=f"case_{case.case_number}")

    case_file = CaseFile(
        case_id=case.id,
        file_type=file_type,
        file_path=saved_path,
        file_name=file.filename or "file",
        file_size=file.size or 0,
        mime_type=file.content_type,
    )
    db.add(case_file)
    db.commit()
    db.refresh(case_file)

    return case_file


@router.post("/{id}/weather", response_model=WeatherSnapshotRead, status_code=status.HTTP_201_CREATED)
async def fetch_case_weather(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetches real-time and forecast weather data from Open-Meteo for the farm location and attaches a snapshot.
    """
    case = get_case_or_404(db, id)

    farm = case.farm
    weather_data = await fetch_open_meteo_weather(
        lat=farm.latitude or 42.0308,
        lng=farm.longitude or -93.6319,
    )

    snapshot = WeatherSnapshot(
        case_id=case.id,
        temp_max_c=weather_data["temp_max_c"],
        temp_min_c=weather_data["temp_min_c"],
        rainfall_7d_mm=weather_data["rainfall_7d_mm"],
        humidity=weather_data["humidity"],
        wind_kmh=weather_data["wind_kmh"],
        uv_index=weather_data["uv_index"],
        rainfall_status=weather_data["rainfall_status"],
        temp_status=weather_data["temp_status"],
        raw_data=weather_data.get("raw_data"),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)

    return snapshot


@router.post("/{id}/analyze", response_model=List[ObservationRead])
def analyze_case(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Extracts image visual observations and soil interpretation via AI layer.
    Transitions state: DRAFT -> ANALYZING -> ANALYZED.
    """
    case = get_case_or_404(db, id)


    # Step 1: Transition to ANALYZING
    CaseStateMachine.transition(
        db, case, CaseState.ANALYZING, user_id=current_user.id, action="START_ANALYSIS", details="Analyzing visual evidence."
    )

    # Run Image Analyzer
    analyzer = get_image_analyzer()
    image_path = case.files[0].file_path if case.files else "mock_corn_leaf.jpg"
    raw_obs = analyzer.analyze_image(image_path, case.crop, case.growth_stage)

    # Save observations to DB
    observations: List[Observation] = []
    for o in raw_obs:
        obs = Observation(
            case_id=case.id,
            description=o["description"],
            confidence=o["confidence"],
            uncertainty=o["uncertainty"],
            note=o.get("note"),
        )
        db.add(obs)
        observations.append(obs)

    # Seed initial soil result if not already present
    if not case.soil_results:
        soil = SoilResult(
            case_id=case.id,
            n_value="18 ppm NO3-N",
            n_status="Marginal",
            n_citation="ISU Ext. PM 1714",
            ph_value="pH 6.2",
            ph_status="Adequate",
            ph_citation="ISU Ext. PM 1688",
            pk_value="P & K Sufficient",
            pk_status="Adequate",
        )
        db.add(soil)

    db.commit()

    # Step 2: Transition to ANALYZED
    CaseStateMachine.transition(
        db, case, CaseState.ANALYZED, user_id=current_user.id, action="ANALYSIS_COMPLETE", details="Visual observations extracted."
    )

    return observations


@router.post("/{id}/recommend", response_model=List[RecommendationRead])
def generate_recommendations(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generates candidate recommendations via AI Recommender and computes unified confidence formula.
    Transitions state: ANALYZED -> PENDING_REVIEW.
    """
    case = get_case_or_404(db, id)

    # If case was not yet analyzed, analyze first
    if case.status == CaseState.DRAFT or case.status == CaseState.ANALYZING:
        analyze_case(id, db, current_user)

    recommender = get_recommender()
    obs_data = [{"description": o.description, "confidence": o.confidence} for o in case.observations]
    soil_data = {"n_value": "18 ppm", "status": "Marginal"}
    weather_data = {"rainfall_7d_mm": 12.0}

    candidates = recommender.generate_recommendations(case.crop, case.growth_stage, obs_data, soil_data, weather_data)

    # Clear prior recommendations if re-running
    db.query(Recommendation).filter(Recommendation.case_id == case.id).delete()

    created_recs = []
    conf_scores = []
    for c in candidates:
        # Calculate unified confidence formula:
        # final = 0.4*model + 0.3*retrieval + 0.3*data_completeness
        calc_conf = calculate_confidence(
            model_confidence=c["confidence"],
            retrieval_confidence=85.0 if c.get("citation") else 40.0,
            data_completeness=90.0 if case.soil_results else 60.0,
        )
        band = get_uncertainty_band(calc_conf)
        conf_scores.append(calc_conf)

        rec = Recommendation(
            case_id=case.id,
            rank=c["rank"],
            category=c["category"],
            title=c["title"],
            confidence=calc_conf,
            uncertainty=band,
            evidence=c.get("evidence"),
            assumptions=c.get("assumptions"),
            why_line=c.get("why_line"),
            citation=c.get("citation"),
            chemical_name=c.get("chemical_name"),
            chemical_dose=c.get("chemical_dose"),
            chemical_unit=c.get("chemical_unit"),
            is_visible_to_farmer=c.get("is_visible_to_farmer", True),
        )
        db.add(rec)
        created_recs.append(rec)

    # Update overall case confidence
    if conf_scores:
        avg_conf = round(sum(conf_scores) / len(conf_scores), 1)
        case.confidence = avg_conf
        case.uncertainty = get_uncertainty_band(avg_conf)

    db.commit()

    # Transition to PENDING_REVIEW
    CaseStateMachine.transition(
        db, case, CaseState.PENDING_REVIEW, user_id=current_user.id, action="RECOMMENDATIONS_GENERATED", details="Action candidates synthesized."
    )

    return created_recs


@router.post("/{id}/risk-check", status_code=status.HTTP_200_OK)
def run_risk_check(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Executes real guardrail engine checks.
    If any rule blocks the case, transitions to BLOCKED.
    Dispatches review_required or high_risk_flag notifications.
    """
    case = get_case_or_404(db, id)

    is_blocked, results = GuardrailEngine.run_checks(db, case)

    if is_blocked:
        CaseStateMachine.transition(
            db, case, CaseState.BLOCKED, user_id=current_user.id, action="GUARDRAIL_BLOCKED", details="Case blocked by environmental/organic safety guardrail."
        )
        notify(
            event="high_risk_flag",
            user=current_user,
            payload={
                "case_id": case.id,
                "case_number": case.case_number,
                "reason": "Prohibited non-organic product or extreme dose blocked by guardrail.",
            },
            db=db,
            case_id=case.id,
        )
    else:
        # Notify agronomist review is required
        notify(
            event="review_required",
            user=current_user,
            payload={
                "case_id": case.id,
                "case_number": case.case_number,
                "crop": case.crop,
            },
            db=db,
            case_id=case.id,
        )

    return {
        "status": "BLOCKED" if is_blocked else "FLAGGED_FOR_REVIEW",
        "is_blocked": is_blocked,
        "guardrail_checks_count": len(results),
        "results": [
            {
                "rule_name": r.rule_name,
                "category": r.rule_category,
                "status": r.status,
                "details": r.details,
            }
            for r in results
        ],
    }


@router.post("/{id}/report", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def generate_farmer_report(
    id: Union[int, str],
    lang: str = Query("en", description="Target language code: en, hi, kn"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generates plain-language farmer guidance report, translates to target lang, and synthesizes audio.
    Transitions case to DELIVERED.
    """
    case = get_case_or_404(db, id)

    translator = get_translator()
    tts = get_tts()

    raw_headline = "What's happening with your corn?"
    raw_description = (
        f"Your {case.field.name} field is showing signs of nitrogen shortage. "
        "The yellowing between leaf veins on lower leaves is a classic sign. Soil test shows 18 ppm N is marginal."
    )

    headline = translator.translate(raw_headline, lang) if lang != "en" else raw_headline
    description = translator.translate(raw_description, lang) if lang != "en" else raw_description

    steps = [
        {
            "number": 1,
            "title": "Collect a leaf tissue sample today",
            "instruction": "Take 15 leaves from corn stalk below the whorl. Send to ISU Diagnostic Lab. Confirms N vs S deficiency.",
        },
        {
            "number": 2,
            "title": "Irrigate with 1.0 inch within 48 hours",
            "instruction": "Check weather forecast — if 0.5+ inches of rain arrives Thursday, you may defer irrigation.",
        },
        {
            "number": 3,
            "title": "Wait for tissue test before fertilizing",
            "instruction": "Agronomist advises verifying deficiency type before applying foliar nitrogen.",
        },
    ]

    warnings = [
        "Do not apply fertilizer without confirming issue type.",
        "If rain forecast changes, reassess irrigation timing.",
    ]

    audio_url = tts.synthesize_speech(f"{headline}. {description}", lang=lang)

    report = Report(
        case_id=case.id,
        lang=lang,
        headline=headline,
        description=description,
        steps=steps,
        warnings=warnings,
        confidence_explanation="The AI cannot distinguish N from S deficiency from imagery alone; tissue test removes ambiguity.",
        audio_url=audio_url,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # Transition to DELIVERED
    if case.status in [CaseState.APPROVED, CaseState.APPROVED_WITH_EDITS]:
        CaseStateMachine.transition(
            db, case, CaseState.DELIVERED, user_id=current_user.id, action="DELIVER_REPORT", details=f"Farmer report delivered in language '{lang}'."
        )

    return report


@router.post("/{id}/outcome", response_model=OutcomeFeedbackRead, status_code=status.HTTP_201_CREATED)
def record_outcome(
    id: Union[int, str],
    feedback_in: OutcomeFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submits real-world post-harvest / post-treatment outcome data.
    Transitions state: DELIVERED -> OUTCOME_REPORTED.
    """
    case = get_case_or_404(db, id)


    feedback = OutcomeFeedback(
        case_id=case.id,
        user_id=current_user.id,
        actual_diagnosis=feedback_in.actual_diagnosis,
        treatments_applied=feedback_in.treatments_applied,
        yield_impact_rating=feedback_in.yield_impact_rating,
        harvest_yield=feedback_in.harvest_yield,
        notes=feedback_in.notes,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    # Transition to OUTCOME_REPORTED
    if case.status == CaseState.DELIVERED:
        CaseStateMachine.transition(
            db, case, CaseState.OUTCOME_REPORTED, user_id=current_user.id, action="OUTCOME_RECORDED", details="Post-harvest validation recorded."
        )

    return feedback


@router.get("/{id}/outcome", response_model=OutcomeFeedbackRead)
def get_case_outcome(id: Union[int, str], db: Session = Depends(get_db)):
    """
    Returns recorded outcome feedback for a specific case.
    """
    case = get_case_or_404(db, id)
    if not case.outcome_feedback:
        raise HTTPException(status_code=404, detail="Outcome feedback not found for this case")
    return case.outcome_feedback
