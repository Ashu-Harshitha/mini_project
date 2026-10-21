import csv
import io
import datetime
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.config import settings
from app.models.models import (
    User,
    Case,
    Assignment,
    Message,
    MessageTranslation,
    OutcomeFeedback,
    Review,
    Notification,
)
from app.schemas.schemas import (
    AdminUserRead,
    AdminCreateAgronomist,
    AdminResetPassword,
    AdminAgronomistRead,
    AdminAgronomistUpdate,
    AdminAssignIn,
    AdminCommunicationRead,
    AdminFeedbackRead,
    CaseRead,
    AdminCaseRead,
    AdminNotificationLogItem,
    AdminNotificationLogResponse,
    AdminNotificationTestIn,
    AdminAnalyticsResponse,
    AdminDemoStatusResponse,
    AdminDemoLoadRequest,
    AdminDemoLoadResponse,
    AdminDemoResetResponse,
)
from app.services.demo_loader import get_demo_status, load_demo_data, reset_demo_data
from app.services.analytics import (
    parse_and_validate_range,
    get_admin_analytics_data,
    export_analytics_csv,
)
from app.api.deps import require_role, get_current_user
from app.api.routes.auth import validate_username, validate_password
from app.auth.firebase_client import get_firebase, FirebaseClient
from app.services.assignment import get_agronomist_open_count
from app.services.ai.gemini_client import get_gemini_client
from app.services.notifications import notify

logger = logging.getLogger("agriadvisor.admin")

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_role("admin"))])


@router.get("/users", response_model=List[AdminUserRead])
def list_users(
    role: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    List active users with optional role filtering. Admin only.
    """
    query = db.query(User).filter(User.active == True)
    if role:
        query = query.filter(User.role == role.lower())
    users = query.order_by(User.id.asc()).all()
    return users


@router.post("/agronomists", status_code=status.HTTP_201_CREATED, response_model=AdminUserRead)
def create_agronomist(
    payload: AdminCreateAgronomist,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("admin")),
    fb: FirebaseClient = Depends(get_firebase),
):
    """
    Create a new agronomist user. Role is fixed to 'agronomist'. Admin only.
    Enforces username validation and min 6-char password.
    """
    clean_username = validate_username(payload.username)
    validate_password(payload.password)

    # Check DB uniqueness
    existing_db = db.query(User).filter(func.lower(User.username) == clean_username).first()
    if existing_db:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    # Check Firebase uniqueness
    login_email = f"{clean_username}@{settings.AUTH_EMAIL_DOMAIN}".lower()
    existing_fb = fb.get_user_by_email(login_email)
    if existing_fb:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    # 1. Create Firebase user
    try:
        uid = fb.create_user(
            email=login_email,
            password=payload.password,
            display_name=payload.full_name,
        )
        fb.set_role_claim(uid, "agronomist")
    except Exception as e:
        logger.error(f"Failed to create agronomist in Firebase: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create agronomist identity.",
        )

    # 2. Insert DB row
    agronomist = User(
        username=clean_username,
        firebase_uid=uid,
        full_name=payload.full_name,
        role="agronomist",
        email=str(payload.email) if payload.email else None,
        phone=payload.phone,
        language="en",
        active=True,
        available=True,
        max_open_cases=settings.DEFAULT_MAX_OPEN_CASES,
        created_by=current_admin.id,
    )
    db.add(agronomist)
    try:
        db.commit()
        db.refresh(agronomist)
    except Exception as e:
        db.rollback()
        logger.error(f"DB insert failed for agronomist {clean_username}: {e}")
        try:
            fb.delete_user(uid)
        except Exception as del_err:
            logger.error(f"Failed to delete Firebase user {uid} on rollback: {del_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database record creation failed.",
        )

    return agronomist


@router.get("/agronomists", response_model=List[AdminAgronomistRead])
def list_agronomists_metrics(db: Session = Depends(get_db)):
    """
    List agronomists with operational metrics:
    name, username, available, open_count, max_open_cases, total_reviewed, avg feedback rating.
    """
    agronomists = (
        db.query(User)
        .filter(User.role == "agronomist", User.active == True)
        .order_by(User.id.asc())
        .all()
    )

    results = []
    for agro in agronomists:
        open_count = get_agronomist_open_count(db, agro.id)
        total_reviewed = (
            db.query(func.count(Review.id))
            .filter(Review.reviewer_id == agro.id)
            .scalar() or 0
        )
        avg_rating_val = (
            db.query(func.avg(OutcomeFeedback.rating))
            .filter(OutcomeFeedback.agronomist_id == agro.id)
            .scalar()
        )
        avg_rating = round(float(avg_rating_val), 1) if avg_rating_val is not None else 5.0

        accepted_count = (
            db.query(func.count(Review.id))
            .filter(
                Review.reviewer_id == agro.id,
                Review.status.in_(("APPROVED", "DELIVERED", "approve", "approved")),
            )
            .scalar() or 0
        )
        accepted_with_edits_count = (
            db.query(func.count(Review.id))
            .filter(
                Review.reviewer_id == agro.id,
                Review.status.in_(("APPROVED_WITH_EDITS", "approve_with_edits", "approved_with_edits")),
            )
            .scalar() or 0
        )
        rejected_count = (
            db.query(func.count(Review.id))
            .filter(
                Review.reviewer_id == agro.id,
                Review.status.in_(("REJECTED", "reject", "rejected")),
            )
            .scalar() or 0
        )
        positive_reviews_count = (
            db.query(func.count(OutcomeFeedback.id))
            .filter(OutcomeFeedback.agronomist_id == agro.id, OutcomeFeedback.rating >= 4)
            .scalar() or 0
        )
        negative_reviews_count = (
            db.query(func.count(OutcomeFeedback.id))
            .filter(OutcomeFeedback.agronomist_id == agro.id, OutcomeFeedback.rating <= 2)
            .scalar() or 0
        )

        results.append(
            AdminAgronomistRead(
                id=agro.id,
                name=agro.full_name or agro.username,
                username=agro.username,
                available=agro.available,
                open_count=open_count,
                max_open_cases=agro.max_open_cases or settings.DEFAULT_MAX_OPEN_CASES,
                total_reviewed=total_reviewed,
                avg_feedback_rating=avg_rating,
                accepted_count=accepted_count,
                accepted_with_edits_count=accepted_with_edits_count,
                rejected_count=rejected_count,
                positive_reviews_count=positive_reviews_count,
                negative_reviews_count=negative_reviews_count,
            )
        )
    return results


@router.patch("/agronomists/{agronomist_id}", response_model=AdminAgronomistRead)
def update_agronomist_config(
    agronomist_id: int,
    payload: AdminAgronomistUpdate,
    db: Session = Depends(get_db),
):
    """
    Update max_open_cases or availability for an agronomist. Admin only.
    """
    agro = db.query(User).filter(User.id == agronomist_id, User.role == "agronomist", User.active == True).first()
    if not agro:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agronomist not found")

    if payload.max_open_cases is not None:
        if payload.max_open_cases < 1:
            raise HTTPException(status_code=400, detail="max_open_cases must be at least 1")
        agro.max_open_cases = payload.max_open_cases

    if payload.available is not None:
        agro.available = payload.available

    db.commit()
    db.refresh(agro)

    open_count = get_agronomist_open_count(db, agro.id)
    total_reviewed = db.query(func.count(Review.id)).filter(Review.reviewer_id == agro.id).scalar() or 0
    avg_rating_val = db.query(func.avg(OutcomeFeedback.rating)).filter(OutcomeFeedback.agronomist_id == agro.id).scalar()
    avg_rating = round(float(avg_rating_val), 1) if avg_rating_val is not None else 5.0

    accepted_count = db.query(func.count(Review.id)).filter(Review.reviewer_id == agro.id, Review.status.in_(("APPROVED", "DELIVERED"))).scalar() or 0
    accepted_with_edits_count = db.query(func.count(Review.id)).filter(Review.reviewer_id == agro.id, Review.status.in_(("APPROVED_WITH_EDITS",))).scalar() or 0
    rejected_count = db.query(func.count(Review.id)).filter(Review.reviewer_id == agro.id, Review.status.in_(("REJECTED",))).scalar() or 0
    positive_reviews_count = db.query(func.count(OutcomeFeedback.id)).filter(OutcomeFeedback.agronomist_id == agro.id, OutcomeFeedback.rating >= 4).scalar() or 0
    negative_reviews_count = db.query(func.count(OutcomeFeedback.id)).filter(OutcomeFeedback.agronomist_id == agro.id, OutcomeFeedback.rating <= 2).scalar() or 0

    return AdminAgronomistRead(
        id=agro.id,
        name=agro.full_name or agro.username,
        username=agro.username,
        available=agro.available,
        open_count=open_count,
        max_open_cases=agro.max_open_cases,
        total_reviewed=total_reviewed,
        avg_feedback_rating=avg_rating,
        accepted_count=accepted_count,
        accepted_with_edits_count=accepted_with_edits_count,
        rejected_count=rejected_count,
        positive_reviews_count=positive_reviews_count,
        negative_reviews_count=negative_reviews_count,
    )


@router.get("/cases", response_model=List[AdminCaseRead])
def admin_list_cases(
    status: Optional[str] = None,
    agronomist_id: Optional[int] = None,
    unassigned: Optional[bool] = None,
    farmer_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    List all cases with admin filtering options, including handling agronomist details, suggestions, and feedback.
    """
    query = db.query(Case)
    if status and status != "All":
        query = query.filter(Case.status == status)
    if agronomist_id:
        query = query.filter(Case.assigned_agronomist_id == agronomist_id)
    if unassigned is True:
        query = query.filter(Case.assigned_agronomist_id.is_(None))
    if farmer_id:
        query = query.filter(Case.user_id == farmer_id)

    cases = query.order_by(Case.created_at.desc()).all()
    results = []
    for c in cases:
        farmer = db.query(User).filter(User.id == c.user_id).first()
        agro = db.query(User).filter(User.id == c.assigned_agronomist_id).first() if c.assigned_agronomist_id else None
        fb = db.query(OutcomeFeedback).filter(OutcomeFeedback.case_id == c.id).first()

        results.append(
            AdminCaseRead(
                id=c.id,
                case_number=c.case_number,
                farmer_id=c.user_id,
                farmer_name=farmer.full_name or farmer.username if farmer else f"Farmer #{c.user_id}",
                status=c.status,
                crop=c.crop,
                description=c.description,
                assigned_agronomist_id=c.assigned_agronomist_id,
                assigned_agronomist_name=agro.full_name or agro.username if agro else None,
                assigned_at=c.assigned_at,
                decision_note=c.decision_note,
                final_suggestion=c.final_suggestion,
                farmer_feedback_rating=fb.rating if fb else None,
                farmer_feedback_comment=fb.comment if fb else None,
                reassign_count=c.reassign_count or 0,
                created_at=c.created_at,
            )
        )
    return results


@router.post("/cases/{case_id}/assign")
def admin_assign_case(
    case_id: int,
    payload: AdminAssignIn,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("admin")),
):
    """
    Admin manually assigns a case to an agronomist (bypasses capacity limits, reason='admin').
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    target_agro = db.query(User).filter(User.id == payload.agronomist_id, User.role == "agronomist", User.active == True).first()
    if not target_agro:
        raise HTTPException(status_code=404, detail="Target agronomist not found or inactive")

    now = datetime.datetime.utcnow()
    old_agronomist_id = case.assigned_agronomist_id

    case.assigned_agronomist_id = target_agro.id
    case.assigned_at = now
    target_agro.last_assigned_at = now

    assignment = Assignment(
        case_id=case.id,
        from_user_id=old_agronomist_id,
        to_user_id=target_agro.id,
        reason="admin",
        created_at=now,
    )
    db.add(assignment)
    db.commit()

    # Notify Agronomist
    notify(
        "case_assigned",
        target_agro,
        {
            "case_number": case.case_number,
            "case_id": case.id,
            "message": f"Case {case.case_number} has been assigned to you by administrator {current_admin.username}."
        },
        db,
        case_id=case.id,
    )

    # Notify Farmer
    farmer = db.query(User).filter(User.id == case.user_id).first()
    if farmer:
        agro_display = target_agro.full_name or target_agro.username
        notify(
            "case_assigned",
            farmer,
            {
                "case_number": case.case_number,
                "case_id": case.id,
                "agronomist_name": agro_display,
                "message": f"Your case {case.case_number} has been assigned to agronomist {agro_display}."
            },
            db,
            case_id=case.id,
        )

    return {
        "status": "success",
        "case_id": case.id,
        "assigned_agronomist_id": target_agro.id,
        "assigned_agronomist_name": target_agro.full_name or target_agro.username,
    }


def _fetch_admin_communications_data(
    db: Session,
    admin_lang: str,
    farmer_id: Optional[int] = None,
    agronomist_id: Optional[int] = None,
    case_id: Optional[int] = None,
    kind: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> List[AdminCommunicationRead]:
    query = (
        db.query(Message, Case, User)
        .join(Case, Message.case_id == Case.id)
        .join(User, Message.sender_id == User.id)
    )

    if case_id:
        query = query.filter(Message.case_id == case_id)
    if kind and kind != "All":
        query = query.filter(Message.kind == kind)
    if farmer_id:
        query = query.filter(Case.user_id == farmer_id)
    if agronomist_id:
        query = query.filter(Case.assigned_agronomist_id == agronomist_id)
    if start_date:
        try:
            s_dt = datetime.datetime.fromisoformat(start_date)
            query = query.filter(Message.created_at >= s_dt)
        except Exception:
            pass
    if end_date:
        try:
            e_dt = datetime.datetime.fromisoformat(end_date)
            query = query.filter(Message.created_at <= e_dt)
        except Exception:
            pass

    records = query.order_by(Message.created_at.desc()).all()

    # Pre-cache translations for admin language
    gemini = get_gemini_client()
    missing_translations = []
    cached_map = {}

    msg_ids = [m.id for m, _, _ in records]
    if msg_ids:
        existing = db.query(MessageTranslation).filter(
            MessageTranslation.message_id.in_(msg_ids),
            MessageTranslation.lang == admin_lang,
        ).all()
        for t in existing:
            cached_map[t.message_id] = t.text

    for m, _, _ in records:
        if m.original_lang != admin_lang and m.id not in cached_map and m.original_text:
            missing_translations.append((m.id, m.original_text))

    if missing_translations:
        texts = [txt for _, txt in missing_translations]
        translated = gemini.batch_translate(texts, admin_lang)
        for (mid, _), t_txt in zip(missing_translations, translated):
            new_tr = MessageTranslation(message_id=mid, lang=admin_lang, text=t_txt)
            db.add(new_tr)
            cached_map[mid] = t_txt
        db.commit()

    results = []
    for m, c, sender in records:
        # Resolve farmer and agronomist names
        farmer = db.query(User).filter(User.id == c.user_id).first()
        agronomist = db.query(User).filter(User.id == c.assigned_agronomist_id).first() if c.assigned_agronomist_id else None

        if m.original_lang == admin_lang:
            disp_text = m.original_text
        else:
            disp_text = cached_map.get(m.id, m.original_text)

        audio_url = f"/v1/media/voice/{m.id}" if m.audio_path else None

        results.append(
            AdminCommunicationRead(
                id=m.id,
                case_id=c.id,
                case_number=c.case_number,
                farmer_id=c.user_id,
                farmer_name=farmer.full_name or farmer.username if farmer else f"Farmer #{c.user_id}",
                agronomist_id=c.assigned_agronomist_id,
                agronomist_name=agronomist.full_name or agronomist.username if agronomist else None,
                sender_role=m.sender_role,
                kind=m.kind,
                original_text=m.original_text,
                text=disp_text,
                audio_url=audio_url,
                created_at=m.created_at,
            )
        )
    return results


@router.get("/communications", response_model=List[AdminCommunicationRead])
def get_admin_communications(
    farmer_id: Optional[int] = None,
    agronomist_id: Optional[int] = None,
    case_id: Optional[int] = None,
    kind: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("admin")),
):
    """
    Search and inspect communication logs across cases, with text translated to admin's language.
    """
    admin_lang = current_admin.language or "en"
    all_data = _fetch_admin_communications_data(
        db, admin_lang, farmer_id, agronomist_id, case_id, kind, start_date, end_date
    )
    start_idx = (page - 1) * limit
    return all_data[start_idx : start_idx + limit]


@router.get("/communications.csv")
def export_admin_communications_csv(
    farmer_id: Optional[int] = None,
    agronomist_id: Optional[int] = None,
    case_id: Optional[int] = None,
    kind: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("admin")),
):
    """
    Export communication logs to CSV with translated text and timestamps.
    """
    admin_lang = current_admin.language or "en"
    records = _fetch_admin_communications_data(
        db, admin_lang, farmer_id, agronomist_id, case_id, kind, start_date, end_date
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Message ID",
        "Case Number",
        "Sender Role",
        "Kind",
        "Original Text",
        f"Translated Text ({admin_lang})",
        "Has Audio",
        "Farmer Name",
        "Agronomist Name",
        "Created At",
    ])

    for r in records:
        writer.writerow([
            r.id,
            r.case_number,
            r.sender_role,
            r.kind,
            r.original_text or "",
            r.text or "",
            "Yes" if r.audio_url else "No",
            r.farmer_name,
            r.agronomist_name or "",
            r.created_at.isoformat(),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=communications.csv"},
    )


@router.get("/feedback", response_model=List[AdminFeedbackRead])
def get_admin_feedback(
    agronomist_id: Optional[int] = None,
    rating: Optional[int] = None,
    case_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("admin")),
):
    """
    View farmer feedback across cases, with comments translated into the admin's language.
    """
    query = (
        db.query(OutcomeFeedback, Case, User)
        .join(Case, OutcomeFeedback.case_id == Case.id)
        .join(User, OutcomeFeedback.user_id == User.id)
    )

    if agronomist_id:
        query = query.filter(OutcomeFeedback.agronomist_id == agronomist_id)
    if rating:
        query = query.filter(OutcomeFeedback.rating == rating)
    if case_id:
        query = query.filter(OutcomeFeedback.case_id == case_id)

    rows = query.order_by(OutcomeFeedback.created_at.desc()).all()

    admin_lang = current_admin.language or "en"
    gemini = get_gemini_client()

    results = []
    for fb_row, c, farmer in rows:
        agronomist = db.query(User).filter(User.id == fb_row.agronomist_id).first() if fb_row.agronomist_id else None

        comment_tr = fb_row.comment
        if fb_row.comment and fb_row.comment_lang != admin_lang:
            comment_tr = gemini.translate(fb_row.comment, admin_lang)

        results.append(
            AdminFeedbackRead(
                id=fb_row.id,
                case_id=c.id,
                case_number=c.case_number,
                farmer_id=farmer.id,
                farmer_name=farmer.full_name or farmer.username,
                agronomist_id=fb_row.agronomist_id,
                agronomist_name=agronomist.full_name or agronomist.username if agronomist else None,
                rating=fb_row.rating,
                comment=fb_row.comment,
                comment_translated=comment_tr,
                created_at=fb_row.created_at,
            )
        )
    return results


@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    payload: AdminResetPassword,
    db: Session = Depends(get_db),
    fb: FirebaseClient = Depends(get_firebase),
):
    """
    Reset a user's password in Firebase. Admin only.
    """
    validate_password(payload.new_password)
    target_user = db.query(User).filter(User.id == user_id, User.active == True).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    try:
        fb.update_password(target_user.firebase_uid, payload.new_password)
    except Exception as e:
        logger.error(f"Failed to update password in Firebase: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update password in identity service.",
        )

    return {"status": "success", "message": "Password updated successfully"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_role("admin")),
    fb: FirebaseClient = Depends(get_firebase),
):
    """
    Delete a user: deletes from Firebase and performs soft delete in DB.
    Admins and oneself cannot be deleted.
    """
    target_user = db.query(User).filter(User.id == user_id, User.active == True).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if target_user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own admin account",
        )

    if target_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete an administrator account",
        )

    # 1. Delete in Firebase
    try:
        fb.delete_user(target_user.firebase_uid)
    except Exception as e:
        logger.warning(f"Failed to delete Firebase user {target_user.firebase_uid}: {e}")

    # 2. Soft delete in DB
    target_user.active = False
    db.commit()

    return {"status": "success", "message": f"User '{target_user.username}' deactivated successfully"}


@router.get("/notification-log", response_model=AdminNotificationLogResponse)
def get_admin_notification_log(
    channel: Optional[str] = None,
    status: Optional[str] = None,
    user_id: Optional[int] = None,
    event: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    """
    Returns global notification audit logs with multi-field filtering and paging.
    """
    query = db.query(Notification, User.username).outerjoin(User, Notification.user_id == User.id)

    if channel:
        query = query.filter(Notification.channel == channel.lower())
    if status:
        query = query.filter(Notification.status == status.lower())
    if user_id:
        query = query.filter(Notification.user_id == user_id)
    if event:
        query = query.filter(Notification.event == event)
    if start_date:
        try:
            s_dt = datetime.datetime.fromisoformat(start_date)
            query = query.filter(Notification.created_at >= s_dt)
        except Exception:
            pass
    if end_date:
        try:
            e_dt = datetime.datetime.fromisoformat(end_date)
            query = query.filter(Notification.created_at <= e_dt)
        except Exception:
            pass

    total = query.count()
    rows = (
        query.order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for notif, uname in rows:
        items.append(
            AdminNotificationLogItem(
                id=notif.id,
                user_id=notif.user_id,
                username=uname,
                event=notif.event,
                title=notif.title,
                message=notif.message,
                channel=notif.channel,
                status=notif.status,
                error=notif.error,
                attempts=notif.attempts,
                is_read=notif.is_read,
                case_id=notif.case_id,
                created_at=notif.created_at,
            )
        )

    return AdminNotificationLogResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/notifications/test")
def send_admin_test_notification(
    payload: AdminNotificationTestIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dispatches a test notification for the requested channel to the admin themselves.
    """
    channel = payload.channel.lower().strip()
    if channel not in ("email", "whatsapp", "sms", "in_app"):
        raise HTTPException(
            status_code=400,
            detail="Channel must be one of: email, whatsapp, sms, in_app",
        )

    subject = f"Test Notification ({channel.upper()})"
    plain_body = f"This is a test notification on channel {channel} for administrator {current_user.username}."
    html_body = f"<!DOCTYPE html><html><body><p>{plain_body}</p></body></html>"

    if channel == "in_app":
        notif = Notification(
            user_id=current_user.id,
            event="admin_test",
            title=subject,
            message=plain_body,
            channel="in_app",
            status="sent",
            attempts=1,
            is_read=False,
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)
        return {
            "status": "sent",
            "channel": "in_app",
            "notification_id": notif.id,
            "error": None,
        }

    from app.services.notifications import dispatch_channel
    notif = dispatch_channel(
        channel=channel,
        user=current_user,
        subject=subject,
        plain_body=plain_body,
        html_body=html_body,
        event="admin_test",
        case_id=None,
        db=db,
    )

    return {
        "status": notif.status,
        "channel": channel,
        "error": notif.error,
        "notification_id": notif.id,
        "attempts": notif.attempts,
    }


# -----------------------------
# Admin Analytics Endpoints
# -----------------------------
@router.get("/analytics", response_model=AdminAnalyticsResponse)
def get_analytics(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
):
    """
    Returns admin analytics with KPIs, period comparisons, zero-filled daily charts,
    breakdowns, funnel, agronomist workload, and sensor/weather insights.
    Cached for 60 seconds.
    """
    try:
        from_dt, to_dt, prev_from_dt, prev_to_dt = parse_and_validate_range(from_date, to_date)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    data = get_admin_analytics_data(
        db=db,
        from_dt=from_dt,
        to_dt=to_dt,
        prev_from_dt=prev_from_dt,
        prev_to_dt=prev_to_dt,
        use_cache=True,
    )
    return data


@router.get("/analytics/export.csv")
def export_analytics(
    section: str = Query("kpis", pattern="^(kpis|cases|agents|sensors)$"),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
):
    """
    Exports analytics section as CSV with UTF-8 BOM and formula injection protection.
    """
    try:
        from_dt, to_dt, prev_from_dt, prev_to_dt = parse_and_validate_range(from_date, to_date)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    data = get_admin_analytics_data(
        db=db,
        from_dt=from_dt,
        to_dt=to_dt,
        prev_from_dt=prev_from_dt,
        prev_to_dt=prev_to_dt,
        use_cache=True,
    )

    try:
        csv_content = export_analytics_csv(data, section=section)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    filename = f"analytics_{section}_{from_dt.strftime('%Y%m%d')}_{to_dt.strftime('%Y%m%d')}.csv"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "text/csv; charset=utf-8",
    }
    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8")),
        media_type="text/csv",
        headers=headers,
    )


# ---------------------------------------------------------------------------
# Demo Data Management Endpoints
# ---------------------------------------------------------------------------
@router.get("/demo/status", response_model=AdminDemoStatusResponse)
def demo_status(db: Session = Depends(get_db)):
    """
    Returns whether demo data operations are enabled and current demo counts.
    """
    return get_demo_status(db)


@router.post("/demo/load", response_model=AdminDemoLoadResponse)
def load_demo(
    payload: Optional[AdminDemoLoadRequest] = Body(None),
    db: Session = Depends(get_db),
):
    """
    Loads comprehensive demo data across all entity types.
    Requires ALLOW_DEMO_DATA=true in server settings (403 otherwise).
    """
    if not getattr(settings, "ALLOW_DEMO_DATA", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo data operations are disabled. Set ALLOW_DEMO_DATA=true in server configuration.",
        )
    num_cases = payload.cases if payload and payload.cases else 30
    no_firebase = payload.no_firebase if payload else False
    result = load_demo_data(db, num_cases=num_cases, no_firebase=no_firebase)
    return result


@router.delete("/demo", response_model=AdminDemoResetResponse)
def reset_demo(db: Session = Depends(get_db)):
    """
    Deletes all demo records in dependency order, preserving production data.
    Requires ALLOW_DEMO_DATA=true in server settings (403 otherwise).
    """
    if not getattr(settings, "ALLOW_DEMO_DATA", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo data operations are disabled. Set ALLOW_DEMO_DATA=true in server configuration.",
        )
    deleted = reset_demo_data(db)
    return {
        "success": True,
        "message": "Demo data successfully removed.",
        "deleted": deleted,
    }



