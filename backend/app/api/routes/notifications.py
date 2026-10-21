from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import Notification, User
from app.schemas.schemas import NotificationRead
from app.api.deps import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=List[NotificationRead])
def get_user_notifications(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    unread: Optional[bool] = Query(None),
    channel: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns notifications for the authenticated user with paging, optional unread filter,
    and optional channel filter, sorted by most recent.
    """
    query = db.query(Notification).filter(Notification.user_id == current_user.id)

    if unread is True:
        query = query.filter(Notification.is_read == False)
    elif unread is False:
        query = query.filter(Notification.is_read == True)

    if channel:
        query = query.filter(Notification.channel == channel)

    return (
        query.order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.patch("/{id}/read", response_model=NotificationRead)
def mark_notification_read(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Marks a notification as read. Enforces user ownership.
    """
    notif = db.query(Notification).filter(Notification.id == id).first()
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    # Enforce that farmers and users cannot access or mark other users' notifications
    if notif.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this notification",
        )

    notif.is_read = True
    notif.status = "read"
    db.commit()
    db.refresh(notif)
    return notif


@router.post("/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Marks all unread notifications for the authenticated user as read.
    """
    updated_count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
        .update(
            {"is_read": True, "status": "read"},
            synchronize_session="fetch",
        )
    )
    db.commit()
    return {"message": "All notifications marked as read", "count": updated_count}
