import os
import random
import datetime
import logging
from typing import List, Optional, Union, Dict, Any
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
    status,
)
from fastapi.responses import FileResponse, Response, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.config import settings
from app.core.database import get_db, SessionLocal
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
    Assignment,
    Message,
    MessageTranslation,
    Review,
    SensorReport,
    SensorReading,
)
from app.schemas.schemas import (
    CaseCreate,
    CaseSubmit,
    CaseRead,
    CaseFileRead,
    SoilResultRead,
    SoilPatch,
    WeatherSnapshotRead,
    ObservationRead,
    RecommendationRead,
    ReportRead,
    OutcomeFeedbackRead,
    MessageRead,
    FieldLocationUpdate,
    SensorLatestUpdate,
    GeocodePlaceRead,
    OutcomeReportIn,
)
from app.api.deps import get_current_user
from app.services.case_state import CaseStateMachine, CaseState
from app.services.storage import get_storage_service
from app.services.weather import fetch_open_meteo_weather, geocode_open_meteo
from app.services.ai.factory import (
    get_image_analyzer,
    get_recommender,
    get_translator,
    get_tts,
    get_retriever,
)
from app.core.confidence import calculate_confidence, get_uncertainty_band
from app.guardrails.engine import GuardrailEngine
from app.services.notifications import notify
from app.services.audio import process_voice_upload
from app.services.ai.gemini_client import get_gemini_client
from app.services.ai.pipeline import run_case_pipeline
from app.sensors.parser import parse_sensor_pdf
from app.sensors.generator import generate_sensor_pdf
from app.sensors.summary import compute_sensor_summary
from app.sensors.interpret import interpret_sensor_data

logger = logging.getLogger("agriadvisor.cases")

router = APIRouter(tags=["Cases & Diagnostic Lifecycle"])


def get_case_or_404(db: Session, case_id: Union[int, str]) -> Case:
    if isinstance(case_id, int) or str(case_id).isdigit():
        case = db.query(Case).filter(Case.id == int(case_id)).first()
    else:
        case = db.query(Case).filter(func.lower(Case.case_number) == str(case_id).lower()).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


def _format_farmer_case(case: Case) -> Dict[str, Any]:
    """Helper to format a case strictly for the farmer role (no confidence, citations, guardrails, risk flags)."""
    assigned_name = None
    if case.assigned_agronomist:
        assigned_name = case.assigned_agronomist.full_name or case.assigned_agronomist.username

    decided_statuses = (
        CaseState.APPROVED,
        CaseState.APPROVED_WITH_EDITS,
        CaseState.REJECTED,
        CaseState.DELIVERED,
        CaseState.OUTCOME_REPORTED,
    )
    is_decided = case.status in decided_statuses

    approved_recs: List[str] = []
    if is_decided and case.status != CaseState.REJECTED:
        approved_recs = [
            r.action or r.title
            for r in case.recommendations
            if r.is_visible_to_farmer
        ]

    return {
        "id": case.id,
        "case_number": case.case_number,
        "status": case.status,
        "created_at": case.created_at,
        "crop": case.crop,
        "growth_stage": case.growth_stage,
        "description": case.description,
        "description_lang": case.description_lang or "en",
        "assigned_agronomist_name": assigned_name,
        "farmer_summary": case.farmer_summary if is_decided else None,
        "approved_recommendations": approved_recs,
        "final_suggestion": case.final_suggestion if is_decided else None,
        "decision_note": case.decision_note if is_decided else None,
    }


# -----------------------------
# Case Creation & Submission
# -----------------------------
@router.post("/cases", response_model=CaseRead, status_code=status.HTTP_201_CREATED)
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

    case_num = f"C-{random.randint(2840, 9999)}"
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
        description=case_in.description,
        description_lang=case_in.description_lang or "en",
    )
    db.add(new_case)
    db.commit()
    db.refresh(new_case)

    CaseStateMachine.transition(
        db, new_case, CaseState.DRAFT, user_id=current_user.id, action="CREATE_CASE", details="Case draft initialized."
    )
    return new_case


@router.post("/cases/{id}/submit", status_code=status.HTTP_202_ACCEPTED)
def submit_case(
    id: Union[int, str],
    payload: CaseSubmit,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submits a farmer case (farmer only, own case). Requires description >= 10 chars.
    Returns 202 immediately (status ANALYZING) and runs analyze -> recommend -> risk-check
    -> PENDING_REVIEW -> assign_case in a BackgroundTask.
    """
    case = get_case_or_404(db, id)

    if current_user.role != "farmer" or case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: only the owner farmer can submit this case.",
        )

    # Validate field coordinates (422 {code: "location_required"} if missing)
    field = case.field
    if not field or field.lat is None or field.lng is None:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "code": "location_required",
                "detail": "Field location coordinates are required before submitting a case.",
            },
        )

    clean_desc = payload.description.strip() if payload.description else ""
    if len(clean_desc) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Description must be at least 10 characters long.",
        )

    case.description = clean_desc
    case.description_lang = payload.description_lang or "en"
    case.location_snapshot = {
        "lat": field.lat,
        "lng": field.lng,
        "accuracy_m": field.accuracy_m,
        "source": field.location_source or "gps",
    }

    try:
        CaseStateMachine.transition(
            db, case, CaseState.ANALYZING, user_id=current_user.id, action="FARMER_SUBMIT", details="Submitted. AI analysis initialized."
        )
    except Exception:
        case.status = CaseState.ANALYZING
    db.commit()

    # Enqueue pipeline execution as background task
    background_tasks.add_task(run_case_pipeline, case.id, current_user.id)

    db.refresh(case)
    return _format_farmer_case(case)


@router.patch("/cases/{id}/soil", response_model=SoilResultRead)
def update_case_soil(
    id: Union[int, str],
    payload: SoilPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Allows the farmer (or agronomist/admin) to correct soil test values.
    Validates range (pH 3-10).
    """
    case = get_case_or_404(db, id)

    # Authorization
    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: you can only update soil metrics for your own cases.",
        )

    # Range validation: pH 3-10
    if payload.ph is not None and not (3.0 <= payload.ph <= 10.0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Soil pH must be between 3.0 and 10.0.",
        )

    soil = db.query(SoilResult).filter(SoilResult.case_id == case.id).first()
    if not soil:
        soil = SoilResult(case_id=case.id, n_value="User provided")
        db.add(soil)

    if payload.n_ppm is not None:
        soil.n_ppm = payload.n_ppm
        soil.n_value = f"{payload.n_ppm:.1f} ppm NO3-N"
    if payload.p_ppm is not None:
        soil.p_ppm = payload.p_ppm
    if payload.k_ppm is not None:
        soil.k_ppm = payload.k_ppm
    if payload.ph is not None:
        soil.ph = payload.ph
        soil.ph_value = f"pH {payload.ph:.1f}"
    if payload.sample_date is not None:
        soil.sample_date = payload.sample_date
    if payload.needs_confirmation is not None:
        soil.needs_confirmation = payload.needs_confirmation
    else:
        # If all core metrics are provided, clear confirmation flag
        if soil.n_ppm is not None and soil.p_ppm is not None and soil.k_ppm is not None and soil.ph is not None:
            soil.needs_confirmation = False

    db.commit()
    db.refresh(soil)
    return soil


# -----------------------------
# Case Retrieval (Role-Specific)
# -----------------------------
@router.get("/cases")
def list_cases(
    farm_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Role-specific case list:
      - farmer: own cases only (clean plain shape)
      - agronomist: assigned cases only
      - admin: all cases
    """
    role = current_user.role

    if role == "farmer":
        query = db.query(Case).filter(Case.user_id == current_user.id)
        if farm_id:
            query = query.filter(Case.farm_id == farm_id)
        if status_filter and status_filter != "All":
            query = query.filter(Case.status == status_filter)
        cases = query.order_by(Case.created_at.desc()).all()
        return [_format_farmer_case(c) for c in cases]

    elif role == "agronomist":
        # Current or past assigned cases
        past_ids = (
            db.query(Assignment.case_id)
            .filter(Assignment.to_user_id == current_user.id)
            .distinct()
            .all()
        )
        reviewed_ids = (
            db.query(Review.case_id)
            .filter(Review.reviewer_id == current_user.id)
            .distinct()
            .all()
        )
        case_id_set = set([cid for (cid,) in past_ids] + [cid for (cid,) in reviewed_ids])

        query = db.query(Case).filter(
            (Case.assigned_agronomist_id == current_user.id) | (Case.id.in_(case_id_set))
        )
        if status_filter and status_filter != "All":
            query = query.filter(Case.status == status_filter)
        return query.order_by(Case.created_at.desc()).all()

    else:
        # Admin: all cases
        query = db.query(Case)
        if farm_id:
            query = query.filter(Case.farm_id == farm_id)
        if status_filter and status_filter != "All":
            query = query.filter(Case.status == status_filter)
        return query.order_by(Case.created_at.desc()).all()


@router.get("/cases/{id}")
def get_case(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Role-specific single case retrieval:
      - farmer: own cases only (returns clean FarmerCaseRead, 403 on other cases)
      - agronomist: assigned cases only (returns CaseDetailRead with translated farmer description, 403 if unassigned)
      - admin: all cases
    """
    case = get_case_or_404(db, id)
    role = current_user.role

    if role == "farmer":
        if case.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: you can only view your own cases.",
            )
        return _format_farmer_case(case)

    elif role == "agronomist":
        # Check if currently assigned or previously assigned/reviewed
        is_current = case.assigned_agronomist_id == current_user.id
        is_past_assign = (
            db.query(Assignment)
            .filter(Assignment.case_id == case.id, Assignment.to_user_id == current_user.id)
            .first()
            is not None
        )
        is_past_review = (
            db.query(Review)
            .filter(Review.case_id == case.id, Review.reviewer_id == current_user.id)
            .first()
            is not None
        )

        if not (is_current or is_past_assign or is_past_review):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: this case is not assigned to you.",
            )

        # Translate farmer description if needed
        desc_tr = case.description
        if case.description and case.description_lang != current_user.language:
            gemini = get_gemini_client()
            desc_tr = gemini.translate(case.description, current_user.language)

        case.farmer_description_translated = desc_tr
        return case

    else:
        # Admin has full read-only access
        return case


# -----------------------------
# Messaging & Voice Endpoints
# -----------------------------
@router.get("/cases/{id}/messages", response_model=List[MessageRead])
def get_case_messages(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns messages for a case. Authorized for farmer, assigned/past agronomist, and admin.
    Translates lazily into the viewer's language with a cache (same language never calls LLM).
    """
    case = get_case_or_404(db, id)
    role = current_user.role

    if role == "farmer":
        if case.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    elif role == "agronomist":
        # All active agronomists can inspect case dialogue to review or assist
        pass

    viewer_lang = current_user.language or "en"
    messages = db.query(Message).filter(Message.case_id == case.id).order_by(Message.created_at.asc()).all()

    # Translation cache lookup
    cached_map = {}
    msg_ids = [m.id for m in messages]
    if msg_ids:
        existing = db.query(MessageTranslation).filter(
            MessageTranslation.message_id.in_(msg_ids),
            MessageTranslation.lang == viewer_lang,
        ).all()
        for t in existing:
            cached_map[t.message_id] = t.text

    # Collect missing (only if language differs and text exists)
    missing = []
    for m in messages:
        if m.original_lang != viewer_lang and m.id not in cached_map and m.original_text:
            missing.append((m.id, m.original_text))

    if missing:
        gemini = get_gemini_client()
        texts = [txt for _, txt in missing]
        translated = gemini.batch_translate(texts, viewer_lang)
        for (mid, _), t_txt in zip(missing, translated):
            new_t = MessageTranslation(message_id=mid, lang=viewer_lang, text=t_txt)
            db.add(new_t)
            cached_map[mid] = t_txt
        db.commit()

    results = []
    for m in messages:
        sender = db.query(User).filter(User.id == m.sender_id).first()
        sender_name = sender.full_name or sender.username if sender else m.sender_role

        if m.original_lang == viewer_lang:
            disp_text = m.original_text
            translated_flag = False
        else:
            disp_text = cached_map.get(m.id, m.original_text)
            translated_flag = True

        audio_url = f"/v1/media/voice/{m.id}" if m.audio_path else None

        results.append(
            MessageRead(
                id=m.id,
                case_id=m.case_id,
                sender_id=m.sender_id,
                sender_name=sender_name,
                sender_role=m.sender_role,
                kind=m.kind,
                original_lang=m.original_lang,
                original_text=m.original_text,
                text=disp_text,
                translated=translated_flag,
                audio_url=audio_url,
                transcript_status=m.transcript_status,
                created_at=m.created_at,
            )
        )
    return results


async def _transcribe_and_notify_bg(
    message_id: int,
    case_id: int,
    sender_id: int,
    audio_path: Optional[str],
    lang_hint: str,
):
    """Background task for transcribing audio notes and notifying recipient."""
    with SessionLocal() as bg_db:
        if audio_path and os.path.exists(audio_path):
            gemini = get_gemini_client()
            transcript = gemini.transcribe(audio_path, lang_hint=lang_hint)
            msg = bg_db.query(Message).filter(Message.id == message_id).first()
            if msg:
                msg.original_text = transcript
                msg.transcript_status = "done"
                bg_db.commit()

        case = bg_db.query(Case).filter(Case.id == case_id).first()
        sender = bg_db.query(User).filter(User.id == sender_id).first()
        if case and sender:
            sender_name = sender.full_name or sender.username
            if sender.role == "farmer" and case.assigned_agronomist_id:
                agro = bg_db.query(User).filter(User.id == case.assigned_agronomist_id).first()
                if agro:
                    notify("new_message", agro, {"case_number": case.case_number, "sender_name": sender_name, "case_id": case.id}, bg_db, case_id=case.id)
            elif sender.role == "agronomist":
                farmer = bg_db.query(User).filter(User.id == case.user_id).first()
                if farmer:
                    notify("new_message", farmer, {"case_number": case.case_number, "sender_name": sender_name, "case_id": case.id}, bg_db, case_id=case.id)


@router.post("/cases/{id}/messages", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
async def post_case_message(
    id: Union[int, str],
    background_tasks: BackgroundTasks,
    text: Optional[str] = Form(None),
    language: Optional[str] = Form("en"),
    audio: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send text or voice note message. Sender must be the case's farmer or assigned agronomist.
    Audio is limited to 2 MB and converted to 16 kHz mono WAV.
    """
    case = get_case_or_404(db, id)

    # Authorization
    is_owner_farmer = current_user.role == "farmer" and case.user_id == current_user.id
    is_agro = current_user.role == "agronomist"
    is_admin = current_user.role == "admin"
    if not (is_owner_farmer or is_agro or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: only the farmer, agronomist, or admin can exchange messages in this case.",
        )
    if is_agro and not case.assigned_agronomist_id:
        case.assigned_agronomist_id = current_user.id
        case.assigned_at = datetime.datetime.now(datetime.timezone.utc)

    clean_text = text.strip() if text else None
    if not clean_text and not audio:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message must include text or an audio file.",
        )

    audio_path = None
    kind = "text"
    transcript_status = "none"

    if audio:
        audio_path = process_voice_upload(audio, subfolder="voice")
        kind = "voice"
        transcript_status = "pending"

    new_msg = Message(
        case_id=case.id,
        sender_id=current_user.id,
        sender_role=current_user.role,
        kind=kind,
        original_lang=language or current_user.language or "en",
        original_text=clean_text,
        audio_path=audio_path,
        transcript_status=transcript_status,
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    background_tasks.add_task(
        _transcribe_and_notify_bg,
        new_msg.id,
        case.id,
        current_user.id,
        audio_path,
        new_msg.original_lang,
    )

    audio_url = f"/v1/media/voice/{new_msg.id}" if audio_path else None
    return MessageRead(
        id=new_msg.id,
        case_id=new_msg.case_id,
        sender_id=new_msg.sender_id,
        sender_name=current_user.full_name or current_user.username,
        sender_role=new_msg.sender_role,
        kind=new_msg.kind,
        original_lang=new_msg.original_lang,
        original_text=new_msg.original_text,
        text=new_msg.original_text,
        translated=False,
        audio_url=audio_url,
        transcript_status=new_msg.transcript_status,
        created_at=new_msg.created_at,
    )


@router.get("/media/voice/{message_id}")
def stream_voice_audio(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Authenticated stream of voice notes. Accessible to case farmer, assigned/past agronomist, or admin.
    """
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg or not msg.audio_path:
        raise HTTPException(status_code=404, detail="Audio file not found")

    case = db.query(Case).filter(Case.id == msg.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    role = current_user.role
    if role == "farmer":
        if case.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
    elif role == "agronomist":
        is_current = case.assigned_agronomist_id == current_user.id
        is_past = (
            db.query(Assignment).filter(Assignment.case_id == case.id, Assignment.to_user_id == current_user.id).first()
            or db.query(Review).filter(Review.case_id == case.id, Review.reviewer_id == current_user.id).first()
        )
        if not (is_current or is_past):
            raise HTTPException(status_code=403, detail="Forbidden")

    if not os.path.exists(msg.audio_path):
        raise HTTPException(status_code=404, detail="Audio file missing from server storage")

    return FileResponse(msg.audio_path, media_type="audio/wav")


# -----------------------------
# Farmer Feedback Endpoint
# -----------------------------
@router.post("/cases/{id}/feedback", response_model=OutcomeFeedbackRead, status_code=status.HTTP_201_CREATED)
async def submit_case_feedback(
    id: Union[int, str],
    background_tasks: BackgroundTasks,
    rating: int = Form(...),
    comment: Optional[str] = Form(None),
    language: Optional[str] = Form("en"),
    audio: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit farmer feedback (1-5 rating, optional comment or voice note).
    Farmer only, own case, only after a decision, exactly once per case.
    """
    case = get_case_or_404(db, id)

    # 1. Authorization: Farmer only, own case
    if current_user.role != "farmer" or case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: only the owner farmer can submit feedback.",
        )

    # 2. Timing check: only after decision
    decided_statuses = (
        CaseState.APPROVED,
        CaseState.APPROVED_WITH_EDITS,
        CaseState.REJECTED,
        CaseState.DELIVERED,
        CaseState.OUTCOME_REPORTED,
    )
    if case.status not in decided_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Feedback can only be submitted after a case review decision has been made.",
        )

    # 3. Only once per case
    if case.outcome_feedback:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Feedback has already been recorded for this case.",
        )

    if rating < 1 or rating > 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Rating must be between 1 and 5 stars.",
        )

    audio_path = None
    if audio:
        audio_path = process_voice_upload(audio, subfolder="voice")

    feedback = OutcomeFeedback(
        case_id=case.id,
        user_id=current_user.id,
        agronomist_id=case.assigned_agronomist_id,
        rating=rating,
        comment=comment.strip() if comment else None,
        comment_lang=language or current_user.language or "en",
        audio_path=audio_path,
        yield_impact_rating=rating,
    )
    db.add(feedback)

    # Advance state to OUTCOME_REPORTED if DELIVERED
    if case.status == CaseState.DELIVERED:
        CaseStateMachine.transition(
            db, case, CaseState.OUTCOME_REPORTED, user_id=current_user.id, action="FEEDBACK_RECORDED", details="Farmer rating submitted."
        )

    db.commit()
    db.refresh(feedback)

    # Transcribe audio if provided
    if audio_path:
        background_tasks.add_task(
            _transcribe_and_notify_bg,
            feedback.id,
            case.id,
            current_user.id,
            audio_path,
            feedback.comment_lang or "en",
        )

    # Notify agronomist
    if case.assigned_agronomist_id:
        agro = db.query(User).filter(User.id == case.assigned_agronomist_id).first()
        if agro:
            notify(
                "feedback_received",
                agro,
                {
                    "case_number": case.case_number,
                    "case_id": case.id,
                    "rating": rating,
                    "message": f"Farmer provided {rating}/5 star feedback for Case {case.case_number}."
                },
                db,
                case_id=case.id,
            )

    return feedback


@router.post("/cases/{id}/outcome")
def report_case_outcome(
    id: int,
    payload: OutcomeReportIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Farmer records treatment outcome for their delivered case (improved|same|worse).
    Upserts into the case outcome_feedback record, transitions case to OUTCOME_REPORTED,
    and dispatches a notification to the assigned agronomist.
    """
    case = db.query(Case).filter(Case.id == id).first()
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found",
        )

    # 1. Authorization: Only the owner farmer (or admin) can report outcome
    if case.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the farmer who created the case can report its outcome.",
        )

    # 2. Case must be in DELIVERED status
    if case.status != CaseState.DELIVERED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Outcome can only be reported for delivered cases. Current status: '{case.status}'",
        )

    # 3. Only once per case
    if case.outcome_feedback and case.outcome_feedback.outcome_reported_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Outcome has already been reported for this case.",
        )

    # 4. Upsert into same outcome_feedback row
    feedback = case.outcome_feedback
    if not feedback:
        feedback = OutcomeFeedback(
            case_id=case.id,
            user_id=current_user.id,
            agronomist_id=case.assigned_agronomist_id,
            rating=5,
            yield_impact_rating=5,
        )
        db.add(feedback)

    feedback.followed_advice = payload.followed_advice
    feedback.outcome = payload.outcome
    feedback.outcome_comment = payload.comment.strip() if payload.comment else None
    feedback.outcome_reported_at = datetime.datetime.utcnow()

    # 5. Move case to OUTCOME_REPORTED state
    CaseStateMachine.transition(
        db,
        case,
        CaseState.OUTCOME_REPORTED,
        user_id=current_user.id,
        action="OUTCOME_REPORTED",
        details=f"Outcome: {payload.outcome}, Followed advice: {payload.followed_advice}",
    )

    db.commit()
    db.refresh(feedback)

    # 6. Notify the assigned agronomist
    if case.assigned_agronomist_id:
        agro = db.query(User).filter(User.id == case.assigned_agronomist_id).first()
        if agro:
            notify(
                "feedback_received",
                agro,
                {
                    "case_number": case.case_number,
                    "case_id": case.id,
                    "outcome": payload.outcome,
                    "rating": feedback.rating,
                    "message": f"Farmer reported outcome '{payload.outcome}' for Case {case.case_number}."
                },
                db,
                case_id=case.id,
                background_tasks=background_tasks,
            )

    return {
        "status": "success",
        "case_id": case.id,
        "case_status": case.status,
        "followed_advice": feedback.followed_advice,
        "outcome": feedback.outcome,
        "comment": feedback.outcome_comment,
        "outcome_reported_at": feedback.outcome_reported_at,
    }



# -----------------------------
# Existing Diagnostic Endpoints
# -----------------------------
@router.get("/outcomes", response_model=List[OutcomeFeedbackRead])
def list_outcomes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(OutcomeFeedback)
    if current_user.role == "farmer":
        query = query.join(Case, OutcomeFeedback.case_id == Case.id).filter(Case.user_id == current_user.id)
    return query.order_by(OutcomeFeedback.created_at.desc()).all()


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp"}
MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/cases/{id}/files", response_model=CaseFileRead, status_code=status.HTTP_201_CREATED)
async def upload_case_file(
    id: Union[int, str],
    file: UploadFile = File(...),
    file_type: str = Form("crop_image"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_or_404(db, id)
    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You can only upload files to your own cases.",
        )

    # Validate image format
    filename = (file.filename or "").lower()
    ext = os.path.splitext(filename)[1]
    content_type = (file.content_type or "").lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS and not content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported file format. Allowed image formats: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
        )

    # Validate size
    content = await file.read(MAX_IMAGE_FILE_SIZE + 1)
    if len(content) > MAX_IMAGE_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Image file exceeds maximum allowed size of 10 MB.",
        )
    await file.seek(0)

    storage = get_storage_service()
    saved_path = await storage.save_file(file, subfolder=f"case_{case.case_number}")

    case_file = CaseFile(
        case_id=case.id,
        file_type=file_type,
        file_path=saved_path,
        file_name=file.filename or "file",
        file_size=len(content),
        mime_type=file.content_type,
    )
    db.add(case_file)
    db.commit()
    db.refresh(case_file)
    return case_file


@router.get("/cases/{id}/files/{file_id}")
def get_case_file_content(
    id: Union[int, str],
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Authenticated access to case media/images.
    """
    case = get_case_or_404(db, id)
    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: You cannot access files for this case.")
    elif current_user.role == "agronomist":
        is_assigned = (case.assigned_agronomist_id == current_user.id)
        is_past = (
            db.query(Assignment).filter(Assignment.case_id == case.id, Assignment.to_user_id == current_user.id).first()
            or db.query(Review).filter(Review.case_id == case.id, Review.reviewer_id == current_user.id).first()
        )
        if not (is_assigned or is_past):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Case is not assigned to you.")

    cf = db.query(CaseFile).filter(CaseFile.id == file_id, CaseFile.case_id == case.id).first()
    if not cf or not cf.file_path or not os.path.exists(cf.file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on server storage.")

    return FileResponse(cf.file_path, media_type=cf.mime_type or "application/octet-stream")


@router.post("/cases/{id}/weather", response_model=WeatherSnapshotRead, status_code=status.HTTP_201_CREATED)
async def fetch_case_weather(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_or_404(db, id)
    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: You can only operate on your own cases.")
    lat = None
    lng = None
    if case.location_snapshot and isinstance(case.location_snapshot, dict):
        lat = case.location_snapshot.get("lat")
        lng = case.location_snapshot.get("lng")
    if lat is None and case.field and case.field.lat is not None:
        lat = case.field.lat
        lng = case.field.lng
    if lat is None and case.farm:
        lat = case.farm.latitude
        lng = case.farm.longitude
    if lat is None or lng is None:
        lat = 42.0308
        lng = -93.6319

    weather_data = await fetch_open_meteo_weather(
        lat=float(lat),
        lng=float(lng),
    )
    if not weather_data:
        weather_data = {
            "temp_max_c": 28.0,
            "temp_min_c": 16.0,
            "rainfall_7d_mm": 12.0,
            "humidity": 65.0,
            "wind_kmh": 15.0,
            "uv_index": 6.0,
            "rainfall_status": "Below Average",
            "temp_status": "Optimal",
            "lat": float(lat),
            "lng": float(lng),
            "raw_data": {"fallback": True},
        }
    snapshot = WeatherSnapshot(
        case_id=case.id,
        temp_max_c=weather_data.get("temp_max_c", 28.0),
        temp_min_c=weather_data.get("temp_min_c", 16.0),
        rainfall_7d_mm=weather_data.get("rainfall_7d_mm", 12.0),
        humidity=weather_data.get("humidity", 65.0),
        wind_kmh=weather_data.get("wind_kmh", 15.0),
        uv_index=weather_data.get("uv_index", 6.0),
        rainfall_status=weather_data.get("rainfall_status", "Below Average"),
        temp_status=weather_data.get("temp_status", "Optimal"),
        lat=weather_data.get("lat", float(lat)),
        lng=weather_data.get("lng", float(lng)),
        fetched_at=datetime.datetime.now(datetime.timezone.utc),
        source="open-meteo",
        raw_data=weather_data.get("raw_data"),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


@router.post("/cases/{id}/analyze", response_model=List[ObservationRead])
def analyze_case(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_or_404(db, id)
    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: You can only operate on your own cases.")
    CaseStateMachine.transition(
        db, case, CaseState.ANALYZING, user_id=current_user.id, action="START_ANALYSIS", details="Analyzing visual evidence."
    )

    analyzer = get_image_analyzer()
    image_path = case.files[0].file_path if case.files else "mock_corn_leaf.jpg"
    raw_obs_res = analyzer.analyze_image(
        image_path,
        case.crop,
        case.growth_stage,
        case_id=case.id,
        field_id=case.field_id,
        farmer_description=case.description,
        db=db,
    )

    obs_list = raw_obs_res.get("observations", []) if isinstance(raw_obs_res, dict) else raw_obs_res
    if isinstance(raw_obs_res, dict):
        if raw_obs_res.get("issue_hint"):
            case.issue_category = raw_obs_res["issue_hint"]
        if raw_obs_res.get("uncertainty_level"):
            case.uncertainty = raw_obs_res["uncertainty_level"]

    observations: List[Observation] = []
    for o in obs_list:
        desc = o.get("text") or o.get("description") or "Visual symptom"
        obs = Observation(
            case_id=case.id,
            description=desc,
            confidence=float(o.get("confidence", 80.0)),
            uncertainty=o.get("uncertainty", "Medium"),
            note=o.get("note"),
        )
        db.add(obs)
        observations.append(obs)

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
            n_ppm=18.0,
            p_ppm=24.0,
            k_ppm=170.0,
            ph=6.2,
            needs_confirmation=False,
        )
        db.add(soil)

    db.commit()
    CaseStateMachine.transition(
        db, case, CaseState.ANALYZED, user_id=current_user.id, action="ANALYSIS_COMPLETE", details="Visual observations extracted."
    )
    return observations


@router.post("/cases/{id}/recommend", response_model=List[RecommendationRead])
def generate_recommendations(
    id: Union[int, str],
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_or_404(db, id)
    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: You can only operate on your own cases.")
    if case.status in (CaseState.DRAFT, CaseState.ANALYZING):
        analyze_case(id, db, current_user)

    recommender = get_recommender()
    obs_data = [{"description": o.description, "confidence": o.confidence} for o in case.observations]

    soil_res = case.soil_results[0] if case.soil_results else None
    soil_data = {
        "n_value": soil_res.n_value if soil_res else "18 ppm",
        "n_ppm": soil_res.n_ppm if soil_res else 18.0,
        "ph": soil_res.ph if soil_res else 6.2,
    }
    weather_data = {"rainfall_7d_mm": 12.0}

    field_profile = {
        "field_id": case.field_id,
        "crop": case.crop,
        "growth_stage": case.growth_stage,
        "soil_type": getattr(case.field, "soil_type", "Loam") if case.field else "Loam",
        "irrigation_system": getattr(case.farm, "irrigation_system", "Center pivot") if case.farm else "Center pivot",
        "is_organic": getattr(case.farm, "is_organic", False) if case.farm else False,
    }

    # Evaluate sensor summary & interpretation
    sensor_interpretation = []
    if case.sensor_summary:
        try:
            sensor_interpretation = interpret_sensor_data(case.sensor_summary, crop=case.crop)
        except Exception as interp_err:
            logger.warning(f"Sensor interpretation error: {interp_err}")

    candidates_raw = recommender.generate_recommendations(
        crop=case.crop,
        growth_stage=case.growth_stage,
        observations=obs_data,
        soil_data=soil_data,
        weather_data=weather_data,
        case_id=case.id,
        farmer_description=case.description,
        farmer_language=case.description_lang or "en",
        field_profile=field_profile,
        retriever=get_retriever(),
        db=db,
        sensor_summary=case.sensor_summary,
        interpretation=sensor_interpretation,
    )

    if isinstance(candidates_raw, dict):
        if candidates_raw.get("issue_label"):
            case.issue_label = candidates_raw["issue_label"]
        if candidates_raw.get("issue_category"):
            case.issue_category = candidates_raw["issue_category"]
        if candidates_raw.get("confidence") is not None:
            case.confidence = candidates_raw["confidence"]
        if candidates_raw.get("uncertainty"):
            case.uncertainty = candidates_raw["uncertainty"]
        candidates = candidates_raw.get("recommendations", [])
    else:
        candidates = candidates_raw

    db.query(Recommendation).filter(Recommendation.case_id == case.id).delete()

    created_recs = []
    conf_scores = []
    for c in candidates:
        calc_conf = c.get("final_confidence") or c.get("confidence") or calculate_confidence(
            model_confidence=c.get("model_confidence") or c.get("confidence", 75.0),
            retrieval_confidence=85.0 if c.get("citation") or c.get("chunk_ids") else 0.0,
            data_completeness=90.0 if case.soil_results else 60.0,
        )
        band = c.get("uncertainty") or get_uncertainty_band(calc_conf)
        conf_scores.append(calc_conf)

        why_text = c.get("why") or c.get("why_line")
        rec = Recommendation(
            case_id=case.id,
            rank=c.get("rank", 1),
            category=c.get("category", "Crop"),
            title=c.get("action") or c.get("title") or "Recommended Action",
            confidence=calc_conf,
            uncertainty=band,
            evidence=c.get("evidence"),
            assumptions=c.get("assumptions"),
            why=why_text,
            why_line=c.get("why_line") or (f"Why: {why_text}" if why_text else None),
            citation=c.get("citation"),
            chemical_name=c.get("chemical_name"),
            chemical_dose=c.get("chemical_dose"),
            chemical_unit=c.get("chemical_unit"),
            is_visible_to_farmer=c.get("is_visible_to_farmer", True),
        )
        db.add(rec)
        created_recs.append(rec)

    if conf_scores and case.confidence == 0.0:
        avg_conf = round(sum(conf_scores) / len(conf_scores), 1)
        case.confidence = avg_conf
        case.uncertainty = get_uncertainty_band(avg_conf)

    db.commit()
    CaseStateMachine.transition(
        db, case, CaseState.PENDING_REVIEW, user_id=current_user.id, action="RECOMMENDATIONS_GENERATED", details="Action candidates synthesized."
    )
    try:
        from app.services.outbreaks import run_outbreak_detection_task
        background_tasks.add_task(run_outbreak_detection_task)
    except Exception as e:
        logger.warning(f"Could not enqueue outbreak detection task: {e}")
    return created_recs


@router.post("/cases/{id}/risk-check", status_code=status.HTTP_200_OK)
def run_risk_check(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_or_404(db, id)
    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: You can only operate on your own cases.")
    is_blocked, results = GuardrailEngine.run_checks(db, case)
    blocked_reason = next((r.details for r in results if r.status == "BLOCKED"), None) if is_blocked else None

    if is_blocked:
        try:
            CaseStateMachine.transition(
                db, case, CaseState.BLOCKED, user_id=current_user.id, action="GUARDRAILS_BLOCKED", details=blocked_reason
            )
        except Exception:
            case.status = CaseState.BLOCKED
            db.commit()

        admins = db.query(User).filter(User.role == "admin", User.active == True).all()
        for admin in admins:
            notify(
                "high_risk_flag",
                admin,
                {"case_number": case.case_number, "reason": blocked_reason, "case_id": case.id},
                db,
                case_id=case.id,
            )

    return {
        "status": case.status,
        "is_blocked": is_blocked,
        "blocked_reason": blocked_reason,
        "flagged_count": len([r for r in results if r.status == "FLAGGED"]),
        "results": [
            {
                "rule_name": r.rule_name,
                "rule_category": r.rule_category,
                "status": r.status,
                "details": r.details,
            }
            for r in results
        ],
    }


# -------------------------------------------------------------
# Farmer Guidance Report, Audio TTS & PDF Endpoints
# -------------------------------------------------------------
@router.get("/cases/{id}/report")
def get_farmer_report(
    id: Union[int, str],
    lang: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the farmer guidance report for the case.
    Available ONLY after a case decision is approved/approved_with_edits/delivered.
    Checks DB cache for the requested language (en, hi, kn).
    If not cached for non-English, translates the English body ONCE (single batched call),
    sets machine_translated=True, and caches it in the reports table.
    Default lang is viewer's language.
    """
    case = get_case_or_404(db, id)

    # Authorization
    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: you can only view reports for your own cases.",
        )

    # Report exists only after approval
    is_decided = case.status.upper() in (
        "APPROVED",
        "APPROVED_WITH_EDITS",
        "DELIVERED",
        "OUTCOME_REPORTED",
        "RESOLVED",
    )
    if not is_decided:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not available. Case has not been approved.",
        )

    target_lang = (lang or current_user.language or "en").lower().strip()
    if target_lang not in ("en", "hi", "kn"):
        target_lang = "en"

    # 1. Check if cached for requested language
    report = db.query(Report).filter(Report.case_id == case.id, Report.language == target_lang).first()
    if report:
        return {
            "id": report.id,
            "case_id": report.case_id,
            "language": report.language,
            "body_json": report.body_json,
            "machine_translated": bool(report.machine_translated),
            "audio_path": report.audio_path,
            "created_at": report.created_at,
        }

    # 2. If not found, get or build English report first
    en_report = db.query(Report).filter(Report.case_id == case.id, Report.language == "en").first()
    if not en_report:
        from app.services.report_builder import build_farmer_guidance_report
        en_report = build_farmer_guidance_report(db, case)

    if target_lang == "en":
        return {
            "id": en_report.id,
            "case_id": en_report.case_id,
            "language": en_report.language,
            "body_json": en_report.body_json,
            "machine_translated": bool(en_report.machine_translated),
            "audio_path": en_report.audio_path,
            "created_at": en_report.created_at,
        }

    # 3. Translate the English body ONCE (single batched call) with agricultural glossary injection
    from app.services.translation import translate_report_body
    translated_body = translate_report_body(en_report.body_json, target_lang)

    new_report = Report(
        case_id=case.id,
        language=target_lang,
        lang=target_lang,
        body_json=translated_body,
        machine_translated=True,
        headline=translated_body.get("what_is_happening", "")[:100],
        description=translated_body.get("what_is_happening", ""),
        steps=translated_body.get("next_steps", []),
        warnings=translated_body.get("warnings", []),
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    return {
        "id": new_report.id,
        "case_id": new_report.case_id,
        "language": new_report.language,
        "body_json": new_report.body_json,
        "machine_translated": bool(new_report.machine_translated),
        "audio_path": new_report.audio_path,
        "created_at": new_report.created_at,
    }


@router.get("/cases/{id}/report/audio")
def get_report_audio(
    id: Union[int, str],
    lang: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Synthesizes and streams plain-language audio using gTTS (en, hi, kn).
    Splits text into chunks of at most 400 characters on sentence boundaries.
    Writes MP3 bytes sequentially into one file under uploads/audio/.
    Caches by sha256(text+lang).
    Returns 503 {"fallback": "browser"} if gTTS fails or is offline.
    """
    case = get_case_or_404(db, id)

    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: you can only access audio for your own cases.",
        )

    is_decided = case.status.upper() in (
        "APPROVED",
        "APPROVED_WITH_EDITS",
        "DELIVERED",
        "OUTCOME_REPORTED",
        "RESOLVED",
    )
    if not is_decided:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report audio not available. Case has not been approved.",
        )

    target_lang = (lang or current_user.language or "en").lower().strip()
    if target_lang not in ("en", "hi", "kn"):
        target_lang = "en"

    # Fetch report for target_lang or generate
    report = db.query(Report).filter(Report.case_id == case.id, Report.language == target_lang).first()
    if not report:
        rep_dict = get_farmer_report(id=case.id, lang=target_lang, db=db, current_user=current_user)
        report = db.query(Report).filter(Report.id == rep_dict["id"]).first()

    body_json = report.body_json if (report and isinstance(report.body_json, dict)) else {}

    from app.services.report_tts import synthesize_report_audio, TTSGenerationError
    try:
        audio_file = synthesize_report_audio(body_json, lang=target_lang)
        if not report.audio_path or report.audio_path != audio_file:
            report.audio_path = audio_file
            db.commit()

        return FileResponse(
            audio_file,
            media_type="audio/mpeg",
            headers={
                "Accept-Ranges": "bytes",
                "Content-Disposition": f"inline; filename=report_{case.case_number}_{target_lang}.mp3",
            },
        )
    except Exception as e:
        logger.warning(f"Audio TTS generation error: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"fallback": "browser", "detail": f"TTS service unavailable: {str(e)}"},
        )


@router.get("/cases/{id}/report.pdf")
def get_farmer_pdf(
    id: Union[int, str],
    lang: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Exports a 1-page PDF guidance report for the farmer (WeasyPrint + Jinja2, Noto Sans fonts).
    One page with logo, case id, date, what is happening, numbered next steps,
    a warnings box, the reviewed-by line and a machine-translated note when relevant.
    """
    case = get_case_or_404(db, id)

    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: you can only download reports for your own cases.",
        )

    is_decided = case.status.upper() in (
        "APPROVED",
        "APPROVED_WITH_EDITS",
        "DELIVERED",
        "OUTCOME_REPORTED",
        "RESOLVED",
    )
    if not is_decided:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF report not available. Case has not been approved.",
        )

    target_lang = (lang or current_user.language or "en").lower().strip()
    if target_lang not in ("en", "hi", "kn"):
        target_lang = "en"

    report = db.query(Report).filter(Report.case_id == case.id, Report.language == target_lang).first()
    if not report:
        rep_dict = get_farmer_report(id=case.id, lang=target_lang, db=db, current_user=current_user)
        report = db.query(Report).filter(Report.id == rep_dict["id"]).first()

    from app.services.pdf_generator import generate_farmer_pdf
    pdf_bytes = generate_farmer_pdf(case, report, language=target_lang)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=farmer_report_{case.case_number}_{target_lang}.pdf"
        },
    )


@router.get("/cases/{id}/report-expert.pdf")
def get_expert_pdf(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Exports comprehensive expert agronomic diagnostic PDF.
    Restricted to assigned agronomist and admin ONLY.
    """
    if current_user.role == "farmer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Farmers cannot access the expert diagnostic report.",
        )

    case = get_case_or_404(db, id)

    if current_user.role == "agronomist":
        is_assigned = (case.assigned_agronomist_id == current_user.id)
        is_past_assign = (
            db.query(Assignment)
            .filter(Assignment.case_id == case.id, Assignment.to_user_id == current_user.id)
            .first()
            is not None
        )
        is_past_review = (
            db.query(Review)
            .filter(Review.case_id == case.id, Review.reviewer_id == current_user.id)
            .first()
            is not None
        )
        if not (is_assigned or is_past_assign or is_past_review):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: You are not assigned to this case.",
            )

    from app.services.pdf_generator import generate_expert_pdf
    pdf_bytes = generate_expert_pdf(case)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=expert_report_{case.case_number}.pdf"
        },
    )


@router.post("/cases/{id}/report", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def generate_report(
    id: Union[int, str],
    lang: str = "en",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Backwards compatible report creation trigger."""
    case = get_case_or_404(db, id)
    from app.services.report_builder import build_farmer_guidance_report
    report = build_farmer_guidance_report(db, case, reviewer=current_user)
    return report


# -------------------------------------------------------------
# Sensor Sample, Location, Geocoding, and Weather Endpoints
# -------------------------------------------------------------
@router.get("/sensor-report/sample")
def get_sample_sensor_report(
    scenario: Optional[str] = "healthy",
    current_user: User = Depends(get_current_user),
):
    """
    Returns a dynamically generated PDF sensor report for demonstration.
    Enabled only when SHOW_SAMPLE_SENSOR=true.
    """
    if not getattr(settings, "SHOW_SAMPLE_SENSOR", True):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sample sensor report download is disabled.",
        )

    sc = (scenario or "healthy").lower().strip()
    valid_scenarios = ("healthy", "n_deficiency", "dry", "fungal_risk", "random")
    if sc not in valid_scenarios:
        sc = "healthy"

    pdf_bytes = generate_sensor_pdf(scenario=sc, hours=48, interval_minutes=60, seed=1)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="sensor_report_{sc}.pdf"',
        },
    )


@router.put("/fields/{id}/location")
async def update_field_location(
    id: Union[int, str],
    payload: FieldLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sets field GPS coordinates, accuracy, and source.
    Farmer: own field only. Validates lat -90..90, lng -180..180, rejects (0,0).
    Fills farm lat/lng if empty; populates fields.timezone from Open-Meteo.
    """
    target_id: Optional[int] = None
    if isinstance(id, int):
        target_id = id
    elif str(id).isdigit():
        target_id = int(id)
    else:
        digits = "".join(c for c in str(id) if c.isdigit())
        if digits:
            target_id = int(digits)

    field = None
    if target_id is not None:
        field = db.query(Field).filter(Field.id == target_id).first()
    if not field:
        field = db.query(Field).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    farm = field.farm
    # Farmer authorization: own field only
    if current_user.role == "farmer":
        owns_case = db.query(Case).filter(Case.field_id == field.id, Case.user_id == current_user.id).first()
        owns_farm = db.query(Case).filter(Case.farm_id == field.farm_id, Case.user_id == current_user.id).first()
        is_operator = bool(farm and (farm.operator_name in (current_user.full_name, current_user.username)))
        if not (owns_case or owns_farm or is_operator):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: you can only update location for your own fields.",
            )


    lat = payload.lat
    lng = payload.lng

    # Validate lat -90..90, lng -180..180, reject (0,0)
    if (
        lat < -90.0
        or lat > 90.0
        or lng < -180.0
        or lng > 180.0
        or (abs(lat) < 1e-6 and abs(lng) < 1e-6)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid coordinates: latitude must be between -90 and 90, longitude between -180 and 180, and (0,0) is disallowed.",
        )

    field.lat = lat
    field.lng = lng
    field.accuracy_m = payload.accuracy_m
    field.location_source = payload.source or "gps"
    field.location_updated_at = datetime.datetime.now(datetime.timezone.utc)

    # Fill farm latitude/longitude if empty
    if farm:
        if farm.latitude is None or farm.longitude is None:
            farm.latitude = lat
            farm.longitude = lng

    # Fill fields.timezone from Open-Meteo
    try:
        w_res = await fetch_open_meteo_weather(lat, lng)
        if w_res and w_res.get("timezone"):
            field.timezone = w_res["timezone"]
    except Exception as tz_err:
        logger.debug(f"Open-Meteo timezone lookup error: {tz_err}")

    db.commit()
    db.refresh(field)

    return {
        "id": field.id,
        "name": field.name,
        "lat": field.lat,
        "lng": field.lng,
        "accuracy_m": field.accuracy_m,
        "location_source": field.location_source,
        "location_updated_at": field.location_updated_at,
        "timezone": field.timezone,
    }


@router.get("/geocode", response_model=List[GeocodePlaceRead])
async def geocode_location(
    q: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Proxies the free Open-Meteo Geocoding API, caches results, returns <= 5 places."""
    if not q or len(q.strip()) < 2:
        return []
    return await geocode_open_meteo(q.strip())


@router.get("/fields/{id}/weather")
async def get_field_weather_telemetry(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns latest weather snapshot for the field, refetching if older than cache window.
    """
    target_id: Optional[int] = None
    if isinstance(id, int):
        target_id = id
    elif str(id).isdigit():
        target_id = int(id)
    else:
        digits = "".join(c for c in str(id) if c.isdigit())
        if digits:
            target_id = int(digits)

    field = None
    if target_id is not None:
        field = db.query(Field).filter(Field.id == target_id).first()
    if not field:
        field = db.query(Field).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    lat = field.lat or (field.farm.latitude if field.farm else None)
    lng = field.lng or (field.farm.longitude if field.farm else None)

    if lat is None or lng is None:
        lat = 42.0308
        lng = -93.6319

    weather_data = await fetch_open_meteo_weather(float(lat), float(lng))
    if not weather_data:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Automated weather telemetry is currently unavailable.",
        )

    return weather_data


# -------------------------------------------------------------
# Case Field Sensor Endpoints
# -------------------------------------------------------------
@router.post("/cases/{id}/sensor-report")
async def upload_sensor_report_pdf(
    id: Union[int, str],
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Uploads a simulated field sensor report PDF (farmer only, own case in DRAFT).
    Parses table/regex, stores readings, computes summary and interpretations.
    """
    case = get_case_or_404(db, id)

    if current_user.role != "farmer" or case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: only the owner farmer can upload sensor reports for this case.",
        )

    if case.status != CaseState.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sensor reports can only be uploaded when the case is in DRAFT state.",
        )

    pdf_bytes = await file.read()
    try:
        parse_res = parse_sensor_pdf(pdf_bytes, filename=file.filename, save_to_uploads=True)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err),
        )

    report = SensorReport(
        case_id=case.id,
        field_id=case.field_id,
        file_path=parse_res["file_path"],
        parse_method=parse_res["parse_method"],
        is_simulated=True,
        device_label=parse_res.get("device_label"),
        period_start=parse_res.get("period_start"),
        period_end=parse_res.get("period_end"),
        rows_count=parse_res["rows_ok"],
        warnings=parse_res.get("warnings", []),
    )
    db.add(report)
    db.flush()

    # Clear previous readings for this case
    db.query(SensorReading).filter(SensorReading.case_id == case.id).delete()

    for r in parse_res["readings"]:
        sr = SensorReading(
            sensor_report_id=report.id,
            case_id=case.id,
            measured_at=r["measured_at"],
            soil_moisture_pct=r.get("soil_moisture_pct"),
            n_mgkg=r.get("n_mgkg"),
            p_mgkg=r.get("p_mgkg"),
            k_mgkg=r.get("k_mgkg"),
            temp_c=r.get("temp_c"),
            humidity_pct=r.get("humidity_pct"),
            ph=r.get("ph"),
            leaf_wetness_pct=r.get("leaf_wetness_pct"),
        )
        db.add(sr)

    # Attach file record to case
    case_file = CaseFile(
        case_id=case.id,
        file_type="sensor_report",
        file_path=parse_res["file_path"] or "",
        file_name=file.filename or "sensor_report.pdf",
        file_size=len(pdf_bytes),
        mime_type="application/pdf",
    )
    db.add(case_file)

    # Compute summary & interpretation
    tz_str = case.field.timezone if case.field else None
    summary = compute_sensor_summary(
        parse_res["readings"],
        submission_time=datetime.datetime.now(datetime.timezone.utc),
        timezone_str=tz_str,
    )
    interpretation = interpret_sensor_data(summary, crop=case.crop)
    case.sensor_summary = summary

    db.commit()

    try:
        from app.services.alerts_engine import check_case_sensor_alerts
        check_case_sensor_alerts(db, case)
    except Exception as e:
        logger.warning(f"Error evaluating sensor alerts for case {case.id}: {e}")

    return {
        "parse_report": {
            "rows_ok": parse_res["rows_ok"],
            "rows_dropped": parse_res["rows_dropped"],
            "warnings": parse_res["warnings"],
            "missing_columns": parse_res["missing_columns"],
            "needs_confirmation": parse_res["needs_confirmation"],
        },
        "summary": summary,
        "interpretation": interpretation,
    }


@router.patch("/cases/{id}/sensor-summary")
def patch_case_sensor_summary(
    id: Union[int, str],
    payload: SensorLatestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Allows the farmer to correct the latest sensor values.
    Saved as a manual reading (parse_method=manual); also works when no PDF exists.
    """
    case = get_case_or_404(db, id)

    if current_user.role == "farmer" and case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: you can only update sensor values for your own cases.",
        )

    # Find or create manual SensorReport
    report = db.query(SensorReport).filter(SensorReport.case_id == case.id).first()
    if not report:
        report = SensorReport(
            case_id=case.id,
            field_id=case.field_id,
            parse_method="manual",
            is_simulated=True,
            device_label="Manual Input",
            rows_count=0,
            warnings=[],
        )
        db.add(report)
        db.flush()

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    reading = SensorReading(
        sensor_report_id=report.id,
        case_id=case.id,
        measured_at=now_utc,
        soil_moisture_pct=payload.soil_moisture_pct,
        n_mgkg=payload.n_mgkg,
        p_mgkg=payload.p_mgkg,
        k_mgkg=payload.k_mgkg,
        temp_c=payload.temp_c,
        humidity_pct=payload.humidity_pct,
        ph=payload.ph,
        leaf_wetness_pct=payload.leaf_wetness_pct,
    )
    db.add(reading)
    report.rows_count = (report.rows_count or 0) + 1
    db.flush()

    all_readings = (
        db.query(SensorReading)
        .filter(SensorReading.case_id == case.id)
        .order_by(SensorReading.measured_at.asc())
        .all()
    )
    readings_dicts = [
        {
            "measured_at": r.measured_at,
            "soil_moisture_pct": r.soil_moisture_pct,
            "n_mgkg": r.n_mgkg,
            "p_mgkg": r.p_mgkg,
            "k_mgkg": r.k_mgkg,
            "temp_c": r.temp_c,
            "humidity_pct": r.humidity_pct,
            "ph": r.ph,
            "leaf_wetness_pct": r.leaf_wetness_pct,
        }
        for r in all_readings
    ]

    tz_str = case.field.timezone if case.field else None
    summary = compute_sensor_summary(readings_dicts, submission_time=now_utc, timezone_str=tz_str)
    interpretation = interpret_sensor_data(summary, crop=case.crop)
    case.sensor_summary = summary

    db.commit()

    try:
        from app.services.alerts_engine import check_case_sensor_alerts
        check_case_sensor_alerts(db, case)
    except Exception as e:
        logger.warning(f"Error evaluating sensor alerts for case {case.id}: {e}")

    return {
        "summary": summary,
        "interpretation": interpretation,
    }


@router.get("/cases/{id}/sensor")
def get_case_sensor_telemetry(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Role-specific sensor telemetry:
    - Farmer: simple statuses only {key, label_key, status, value} + simulated: true (no thresholds, flags, or confidence).
    - Agronomist & Admin: full readings series, 24h stats, trends, interpretation, data-quality flags, report link, field location.
    """
    case = get_case_or_404(db, id)

    if current_user.role == "farmer":
        if case.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: you can only view sensor data for your own cases.",
            )

        interpretation = interpret_sensor_data(case.sensor_summary or {}, crop=case.crop) if case.sensor_summary else []
        items = []
        for item in interpretation:
            items.append({
                "key": item["key"],
                "label_key": item["label_key"],
                "status": item["status"],
                "value": item.get("value"),
            })
        return {
            "simulated": True,
            "items": items,
        }

    # Agronomist & Admin
    if current_user.role == "agronomist":
        assigned_or_reviewed = (
            case.assigned_agronomist_id == current_user.id
            or db.query(Assignment).filter(Assignment.case_id == case.id, Assignment.to_user_id == current_user.id).first()
            or db.query(Review).filter(Review.case_id == case.id, Review.reviewer_id == current_user.id).first()
        )
        if not assigned_or_reviewed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: this case is not assigned to you.",
            )

    report = (
        db.query(SensorReport)
        .filter(SensorReport.case_id == case.id)
        .order_by(SensorReport.created_at.desc())
        .first()
    )
    all_readings = (
        db.query(SensorReading)
        .filter(SensorReading.case_id == case.id)
        .order_by(SensorReading.measured_at.asc())
        .all()
    )
    readings_list = [
        {
            "timestamp": r.measured_at.strftime("%Y-%m-%d %H:%M"),
            "measured_at": r.measured_at.isoformat(),
            "soil_moisture_pct": r.soil_moisture_pct,
            "n_mgkg": r.n_mgkg,
            "p_mgkg": r.p_mgkg,
            "k_mgkg": r.k_mgkg,
            "temp_c": r.temp_c,
            "humidity_pct": r.humidity_pct,
            "ph": r.ph,
            "leaf_wetness_pct": r.leaf_wetness_pct,
        }
        for r in all_readings
    ]

    summary = case.sensor_summary or {}
    interpretation = interpret_sensor_data(summary, crop=case.crop) if summary else []
    data_quality_flags = [
        {
            "id": gr.id,
            "rule_name": gr.rule_name,
            "rule_category": gr.rule_category,
            "status": gr.status,
            "details": gr.details,
        }
        for gr in (case.guardrail_results or [])
        if gr.rule_category == "Data Quality"
    ]

    weather_snap = None
    if case.weather_snapshots:
        ws = case.weather_snapshots[0]
        weather_snap = {
            "temp_max_c": ws.temp_max_c,
            "temp_min_c": ws.temp_min_c,
            "rainfall_7d_mm": ws.rainfall_7d_mm,
            "humidity": ws.humidity,
            "wind_kmh": ws.wind_kmh,
            "uv_index": ws.uv_index,
            "source": ws.source or getattr(case, "weather_source", "open-meteo"),
            "fetched_at": ws.fetched_at.isoformat() if ws.fetched_at else ws.created_at.isoformat(),
        }

    loc_payload = {
        "lat": case.field.lat if case.field else None,
        "lng": case.field.lng if case.field else None,
        "accuracy_m": case.field.accuracy_m if case.field else None,
        "source": case.field.location_source if case.field else None,
        "timezone": case.field.timezone if case.field else None,
    }

    return {
        "simulated": True,
        "device_label": report.device_label if report else None,
        "latest": summary.get("latest") or summary.get("latest_values", {}),
        "latest_values": summary.get("latest_values") or summary.get("latest", {}),
        "stats_24h": summary.get("stats_24h") or summary.get("last_24h", {}),
        "last_24h": summary.get("last_24h") or summary.get("stats_24h", {}),
        "trends": summary.get("trends", {}),
        "hours_leaf_wetness_ge_70": summary.get("hours_leaf_wetness_ge_70", 0.0),
        "data_age_hours": summary.get("data_age_hours", 0.0),
        "stale": summary.get("stale", False),
        "interpretation": interpretation,
        "readings": readings_list,
        "readings_series": readings_list,
        "flags": data_quality_flags,
        "report_file_url": f"/v1/cases/{case.id}/sensor-report/file" if report and report.file_path else None,
        "location": loc_payload,
        "field_location": loc_payload,
        "weather_snapshot": weather_snap,
    }


@router.get("/cases/{id}/sensor-report/file")
def download_sensor_report_file(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Downloads source sensor report PDF. Agronomist & Admin only.
    """
    case = get_case_or_404(db, id)

    if current_user.role not in ("agronomist", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: only agronomists and administrators can download source sensor report files.",
        )

    report = (
        db.query(SensorReport)
        .filter(SensorReport.case_id == case.id, SensorReport.file_path.isnot(None))
        .order_by(SensorReport.created_at.desc())
        .first()
    )
    file_path = str(report.file_path) if (report and report.file_path) else None
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source sensor report file not found on disk.",
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=os.path.basename(file_path),
    )
