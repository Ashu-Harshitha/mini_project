import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.config import settings
from app.models.models import User
from app.schemas.schemas import (
    AdminUserRead,
    AdminCreateAgronomist,
    AdminResetPassword,
)
from app.api.deps import require_role
from app.api.routes.auth import validate_username, validate_password
from app.auth.firebase_client import get_firebase, FirebaseClient

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
