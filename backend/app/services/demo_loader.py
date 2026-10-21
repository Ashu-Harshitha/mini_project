"""
AgriAdvisor AI Demo Data Loader & Reset Service.

Covers every entity type:
- 4 Agronomists (available, busy/at limit, unavailable, new)
- 8 Farmers (en, hi, kn mix)
- Farms and fields across 3 regions (including a 4-farm cluster for outbreak detection)
- ~30 Cases covering every status (DRAFT, ANALYZING, ANALYZED, PENDING_REVIEW [normal, high-risk, ai_degraded, unassigned],
  APPROVED, APPROVED_WITH_EDITS, REJECTED, DELIVERED, OUTCOME_REPORTED, BLOCKED)
- Sub-entities: observations, soil_results, weather_snapshots, recommendations, guardrail_results,
  assignment history (timeout & admin reassignments), reviews, reports (with hi/kn translations),
  messages (with translations & gTTS voice notes), farmer outcome feedback
- Weather alerts for every rule
- Notifications of every event type (read/unread)
- 6 months of eval runs with metric trends & per-case results
- 2 versions per prompt template
- Sample LLM calls
- Outbreak detector execution on demo cluster
- Safe idempotent loading and dependency-ordered reset
"""

import os
import random
import datetime
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from PIL import Image, ImageDraw

from app.core.config import settings
from app.models.models import (
    User,
    Farm,
    Field,
    Case,
    CaseFile,
    Observation,
    SoilResult,
    WeatherSnapshot,
    Recommendation,
    GuardrailResult,
    Review,
    Report,
    Notification,
    OutcomeFeedback,
    PromptTemplate,
    AuditLog,
    LLMCall,
    EvalRun,
    EvalCaseResult,
    WeatherAlert,
    Outbreak,
    OutbreakNotified,
    outbreak_cases,
    Assignment,
    Message,
    MessageTranslation,
)
from app.services.case_state import CaseState
from app.services.outbreaks import detect_outbreaks
from app.auth.firebase_client import get_firebase

logger = logging.getLogger("agriadvisor.demo_loader")

DEMO_PASSWORD = "password123" if getattr(settings, "DEMO_PASSWORD_OVERRIDE", None) else "123456"

AGRONOMIST_DEFS = [
    {
        "username": "demo_agro_avail",
        "full_name": "Dr. Rajesh Kumar",
        "role": "agronomist",
        "available": True,
        "max_open_cases": 5,
        "language": "en",
        "email": f"demo_agro_avail@{settings.AUTH_EMAIL_DOMAIN}",
        "phone": "+919876543210",
        "notes": "Available senior agronomist",
    },
    {
        "username": "demo_agro_busy",
        "full_name": "Dr. Anita Rao",
        "role": "agronomist",
        "available": True,
        "max_open_cases": 5,
        "language": "en",
        "email": f"demo_agro_busy@{settings.AUTH_EMAIL_DOMAIN}",
        "phone": "+919876543211",
        "notes": "At maximum case capacity (5 open cases)",
    },
    {
        "username": "demo_agro_unavail",
        "full_name": "Dr. Vikram Patil",
        "role": "agronomist",
        "available": False,
        "max_open_cases": 5,
        "language": "en",
        "email": f"demo_agro_unavail@{settings.AUTH_EMAIL_DOMAIN}",
        "phone": "+919876543212",
        "notes": "On leave / unavailable",
    },
    {
        "username": "demo_agro_new",
        "full_name": "Pooja Sharma",
        "role": "agronomist",
        "available": True,
        "max_open_cases": 5,
        "language": "en",
        "email": f"demo_agro_new@{settings.AUTH_EMAIL_DOMAIN}",
        "phone": "+919876543213",
        "notes": "New onboarded agronomist (0 cases)",
    },
]

FARMER_DEFS = [
    {"username": "demo_farmer_en1", "full_name": "Ramesh Patel", "language": "en", "phone": "+919811111111", "role": "farmer"},
    {"username": "demo_farmer_en2", "full_name": "Suresh Singh", "language": "en", "phone": "+919811111112", "role": "farmer"},
    {"username": "demo_farmer_hi1", "full_name": "Amit Sharma", "language": "hi", "phone": "+919811111113", "role": "farmer"},
    {"username": "demo_farmer_hi2", "full_name": "Dinesh Verma", "language": "hi", "phone": "+919811111114", "role": "farmer"},
    {"username": "demo_farmer_hi3", "full_name": "Manoj Yadav", "language": "hi", "phone": "+919811111115", "role": "farmer"},
    {"username": "demo_farmer_kn1", "full_name": "Basavaraj Gowda", "language": "kn", "phone": "+919811111116", "role": "farmer"},
    {"username": "demo_farmer_kn2", "full_name": "Manjunath Hegde", "language": "kn", "phone": "+919811111117", "role": "farmer"},
    {"username": "demo_farmer_kn3", "full_name": "Shivanna K", "language": "kn", "phone": "+919811111118", "role": "farmer"},
]


def _create_placeholder_leaf_image(index: int) -> str:
    """Generates a small synthetic leaf image with Pillow to avoid dummy links."""
    upload_dir = os.path.join(settings.UPLOAD_DIR, "cases")
    os.makedirs(upload_dir, exist_ok=True)
    img_filename = f"demo_leaf_{index}.png"
    full_path = os.path.join(upload_dir, img_filename)

    if not os.path.exists(full_path):
        img = Image.new("RGB", (256, 256), color=(240, 248, 240))
        draw = ImageDraw.Draw(img)
        # Draw green leaf silhouette
        draw.ellipse([48, 30, 208, 226], fill=(46, 139, 87), outline=(24, 80, 48), width=3)
        draw.line([128, 30, 128, 226], fill=(24, 80, 48), width=3)
        draw.line([128, 80, 175, 120], fill=(24, 80, 48), width=2)
        draw.line([128, 130, 80, 170], fill=(24, 80, 48), width=2)
        draw.line([128, 170, 165, 200], fill=(24, 80, 48), width=2)
        img.save(full_path, "PNG")

    return f"/uploads/cases/{img_filename}"


def _generate_demo_voice_note(index: int, text: str, lang: str) -> str:
    """Generates a demo voice note with gTTS, gracefully falling back to empty MP3 bytes."""
    voice_dir = os.path.join(settings.UPLOAD_DIR, "voice")
    os.makedirs(voice_dir, exist_ok=True)
    audio_filename = f"demo_voice_{index}.mp3"
    full_path = os.path.join(voice_dir, audio_filename)

    if not os.path.exists(full_path):
        try:
            import socket
            orig_t = socket.getdefaulttimeout()
            socket.setdefaulttimeout(1.5)
            try:
                from gtts import gTTS
                tts_lang = lang if lang in ("en", "hi") else "en"
                tts = gTTS(text=text, lang=tts_lang, slow=False)
                tts.save(full_path)
            finally:
                socket.setdefaulttimeout(orig_t)
        except Exception as e:
            logger.warning(f"gTTS voice generation skipped ({e}). Writing placeholder audio bytes.")
            with open(full_path, "wb") as f:
                f.write(b"ID3\x03\x00\x00\x00\x00\x00#TSSE\x00\x00\x00\x0f\x00\x00\x03Lavf60.3.100\x00DEMO_VOICE_NOTE")

    return f"/uploads/voice/{audio_filename}"


def get_demo_status(db: Session) -> Dict[str, Any]:
    """Returns current demo status and counts of demo rows."""
    has_demo = db.query(User).filter(User.is_demo == True).count() > 0 or \
               db.query(Case).filter(Case.is_demo == True).count() > 0

    counts = {
        "users": db.query(User).filter(User.is_demo == True).count(),
        "farms": db.query(Farm).filter(Farm.is_demo == True).count(),
        "cases": db.query(Case).filter(Case.is_demo == True).count(),
        "weather_alerts": db.query(WeatherAlert).filter(WeatherAlert.is_demo == True).count(),
        "notifications": db.query(Notification).filter(Notification.is_demo == True).count(),
        "outbreaks": db.query(Outbreak).filter(Outbreak.is_demo == True).count(),
        "eval_runs": db.query(EvalRun).filter(EvalRun.is_demo == True).count(),
    }

    return {
        "enabled": getattr(settings, "ALLOW_DEMO_DATA", False),
        "has_demo_data": has_demo,
        "counts": counts,
    }


def reset_demo_data(db: Session, no_firebase: bool = False) -> Dict[str, int]:
    """
    Deletes all is_demo=True rows in strict dependency order,
    plus demo Firebase users, and returns deletion counts.
    """
    deleted_counts: Dict[str, int] = {}
    fb = get_firebase()

    # 1. Collect demo IDs
    demo_user_ids = [u.id for u in db.query(User.id).filter(User.is_demo == True).all()]
    demo_firebase_uids = [u.firebase_uid for u in db.query(User.firebase_uid).filter(User.is_demo == True).all() if u.firebase_uid]
    demo_case_ids = [c.id for c in db.query(Case.id).filter(Case.is_demo == True).all()]
    demo_farm_ids = [f.id for f in db.query(Farm.id).filter(Farm.is_demo == True).all()]
    demo_outbreak_ids = [o.id for o in db.query(Outbreak.id).filter(Outbreak.is_demo == True).all()]
    demo_eval_run_ids = [e.id for e in db.query(EvalRun.id).filter(EvalRun.is_demo == True).all()]

    # 2. Delete Eval Results & Eval Runs
    if demo_eval_run_ids:
        deleted_counts["eval_case_results"] = db.query(EvalCaseResult).filter(EvalCaseResult.eval_run_id.in_(demo_eval_run_ids)).delete(synchronize_session=False)
        deleted_counts["eval_runs"] = db.query(EvalRun).filter(EvalRun.id.in_(demo_eval_run_ids)).delete(synchronize_session=False)

    # 3. Delete Outbreak Notifications, Outbreak Cases & Outbreaks
    if demo_outbreak_ids:
        deleted_counts["outbreak_notified"] = db.query(OutbreakNotified).filter(OutbreakNotified.outbreak_id.in_(demo_outbreak_ids)).delete(synchronize_session=False)
        # outbreak_cases table
        db.execute(outbreak_cases.delete().where(outbreak_cases.c.outbreak_id.in_(demo_outbreak_ids)))
        deleted_counts["outbreaks"] = db.query(Outbreak).filter(Outbreak.id.in_(demo_outbreak_ids)).delete(synchronize_session=False)

    # 4. Delete Weather Alerts & Notifications
    deleted_counts["weather_alerts"] = db.query(WeatherAlert).filter(WeatherAlert.is_demo == True).delete(synchronize_session=False)
    deleted_counts["notifications"] = db.query(Notification).filter(Notification.is_demo == True).delete(synchronize_session=False)

    # 5. Delete Case Sub-Entities
    if demo_case_ids:
        deleted_counts["outcome_feedback"] = db.query(OutcomeFeedback).filter(OutcomeFeedback.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        
        # Message translations & messages
        demo_message_ids = [m.id for m in db.query(Message.id).filter(Message.case_id.in_(demo_case_ids)).all()]
        if demo_message_ids:
            deleted_counts["message_translations"] = db.query(MessageTranslation).filter(MessageTranslation.message_id.in_(demo_message_ids)).delete(synchronize_session=False)
        deleted_counts["messages"] = db.query(Message).filter(Message.case_id.in_(demo_case_ids)).delete(synchronize_session=False)

        deleted_counts["reviews"] = db.query(Review).filter(Review.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        deleted_counts["reports"] = db.query(Report).filter(Report.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        deleted_counts["guardrail_results"] = db.query(GuardrailResult).filter(GuardrailResult.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        deleted_counts["recommendations"] = db.query(Recommendation).filter(Recommendation.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        deleted_counts["observations"] = db.query(Observation).filter(Observation.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        deleted_counts["soil_results"] = db.query(SoilResult).filter(SoilResult.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        deleted_counts["weather_snapshots"] = db.query(WeatherSnapshot).filter(WeatherSnapshot.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        deleted_counts["assignments"] = db.query(Assignment).filter(Assignment.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        deleted_counts["case_files"] = db.query(CaseFile).filter(CaseFile.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        deleted_counts["audit_logs"] = db.query(AuditLog).filter(AuditLog.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        deleted_counts["llm_calls"] = db.query(LLMCall).filter(LLMCall.case_id.in_(demo_case_ids)).delete(synchronize_session=False)

        deleted_counts["cases"] = db.query(Case).filter(Case.id.in_(demo_case_ids)).delete(synchronize_session=False)

    # 6. Delete Fields & Farms
    if demo_farm_ids:
        deleted_counts["fields"] = db.query(Field).filter(Field.farm_id.in_(demo_farm_ids)).delete(synchronize_session=False)
        deleted_counts["farms"] = db.query(Farm).filter(Farm.id.in_(demo_farm_ids)).delete(synchronize_session=False)

    # 7. Delete Users
    if demo_user_ids:
        deleted_counts["users"] = db.query(User).filter(User.id.in_(demo_user_ids)).delete(synchronize_session=False)

    db.commit()

    # 8. Delete demo Firebase users
    if not no_firebase and fb.is_configured():
        for uid in demo_firebase_uids:
            try:
                fb.delete_user(uid)
            except Exception as e:
                logger.debug(f"Firebase delete user note for {uid}: {e}")

    logger.info(f"Demo data reset completed: {deleted_counts}")
    return deleted_counts


def load_demo_data(
    db: Session,
    num_cases: int = 30,
    no_firebase: bool = False,
) -> Dict[str, Any]:
    """
    Idempotent demo data generator seeding all required entities with deterministic seed.
    """
    random.seed(42)
    now = datetime.datetime.utcnow()

    # Check idempotency: if demo users and cases already exist, return existing counts
    existing_demo_users = db.query(User).filter(User.is_demo == True).count()
    existing_demo_cases = db.query(Case).filter(Case.is_demo == True).count()
    if existing_demo_users >= 12 and existing_demo_cases >= 25:
        logger.info("Demo data already loaded. Returning idempotent status.")
        return {
            "success": True,
            "message": "Demo data already loaded (idempotent).",
            "counts": get_demo_status(db)["counts"],
        }

    fb = get_firebase()
    fb_active = fb.is_configured() and not no_firebase

    # -------------------------------------------------------------
    # 1. Create Demo Agronomists & Farmers
    # -------------------------------------------------------------
    agronomists: List[User] = []
    farmers: List[User] = []

    for defn in AGRONOMIST_DEFS:
        existing = db.query(User).filter(User.username == defn["username"]).first()
        if existing:
            existing.is_demo = True
            existing.available = defn["available"]
            existing.max_open_cases = defn["max_open_cases"]
            agronomists.append(existing)
            continue

        uid = f"fb_{defn['username']}"
        if fb_active:
            try:
                existing_fb = fb.get_user_by_email(defn["email"])
                if existing_fb:
                    uid = existing_fb.uid
                else:
                    uid = fb.create_user(defn["email"], DEMO_PASSWORD, defn["full_name"])
                    fb.set_role_claim(uid, defn["role"])
            except Exception as e:
                logger.warning(f"Firebase create failed for {defn['username']} ({e}), using fallback UID.")
                uid = f"fb_{defn['username']}"

        u = User(
            username=defn["username"],
            firebase_uid=uid,
            full_name=defn["full_name"],
            role=defn["role"],
            email=defn["email"],
            phone=defn["phone"],
            language=defn["language"],
            active=True,
            available=defn["available"],
            max_open_cases=defn["max_open_cases"],
            is_demo=True,
        )
        db.add(u)
        agronomists.append(u)

    for defn in FARMER_DEFS:
        existing = db.query(User).filter(User.username == defn["username"]).first()
        if existing:
            existing.is_demo = True
            farmers.append(existing)
            continue

        email = f"{defn['username']}@{settings.AUTH_EMAIL_DOMAIN}"
        uid = f"fb_{defn['username']}"
        if fb_active:
            try:
                existing_fb = fb.get_user_by_email(email)
                if existing_fb:
                    uid = existing_fb.uid
                else:
                    uid = fb.create_user(email, DEMO_PASSWORD, defn["full_name"])
                    fb.set_role_claim(uid, defn["role"])
            except Exception as e:
                logger.warning(f"Firebase create failed for {defn['username']} ({e}), using fallback UID.")
                uid = f"fb_{defn['username']}"

        u = User(
            username=defn["username"],
            firebase_uid=uid,
            full_name=defn["full_name"],
            role=defn["role"],
            email=email,
            phone=defn["phone"],
            language=defn["language"],
            active=True,
            available=True,
            is_demo=True,
        )
        db.add(u)
        farmers.append(u)

    db.commit()

    # -------------------------------------------------------------
    # 2. Create Farms & Fields Across 3 Regions
    # -------------------------------------------------------------
    # Region 1: Outbreak Cluster (Davanagere - 4 farms within 15 km with Corn)
    # Region 2: Mysore / Mandya (Rice, Wheat, Organic)
    # Region 3: Belagavi (Soybean, Corn)
    farm_configs = [
        # Cluster (within 15km)
        {"name": "Davanagere Valley Farm", "op": farmers[0].full_name, "loc": "Davanagere, Karnataka", "lat": 14.460, "lng": 75.920, "crop": "Corn", "org": False, "ac": 25.0},
        {"name": "Sunrise Agri Estate", "op": farmers[1].full_name, "loc": "Davanagere, Karnataka", "lat": 14.475, "lng": 75.930, "crop": "Corn", "org": False, "ac": 40.0},
        {"name": "Kisan Seva Agro", "op": farmers[2].full_name, "loc": "Davanagere, Karnataka", "lat": 14.450, "lng": 75.910, "crop": "Corn", "org": False, "ac": 18.0},
        {"name": "Sahyadri Corn Fields", "op": farmers[5].full_name, "loc": "Davanagere, Karnataka", "lat": 14.465, "lng": 75.945, "crop": "Corn", "org": True, "ac": 30.0},
        # Region 2: Mysore / Mandya
        {"name": "Kaveri Organic Rice Farm", "op": farmers[6].full_name, "loc": "Mandya, Karnataka", "lat": 12.520, "lng": 76.890, "crop": "Rice", "org": True, "ac": 15.0},
        {"name": "Chamundi Wheat Fields", "op": farmers[7].full_name, "loc": "Mysore, Karnataka", "lat": 12.300, "lng": 76.650, "crop": "Wheat", "org": False, "ac": 50.0},
        # Region 3: Belagavi
        {"name": "Belagavi Seed Farm", "op": farmers[3].full_name, "loc": "Belagavi, Karnataka", "lat": 15.850, "lng": 74.500, "crop": "Soybean", "org": False, "ac": 35.0},
        {"name": "Malaprabha Agro", "op": farmers[4].full_name, "loc": "Belagavi, Karnataka", "lat": 15.820, "lng": 74.550, "crop": "Corn", "org": True, "ac": 22.0},
    ]

    farms: List[Farm] = []
    fields: List[Field] = []

    for idx, cfg in enumerate(farm_configs):
        f = db.query(Farm).filter(Farm.name == cfg["name"]).first()
        if not f:
            f = Farm(
                name=cfg["name"],
                operator_name=cfg["op"],
                location=cfg["loc"],
                total_acreage=cfg["ac"],
                latitude=cfg["lat"],
                longitude=cfg["lng"],
                primary_crops=[cfg["crop"]],
                irrigation_system="Drip" if cfg["org"] else "Center pivot",
                is_organic=cfg["org"],
                is_demo=True,
            )
            db.add(f)
            db.commit()
            db.refresh(f)

        farms.append(f)

        fld = db.query(Field).filter(Field.farm_id == f.id).first()
        if not fld:
            fld = Field(
                farm_id=f.id,
                name=f"{cfg['crop']} Block A",
                acreage=cfg["ac"],
                soil_type="Clay Loam" if idx % 2 == 0 else "Sandy Loam",
                current_crop=cfg["crop"],
                crop_variety="Standard Hybrid",
                lat=cfg["lat"],
                lng=cfg["lng"],
            )
            db.add(fld)
            db.commit()
            db.refresh(fld)

        fields.append(fld)

    # -------------------------------------------------------------
    # 3. Create ~30 Cases Covering EVERY Status
    # -------------------------------------------------------------
    # Agronomists:
    # agro_avail (index 0), agro_busy (index 1), agro_unavail (index 2), agro_new (index 3)
    agro_avail = agronomists[0]
    agro_busy = agronomists[1]
    agro_unavail = agronomists[2]
    agro_new = agronomists[3]

    # Status distribution
    status_plan = [
        # 1-4: Outbreak cluster cases in Davanagere (Corn, nitrogen_deficiency, last 7 days)
        {"status": CaseState.PENDING_REVIEW, "crop": "Corn", "issue": "nitrogen_deficiency", "farm_idx": 0, "agro": agro_busy, "days_ago": 3, "flag": None, "degraded": False},
        {"status": CaseState.PENDING_REVIEW, "crop": "Corn", "issue": "nitrogen_deficiency", "farm_idx": 1, "agro": agro_busy, "days_ago": 4, "flag": None, "degraded": False},
        {"status": CaseState.PENDING_REVIEW, "crop": "Corn", "issue": "nitrogen_deficiency", "farm_idx": 2, "agro": agro_busy, "days_ago": 5, "flag": None, "degraded": False},
        {"status": CaseState.APPROVED, "crop": "Corn", "issue": "nitrogen_deficiency", "farm_idx": 3, "agro": agro_busy, "days_ago": 6, "flag": None, "degraded": False},
        {"status": CaseState.PENDING_REVIEW, "crop": "Corn", "issue": "nitrogen_deficiency", "farm_idx": 0, "agro": agro_busy, "days_ago": 2, "flag": None, "degraded": False},
        # Dr. Anita Rao now has 4 open cases + let's add 1 more to reach 5 (at limit!)
        {"status": CaseState.PENDING_REVIEW, "crop": "Wheat", "issue": "rust", "farm_idx": 5, "agro": agro_busy, "days_ago": 8, "flag": None, "degraded": False},

        # DRAFT
        {"status": CaseState.DRAFT, "crop": "Soybean", "issue": "pest", "farm_idx": 6, "agro": None, "days_ago": 1, "flag": None, "degraded": False},
        {"status": CaseState.DRAFT, "crop": "Rice", "issue": "blast", "farm_idx": 4, "agro": None, "days_ago": 2, "flag": None, "degraded": False},

        # ANALYZING & ANALYZED
        {"status": CaseState.ANALYZING, "crop": "Corn", "issue": "stem_borer", "farm_idx": 7, "agro": None, "days_ago": 2, "flag": None, "degraded": False},
        {"status": CaseState.ANALYZED, "crop": "Wheat", "issue": "aphids", "farm_idx": 5, "agro": None, "days_ago": 3, "flag": None, "degraded": False},

        # PENDING_REVIEW: Unassigned
        {"status": CaseState.PENDING_REVIEW, "crop": "Rice", "issue": "sheath_blight", "farm_idx": 4, "agro": None, "days_ago": 4, "flag": None, "degraded": False},
        {"status": CaseState.PENDING_REVIEW, "crop": "Soybean", "issue": "caterpillar", "farm_idx": 6, "agro": None, "days_ago": 5, "flag": None, "degraded": False},

        # PENDING_REVIEW: High-Risk Flagged
        {"status": CaseState.PENDING_REVIEW, "crop": "Corn", "issue": "pest", "farm_idx": 1, "agro": agro_avail, "days_ago": 7, "flag": "high_dose_chemical", "degraded": False},
        {"status": CaseState.PENDING_REVIEW, "crop": "Wheat", "issue": "weed", "farm_idx": 5, "agro": agro_avail, "days_ago": 8, "flag": "organic_buffer_violation", "degraded": False},

        # PENDING_REVIEW: AI Degraded Failover
        {"status": CaseState.PENDING_REVIEW, "crop": "Corn", "issue": "deficiency", "farm_idx": 3, "agro": agro_avail, "days_ago": 9, "flag": "ai_availability", "degraded": True},
        {"status": CaseState.PENDING_REVIEW, "crop": "Rice", "issue": "leaf_spot", "farm_idx": 4, "agro": agro_avail, "days_ago": 10, "flag": "ai_availability", "degraded": True},

        # APPROVED
        {"status": CaseState.APPROVED, "crop": "Soybean", "issue": "aphids", "farm_idx": 6, "agro": agro_avail, "days_ago": 12, "flag": None, "degraded": False},
        {"status": CaseState.APPROVED, "crop": "Corn", "issue": "nitrogen_deficiency", "farm_idx": 7, "agro": agro_avail, "days_ago": 14, "flag": None, "degraded": False},

        # APPROVED_WITH_EDITS
        {"status": CaseState.APPROVED_WITH_EDITS, "crop": "Rice", "issue": "stem_rot", "farm_idx": 4, "agro": agro_avail, "days_ago": 16, "flag": None, "degraded": False},
        {"status": CaseState.APPROVED_WITH_EDITS, "crop": "Wheat", "issue": "powdery_mildew", "farm_idx": 5, "agro": agro_avail, "days_ago": 18, "flag": None, "degraded": False},
        {"status": CaseState.APPROVED_WITH_EDITS, "crop": "Soybean", "issue": "deficiency", "farm_idx": 6, "agro": agro_avail, "days_ago": 20, "flag": None, "degraded": False},

        # REJECTED
        {"status": CaseState.REJECTED, "crop": "Corn", "issue": "healthy", "farm_idx": 0, "agro": agro_avail, "days_ago": 22, "flag": None, "degraded": False},
        {"status": CaseState.REJECTED, "crop": "Wheat", "issue": "other", "farm_idx": 5, "agro": agro_avail, "days_ago": 25, "flag": None, "degraded": False},

        # DELIVERED
        {"status": CaseState.DELIVERED, "crop": "Rice", "issue": "blast", "farm_idx": 4, "agro": agro_avail, "days_ago": 28, "flag": None, "degraded": False},
        {"status": CaseState.DELIVERED, "crop": "Corn", "issue": "pest", "farm_idx": 1, "agro": agro_avail, "days_ago": 32, "flag": None, "degraded": False},
        {"status": CaseState.DELIVERED, "crop": "Soybean", "issue": "rust", "farm_idx": 6, "agro": agro_avail, "days_ago": 35, "flag": None, "degraded": False},

        # OUTCOME_REPORTED (with OutcomeFeedback)
        {"status": CaseState.OUTCOME_REPORTED, "crop": "Corn", "issue": "nitrogen_deficiency", "farm_idx": 2, "agro": agro_avail, "days_ago": 40, "flag": None, "degraded": False},
        {"status": CaseState.OUTCOME_REPORTED, "crop": "Wheat", "issue": "rust", "farm_idx": 5, "agro": agro_avail, "days_ago": 45, "flag": None, "degraded": False},
        {"status": CaseState.OUTCOME_REPORTED, "crop": "Rice", "issue": "leaf_folder", "farm_idx": 4, "agro": agro_avail, "days_ago": 50, "flag": None, "degraded": False},

        # BLOCKED
        {"status": CaseState.BLOCKED, "crop": "Corn", "issue": "pest", "farm_idx": 3, "agro": agro_avail, "days_ago": 15, "flag": "banned_chemical_organophosphate", "degraded": False},
        {"status": CaseState.BLOCKED, "crop": "Soybean", "issue": "weed", "farm_idx": 6, "agro": agro_avail, "days_ago": 19, "flag": "unregistered_tank_mix", "degraded": False},
    ]

    created_cases: List[Case] = []

    for i, plan in enumerate(status_plan[:num_cases]):
        c_num = f"DEMO-{1001 + i}"
        existing_c = db.query(Case).filter(Case.case_number == c_num).first()
        if existing_c:
            created_cases.append(existing_c)
            continue

        farm = farms[plan["farm_idx"]]
        fld = fields[plan["farm_idx"]]
        farmer = farmers[plan["farm_idx"] % len(farmers)]
        c_date = now - datetime.timedelta(days=plan["days_ago"], hours=random.randint(1, 12))

        # Multilingual descriptions
        if farmer.language == "hi":
            desc = f"{plan['crop']} की पत्तियों पर {plan['issue']} के स्पष्ट लक्षण दिख रहे हैं। बढ़वार धीमी हो गई है।"
        elif farmer.language == "kn":
            desc = f"{plan['crop']} ಬೆಳೆಯ ಎಲೆಗಳ ಮೇಲೆ {plan['issue']} ಲಕ್ಷಣಗಳು ಕಂಡುಬಂದಿವೆ. ಬೆಳವಣಿಗೆ ಕುಂಠಿತವಾಗಿದೆ."
        else:
            desc = f"Observed visible symptoms of {plan['issue']} on {plan['crop']} foliage across the field."

        case_obj = Case(
            case_number=c_num,
            user_id=farmer.id,
            farm_id=farm.id,
            field_id=fld.id,
            crop=plan["crop"],
            growth_stage="Vegetative",
            status=plan["status"],
            confidence=85.0 if plan["status"] not in (CaseState.DRAFT, CaseState.ANALYZING) else 0.0,
            uncertainty="High" if plan.get("flag") else ("Low" if plan["status"] in (CaseState.APPROVED, CaseState.DELIVERED) else "Medium"),
            summary=f"{plan['issue'].replace('_', ' ').title()} diagnosed on {plan['crop']}",
            description=desc,
            description_lang=farmer.language,
            assigned_agronomist_id=plan["agro"].id if plan["agro"] else None,
            assigned_at=c_date + datetime.timedelta(hours=2) if plan["agro"] else None,
            reassign_count=1 if i in (12, 13) else 0,
            farmer_summary=f"Action plan for {plan['crop']} regarding {plan['issue']}",
            final_suggestion="Apply corrective inputs and scout weekly.",
            decision_note="Expert reviewed symptoms and verified diagnosis." if plan["status"] in (CaseState.APPROVED, CaseState.APPROVED_WITH_EDITS, CaseState.DELIVERED) else None,
            issue_label=plan["issue"].replace("_", " ").title(),
            issue_category=plan["issue"],
            ai_degraded=plan["degraded"],
            location_snapshot={"lat": farm.latitude, "lng": farm.longitude, "accuracy_m": 15.0, "source": "gps"},
            weather_source="api",
            delivered_at=c_date + datetime.timedelta(days=1) if plan["status"] in (CaseState.DELIVERED, CaseState.OUTCOME_REPORTED) else None,
            created_at=c_date,
            updated_at=c_date + datetime.timedelta(hours=6),
            is_demo=True,
        )
        db.add(case_obj)
        db.commit()
        db.refresh(case_obj)
        created_cases.append(case_obj)

        # 1. Leaf Image
        if i % 2 == 0:
            leaf_url = _create_placeholder_leaf_image(i)
            c_file = CaseFile(
                case_id=case_obj.id,
                file_type="image",
                file_path=leaf_url,
                file_name=f"demo_leaf_{i}.png",
            )
            db.add(c_file)

        # 2. Observations
        obs = Observation(
            case_id=case_obj.id,
            description=f"Chlorosis and discoloration matching {plan['issue']}.",
            confidence=0.88,
            uncertainty="Medium",
            note="Field visual assessment",
        )
        db.add(obs)

        # 3. Soil Result
        soil = SoilResult(
            case_id=case_obj.id,
            n_value="14 ppm",
            n_status="Marginal",
            n_ppm=14.0,
            p_ppm=20.0,
            k_ppm=160.0,
            ph=6.4,
            ph_value="pH 6.4",
            sample_date=c_date.strftime("%Y-%m-%d"),
            created_at=c_date,
        )
        db.add(soil)

        # 4. Weather Snapshot
        ws = WeatherSnapshot(
            case_id=case_obj.id,
            temp_max_c=30.0,
            temp_min_c=22.0,
            rainfall_7d_mm=12.5,
            humidity=65.0,
            wind_kmh=10.0,
            uv_index=6.0,
            rainfall_status="Below Average",
            temp_status="Optimal",
            created_at=c_date,
        )
        db.add(ws)

        # 5. Recommendation
        rec = Recommendation(
            case_id=case_obj.id,
            rank=1,
            category="Nutrient" if "deficiency" in plan["issue"] else "Crop Protection",
            title=f"Targeted Treatment for {plan['issue'].replace('_', ' ').title()}",
            confidence=0.89,
            uncertainty="Low",
            evidence=f"Visual diagnosis and regional advisory for {plan['crop']}",
            assumptions="Adequate soil moisture",
            why=f"Directly addresses {plan['issue']} to protect crop yield",
            why_line=f"Why: Directly addresses {plan['issue']} to protect crop yield",
            citation="ICAR Crop Guidance 2026, p. 112",
            chemical_name="Urea (46-0-0)" if "nitrogen" in plan["issue"] else "Azoxystrobin 23% SC",
            chemical_dose=45.0 if "nitrogen" in plan["issue"] else 200.0,
            chemical_unit="kg/acre" if "nitrogen" in plan["issue"] else "ml/acre",
            is_visible_to_farmer=True,
        )
        db.add(rec)

        # 6. Guardrail Results
        gr_status = "PASSED"
        gr_details = "Safety check passed."
        if plan["flag"]:
            gr_status = "BLOCKED" if plan["status"] == CaseState.BLOCKED else "FLAGGED"
            gr_details = f"Triggered guardrail rule: {plan['flag']}"

        gr = GuardrailResult(
            case_id=case_obj.id,
            rule_name=plan["flag"] or "chemical_dosage",
            rule_category="Environmental" if "buffer" in (plan["flag"] or "") else "Safety",
            status=gr_status,
            details=gr_details,
            created_at=c_date,
        )
        db.add(gr)

        # 7. Assignment History (including timeout and admin reassignments)
        if i == 12:  # Timeout reassignment
            db.add(Assignment(case_id=case_obj.id, from_user_id=agro_busy.id, to_user_id=agro_avail.id, reason="timeout", created_at=c_date))
        elif i == 13:  # Admin reassignment
            db.add(Assignment(case_id=case_obj.id, from_user_id=agro_unavail.id, to_user_id=agro_avail.id, reason="admin", created_at=c_date))
        elif plan["agro"]:
            db.add(Assignment(case_id=case_obj.id, from_user_id=None, to_user_id=plan["agro"].id, reason="auto", created_at=c_date))

        # 8. Review Decision
        if plan["status"] in (CaseState.APPROVED, CaseState.APPROVED_WITH_EDITS, CaseState.REJECTED, CaseState.DELIVERED, CaseState.OUTCOME_REPORTED):
            rev = Review(
                case_id=case_obj.id,
                reviewer_id=plan["agro"].id if plan["agro"] else agro_avail.id,
                status=plan["status"] if plan["status"] != CaseState.OUTCOME_REPORTED else CaseState.APPROVED,
                decision="approve" if "APPROVED" in plan["status"] or plan["status"] in (CaseState.DELIVERED, CaseState.OUTCOME_REPORTED) else "reject",
                decided_at=c_date + datetime.timedelta(hours=4),
                notes="Verified symptoms and approved recommendation plan.",
                created_at=c_date + datetime.timedelta(hours=4),
            )
            db.add(rev)

        # 9. Reports (English, Hindi, Kannada)
        if plan["status"] in (CaseState.APPROVED, CaseState.APPROVED_WITH_EDITS, CaseState.DELIVERED, CaseState.OUTCOME_REPORTED):
            rep_en = Report(
                case_id=case_obj.id,
                language="en",
                body_json={
                    "headline": f"Treatment Plan for {plan['crop']}",
                    "whatIsHappening": f"Field shows clear symptoms of {plan['issue']}.",
                    "recommendedActions": [f"Apply recommended dosage for {plan['crop']}."],
                    "safetyWarnings": ["Wear protective gear during handling."],
                },
                created_at=c_date + datetime.timedelta(hours=5),
            )
            rep_hi = Report(
                case_id=case_obj.id,
                language="hi",
                body_json={
                    "headline": f"{plan['crop']} के लिए उपचार योजना",
                    "whatIsHappening": f"खेत में {plan['issue']} के लक्षण पाए गए हैं।",
                    "recommendedActions": ["अनुशंसित मात्रा के अनुसार उपचार करें।"],
                    "safetyWarnings": ["छिड़काव के समय मास्क और दस्ताने पहनें।"],
                },
                created_at=c_date + datetime.timedelta(hours=5),
            )
            rep_kn = Report(
                case_id=case_obj.id,
                language="kn",
                body_json={
                    "headline": f"{plan['crop']} ಬೆಳೆಗಾಗಿ ಚಿಕಿತ್ಸಾ ಯೋಜನೆ",
                    "whatIsHappening": f"ಕ್ಷೇತ್ರದಲ್ಲಿ {plan['issue']} ಲಕ್ಷಣಗಳು ಕಂಡುಬಂದಿವೆ.",
                    "recommendedActions": ["ಶಿಫಾರಸು ಮಾಡಿದ ಪ್ರಮಾಣದಲ್ಲಿ ಔಷಧಿ ಸಿಂಪಡಿಸಿ."],
                    "safetyWarnings": ["ಸಿಂಪಡಿಸುವಾಗ ರಕ್ಷಣಾ ಸಾಧನಗಳನ್ನು ಧರಿಸಿ."],
                },
                created_at=c_date + datetime.timedelta(hours=5),
            )
            db.add_all([rep_en, rep_hi, rep_kn])

        # 10. Messages & Translations (including 3 voice notes)
        if i in (0, 1, 2):
            voice_txt = desc
            voice_url = _generate_demo_demo_voice = _generate_demo_voice_note(i, voice_txt, farmer.language)
            msg = Message(
                case_id=case_obj.id,
                sender_id=farmer.id,
                sender_role="farmer",
                kind="voice",
                original_lang=farmer.language,
                original_text=desc,
                audio_path=voice_url,
                transcript_status="done",
                created_at=c_date,
            )
            db.add(msg)
            db.commit()
            db.refresh(msg)
            # Add translation
            db.add(MessageTranslation(message_id=msg.id, lang="en", text=desc))
        else:
            msg = Message(
                case_id=case_obj.id,
                sender_id=farmer.id,
                sender_role="farmer",
                kind="text",
                original_lang=farmer.language,
                original_text=desc,
                created_at=c_date,
            )
            db.add(msg)
            db.commit()
            db.refresh(msg)
            db.add(MessageTranslation(message_id=msg.id, lang="en", text=desc))

        # 11. Outcome Feedback
        if plan["status"] == CaseState.OUTCOME_REPORTED:
            rating_val = 5 if i % 2 == 0 else 4
            outcome_str = "improved" if rating_val >= 4 else "same"
            fb_comment = "The yellowing reversed within 10 days of application." if farmer.language == "en" else \
                         "उपचार के बाद 10 दिनों में फसल में सुधार हुआ।" if farmer.language == "hi" else \
                         "ಔಷಧಿ ಸಿಂಪಡಿಸಿದ 10 ದಿನಗಳಲ್ಲಿ ಬೆಳೆಯ ಹಳದಿ ಬಣ್ಣ ಕಡಿಮೆಯಾಯಿತು."

            feedb = OutcomeFeedback(
                case_id=case_obj.id,
                user_id=farmer.id,
                agronomist_id=plan["agro"].id if plan["agro"] else agro_avail.id,
                rating=rating_val,
                comment=fb_comment,
                comment_lang=farmer.language,
                actual_diagnosis=plan["issue"].replace("_", " ").title(),
                treatments_applied=["Urea side-dressing", "Water management"],
                yield_impact_rating=rating_val,
                harvest_yield=38.5,
                outcome=outcome_str,
                outcome_comment="Yield recovered satisfactorily.",
                outcome_reported_at=c_date + datetime.timedelta(days=20),
                created_at=c_date + datetime.timedelta(days=20),
            )
            db.add(feedb)

    db.commit()

    # -------------------------------------------------------------
    # 4. Create Weather Alerts (For every rule)
    # -------------------------------------------------------------
    alert_rules = [
        ("heavy_rain", "warning", {"date": now.strftime("%Y-%m-%d"), "mm": 35.0}),
        ("frost_freeze", "high", {"date": now.strftime("%Y-%m-%d"), "temp": 1.2}),
        ("extreme_heat", "high", {"date": now.strftime("%Y-%m-%d"), "temp": 41.5}),
        ("strong_wind", "warning", {"date": now.strftime("%Y-%m-%d"), "speed": 45.0}),
        ("high_humidity", "info", {"date": now.strftime("%Y-%m-%d"), "humidity": 92.0}),
        ("sensor_low_moisture", "warning", {"moisture": 14.5}),
        ("sensor_high_ph", "info", {"ph": 8.2}),
        ("sensor_low_nitrogen", "high", {"nitrogen": 8.0}),
    ]

    for idx, (rule, sev, params) in enumerate(alert_rules):
        target_farm = farms[idx % len(farms)]
        w_alert = WeatherAlert(
            farm_id=target_farm.id,
            field_id=fields[idx % len(fields)].id,
            source="sensor" if "sensor" in rule else "weather",
            rule=rule,
            severity=sev,
            start_date=now.date(),
            params=params,
            dedupe_key=f"demo:{target_farm.id}:{rule}:{idx}",
            created_at=now - datetime.timedelta(days=idx + 1),
            is_demo=True,
        )
        db.add(w_alert)

    # -------------------------------------------------------------
    # 5. Create Notifications (Every event type, read & unread)
    # -------------------------------------------------------------
    event_types = [
        ("high_risk_flag", "High Risk Case Flagged", "A case requires urgent safety review.", agro_avail.id, False),
        ("review_required", "New Case Ready for Review", "Case DEMO-1004 is awaiting your expert decision.", agro_busy.id, True),
        ("case_approved", "Your Case Decision is Ready", "Dr. Rajesh Kumar has approved your treatment plan.", farmers[0].id, True),
        ("case_rejected", "Case Clarification Needed", "Please provide clearer leaf photos.", farmers[1].id, False),
        ("feedback_reminder", "How is your crop doing?", "Please report your yield outcome for DEMO-1025.", farmers[2].id, False),
        ("outbreak_detected", "Regional Advisory Alert", "A regional advisory has been detected within 25 km.", farmers[0].id, True),
    ]

    for event, title, msg_text, uid, is_read in event_types:
        notif = Notification(
            user_id=uid,
            event=event,
            title=title,
            message=msg_text,
            channel="in_app",
            status="read" if is_read else "sent",
            is_read=is_read,
            is_demo=True,
            created_at=now - datetime.timedelta(days=random.randint(1, 15)),
        )
        db.add(notif)

    # -------------------------------------------------------------
    # 6. Create 6 Months of Eval Runs with Metric Trends
    # -------------------------------------------------------------
    eval_trends = [
        {"days_ago": 160, "acc": 0.78, "cases": 50, "prec": 0.76, "rec": 0.79},
        {"days_ago": 130, "acc": 0.82, "cases": 50, "prec": 0.81, "rec": 0.83},
        {"days_ago": 100, "acc": 0.85, "cases": 50, "prec": 0.84, "rec": 0.86},
        {"days_ago": 70, "acc": 0.89, "cases": 50, "prec": 0.88, "rec": 0.90},
        {"days_ago": 40, "acc": 0.91, "cases": 50, "prec": 0.90, "rec": 0.92},
        {"days_ago": 10, "acc": 0.94, "cases": 50, "prec": 0.93, "rec": 0.95},
    ]

    for e_idx, tr in enumerate(eval_trends):
        er = EvalRun(
            run_name=f"Demo Benchmark Run #{e_idx+1}",
            model="gemini-2.5-flash",
            prompt_version=2 if e_idx >= 3 else 1,
            total_cases=tr["cases"],
            accuracy=tr["acc"],
            metrics={
                "precision": tr["prec"],
                "recall": tr["rec"],
                "f1_score": round(2 * (tr["prec"] * tr["rec"]) / (tr["prec"] + tr["rec"]), 3),
            },
            status="completed",
            started_at=now - datetime.timedelta(days=tr["days_ago"], hours=2),
            finished_at=now - datetime.timedelta(days=tr["days_ago"]),
            created_at=now - datetime.timedelta(days=tr["days_ago"]),
            is_demo=True,
        )
        db.add(er)
        db.commit()
        db.refresh(er)

        # Per-case failures & passes
        for c_i in range(5):
            passed_case = c_i < int(5 * tr["acc"])
            c_res = EvalCaseResult(
                eval_run_id=er.id,
                case_id=f"benchmark_case_{c_i+1}",
                case_type="image",
                passed=passed_case,
            )
            db.add(c_res)

    # -------------------------------------------------------------
    # 7. Prompt Templates: 2 Versions Per Step
    # -------------------------------------------------------------
    prompt_steps = ["image_analysis", "recommendation", "safety_check", "environmental"]
    for step in prompt_steps:
        # Version 1
        t1 = db.query(PromptTemplate).filter(PromptTemplate.step == step, PromptTemplate.version == 1).first()
        if not t1:
            t1 = PromptTemplate(
                step=step,
                version=1,
                is_active=False,
                title=f"{step.replace('_', ' ').title()} V1",
                subtitle="Baseline production prompt",
                template=f"Perform {step} on {{crop_type}} at {{growth_stage}}.",
                variables=["{{crop_type}}", "{{growth_stage}}"],
            )
            db.add(t1)

        # Version 2
        t2 = db.query(PromptTemplate).filter(PromptTemplate.step == step, PromptTemplate.version == 2).first()
        if not t2:
            t2 = PromptTemplate(
                step=step,
                version=2,
                is_active=True,
                title=f"{step.replace('_', ' ').title()} V2 (Optimized)",
                subtitle="Calibrated with chain-of-thought agronomic guardrails",
                template=f"Expert Agronomist reasoning for {step}: Analyze {{crop_type}} at {{growth_stage}} with high confidence bounds.",
                variables=["{{crop_type}}", "{{growth_stage}}", "{{confidence}}"],
            )
            db.add(t2)

    # -------------------------------------------------------------
    # 8. Sample LLM Calls
    # -------------------------------------------------------------
    for k in range(5):
        llm_c = LLMCall(
            case_id=created_cases[k].id if created_cases else None,
            step="recommendation",
            prompt_version=2,
            model="gemini-2.5-flash",
            tokens_in=540 + (k * 20),
            tokens_out=190 + (k * 15),
            latency_ms=1150 + (k * 80),
            output_json={"status": "success", "candidates_generated": 3},
            cache_key=f"demo_cache_key_{k}",
            created_at=now - datetime.timedelta(days=k + 1),
        )
        db.add(llm_c)

    db.commit()

    # -------------------------------------------------------------
    # 9. Run Outbreak Detector on the 4-Farm Cluster
    # -------------------------------------------------------------
    try:
        detected = detect_outbreaks(db, radius_km=25.0, min_farms=3, alert_farms=6, window_days=14)
        for ob in detected:
            ob.is_demo = True
        db.commit()
        logger.info(f"Demo outbreak detection triggered: {len(detected)} outbreak(s) active.")
    except Exception as e:
        logger.warning(f"Demo outbreak detection execution note: {e}")

    final_status = get_demo_status(db)
    logger.info(f"Demo data successfully loaded: {final_status['counts']}")

    return {
        "success": True,
        "message": "Demo data successfully seeded across all entity types.",
        "counts": final_status["counts"],
    }
