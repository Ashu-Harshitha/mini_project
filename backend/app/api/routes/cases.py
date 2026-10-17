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
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

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
)
from app.schemas.schemas import (
    CaseCreate,
    CaseSubmit,
    CaseRead,
    FarmerCaseRead,
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
    MessageRead,
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
from app.services.assignment import assign_case
from app.services.audio import process_voice_upload
from app.services.ai.gemini_client import get_gemini_client

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


@router.post("/cases/{id}/submit", status_code=status.HTTP_200_OK)
def submit_case(
    id: Union[int, str],
    payload: CaseSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submits a farmer case (farmer only, own case). Requires description >= 10 chars.
    Runs analyze -> recommend -> risk-check, transitions case to PENDING_REVIEW, then assign_case.
    """
    case = get_case_or_404(db, id)

    if current_user.role != "farmer" or case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: only the owner farmer can submit this case.",
        )

    clean_desc = payload.description.strip() if payload.description else ""
    if len(clean_desc) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Description must be at least 10 characters long.",
        )

    case.description = clean_desc
    case.description_lang = payload.description_lang or "en"
    db.commit()

    # Run AI diagnostic pipeline
    try:
        analyze_case(id, db, current_user)
        generate_recommendations(id, db, current_user)
        run_risk_check(id, db, current_user)
    except Exception as e:
        logger.warning(f"Error during AI pipeline execution for case {case.case_number}: {e}")

    # Ensure status is PENDING_REVIEW
    if case.status != CaseState.BLOCKED:
        if case.status != CaseState.PENDING_REVIEW:
            try:
                CaseStateMachine.transition(
                    db, case, CaseState.PENDING_REVIEW, user_id=current_user.id, action="FARMER_SUBMIT", details="Submitted for review."
                )
            except Exception:
                case.status = CaseState.PENDING_REVIEW
                db.commit()

        # Assign case to eligible agronomist
        assign_case(case.id, db, reason="auto")

    db.refresh(case)
    return _format_farmer_case(case)


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
        is_current = case.assigned_agronomist_id == current_user.id
        is_past = (
            db.query(Assignment).filter(Assignment.case_id == case.id, Assignment.to_user_id == current_user.id).first()
            or db.query(Review).filter(Review.case_id == case.id, Review.reviewer_id == current_user.id).first()
        )
        if not (is_current or is_past):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

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
    is_assigned_agro = current_user.role == "agronomist" and case.assigned_agronomist_id == current_user.id
    if not (is_owner_farmer or is_assigned_agro):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: only the farmer or assigned agronomist can exchange messages in this case.",
        )

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


# -----------------------------
# Existing Diagnostic Endpoints
# -----------------------------
@router.get("/guardrails/rules")
def get_guardrail_rules(db: Session = Depends(get_db)):
    return db.query(ChemicalRule).all()


@router.get("/outcomes", response_model=List[OutcomeFeedbackRead])
def list_outcomes(db: Session = Depends(get_db)):
    return db.query(OutcomeFeedback).order_by(OutcomeFeedback.created_at.desc()).all()


@router.post("/cases/{id}/files", response_model=CaseFileRead, status_code=status.HTTP_201_CREATED)
async def upload_case_file(
    id: Union[int, str],
    file: UploadFile = File(...),
    file_type: str = Form("crop_image"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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


@router.post("/cases/{id}/weather", response_model=WeatherSnapshotRead, status_code=status.HTTP_201_CREATED)
async def fetch_case_weather(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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


@router.post("/cases/{id}/analyze", response_model=List[ObservationRead])
def analyze_case(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_or_404(db, id)
    CaseStateMachine.transition(
        db, case, CaseState.ANALYZING, user_id=current_user.id, action="START_ANALYSIS", details="Analyzing visual evidence."
    )

    analyzer = get_image_analyzer()
    image_path = case.files[0].file_path if case.files else "mock_corn_leaf.jpg"
    raw_obs = analyzer.analyze_image(image_path, case.crop, case.growth_stage)

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
    CaseStateMachine.transition(
        db, case, CaseState.ANALYZED, user_id=current_user.id, action="ANALYSIS_COMPLETE", details="Visual observations extracted."
    )
    return observations


@router.post("/cases/{id}/recommend", response_model=List[RecommendationRead])
def generate_recommendations(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_or_404(db, id)
    if case.status in (CaseState.DRAFT, CaseState.ANALYZING):
        analyze_case(id, db, current_user)

    recommender = get_recommender()
    obs_data = [{"description": o.description, "confidence": o.confidence} for o in case.observations]
    soil_data = {"n_value": "18 ppm", "status": "Marginal"}
    weather_data = {"rainfall_7d_mm": 12.0}

    candidates = recommender.generate_recommendations(case.crop, case.growth_stage, obs_data, soil_data, weather_data)

    db.query(Recommendation).filter(Recommendation.case_id == case.id).delete()

    created_recs = []
    conf_scores = []
    for c in candidates:
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

    if conf_scores:
        avg_conf = round(sum(conf_scores) / len(conf_scores), 1)
        case.confidence = avg_conf
        case.uncertainty = get_uncertainty_band(avg_conf)

    db.commit()
    CaseStateMachine.transition(
        db, case, CaseState.PENDING_REVIEW, user_id=current_user.id, action="RECOMMENDATIONS_GENERATED", details="Action candidates synthesized."
    )
    return created_recs


@router.post("/cases/{id}/risk-check", status_code=status.HTTP_200_OK)
def run_risk_check(
    id: Union[int, str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_or_404(db, id)
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


@router.post("/cases/{id}/report", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def generate_report(
    id: Union[int, str],
    lang: str = "en",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = get_case_or_404(db, id)
    translator = get_translator()
    tts = get_tts()

    headline = f"Field Action Plan: {case.crop} Recovery"
    description = f"Approved agronomic guidance for field {case.field.name} ({case.field.acreage} ac)."
    if lang != "en":
        headline = translator.translate(headline, target_language=lang)
        description = translator.translate(description, target_language=lang)

    report = Report(
        case_id=case.id,
        lang=lang,
        headline=headline,
        description=description,
        steps=[{"number": 1, "instruction": r.title} for r in case.recommendations if r.is_visible_to_farmer],
        warnings=["Check soil moisture before application."],
        confidence_explanation=f"Based on visual leaf symptoms and soil analysis.",
        audio_url=tts.generate_audio_url(description, lang),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
