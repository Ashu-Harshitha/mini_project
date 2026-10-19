import re
import time
import logging
from collections import defaultdict
from threading import Lock
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.config import settings
from app.models.models import User
from app.schemas.schemas import (
    UserRegister,
    UserRegisterResponse,
    UserMe,
    AvailabilityUpdate,
    LanguageUpdate,
)
from app.api.deps import get_current_user
from app.auth.firebase_client import get_firebase, FirebaseClient

logger = logging.getLogger("agriadvisor.auth")

router = APIRouter(prefix="/auth", tags=["Authentication"])
me_router = APIRouter(tags=["Authentication"])

# Thread-safe in-memory rate limiter: 5 requests / minute per IP
_rate_limits = defaultdict(list)
_rate_limit_lock = Lock()
USERNAME_REGEX = re.compile(r"^[a-z0-9_.]{3,20}$")


def check_register_rate_limit(request: Request):
    ip = "unknown"
    if request.client and request.client.host:
        ip = request.client.host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()

    now = time.time()
    with _rate_limit_lock:
        _rate_limits[ip] = [t for t in _rate_limits[ip] if now - t < 60]
        if len(_rate_limits[ip]) >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts, try again in a minute.",
            )
        _rate_limits[ip].append(now)


def validate_username(username: str) -> str:
    cleaned = username.strip().lower()
    if not USERNAME_REGEX.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username must be 3-20 characters long and contain only lowercase letters, digits, underscores, or periods.",
        )
    return cleaned


def validate_password(password: str) -> str:
    if len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 6 characters long.",
        )
    return password


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=UserRegisterResponse,
    dependencies=[Depends(check_register_rate_limit)],
)
def register_farmer(
    payload: UserRegister,
    db: Session = Depends(get_db),
    fb: FirebaseClient = Depends(get_firebase),
):
    """
    Public registration endpoint: FARMER ONLY.
    Ignores any role passed in payload.
    Enforces username rules and min 6-char password.
    Creates Firebase user, sets 'farmer' custom claim, and inserts DB row.
    Rolls back Firebase user creation if DB insertion fails.
    """
    clean_username = validate_username(payload.username)
    validate_password(payload.password)

    # Check case-insensitive uniqueness in DB
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

    # 1. Create Firebase User
    try:
        uid = fb.create_user(
            email=login_email,
            password=payload.password,
            display_name=payload.full_name,
        )
        fb.set_role_claim(uid, "farmer")
    except Exception as e:
        logger.error(f"Failed to create user in Firebase: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register user in authentication service.",
        )

    # 2. Insert DB record
    user = User(
        username=clean_username,
        firebase_uid=uid,
        full_name=payload.full_name,
        role="farmer",  # Fixed to farmer
        email=str(payload.email) if payload.email else None,
        phone=payload.phone,
        language=payload.language or "en",
        active=True,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except Exception as e:
        db.rollback()
        logger.error(f"DB insert failed for user {clean_username}, rolling back Firebase: {e}")
        try:
            fb.delete_user(uid)
        except Exception as del_err:
            logger.error(f"Failed to rollback Firebase user {uid}: {del_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database record creation failed.",
        )

    return UserRegisterResponse(username=clean_username, login_email=login_email)


@router.get("/me", response_model=UserMe)
@me_router.get("/me", response_model=UserMe)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Returns the profile and assigned role of the currently authenticated user.
    """
    return current_user


@router.patch("/me/availability", response_model=UserMe)
@me_router.patch("/me/availability", response_model=UserMe)
def update_availability(
    payload: AvailabilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Updates the availability flag of the current user (e.g. agronomist toggling queue availability).
    """
    current_user.available = payload.available
    db.commit()
    db.refresh(current_user)
    return current_user


@router.patch("/me/language", response_model=UserMe)
@me_router.patch("/me/language", response_model=UserMe)
def update_language(
    payload: LanguageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Updates the preferred language of the current user.
    """
    lang = payload.language.lower()
    if lang not in ("en", "hi", "kn"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Language must be one of: en, hi, kn",
        )
    current_user.language = lang
    db.commit()
    db.refresh(current_user)
    return current_user

