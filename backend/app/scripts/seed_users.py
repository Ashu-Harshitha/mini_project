import logging
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.config import settings
from app.models.models import User
from app.auth.firebase_client import get_firebase, FirebaseClient

logger = logging.getLogger("agriadvisor.seed")

SEED_ACCOUNTS = [
    {
        "username": "admin",
        "full_name": "Administrator",
        "role": "admin",
        "password": "123456",
        "language": "en",
        "email": "admin@agriadvisor.ai",
    },
    {
        "username": "farmer",
        "full_name": "James Donovan",
        "role": "farmer",
        "password": "123456",
        "language": "en",
        "email": "james.donovan@westfieldagri.com",
    },
    {
        "username": "agronomist",
        "full_name": "Dr. Sarah Chen",
        "role": "agronomist",
        "password": "123456",
        "language": "en",
        "email": "schen@iastate.edu",
    },
]


def seed_users(db: Session, fb: Optional[FirebaseClient] = None):
    """
    Ensure the three initial accounts exist in BOTH Firebase and the database:
    - admin ("Administrator")
    - farmer ("James Donovan")
    - agronomist ("Dr. Sarah Chen")
    Idempotent: updates existing accounts and fixes claims/DB rows.
    If Firebase is unreachable or unconfigured, logs a clear error and keeps the app running.
    """
    if fb is None:
        fb = get_firebase()

    for acc in SEED_ACCOUNTS:
        username = acc["username"].lower()
        role = acc["role"]
        full_name = acc["full_name"]
        password = acc["password"]
        language = acc["language"]
        contact_email = acc.get("email")
        login_email = f"{username}@{settings.AUTH_EMAIL_DOMAIN}".lower()

        uid = None
        # Try Firebase lookup / creation
        try:
            fb_user = fb.get_user_by_email(login_email)
            if fb_user:
                uid = getattr(fb_user, "uid", None) or (fb_user.get("uid") if isinstance(fb_user, dict) else str(fb_user))
                fb.set_role_claim(uid, role)
                logger.info(f"Reused Firebase account for {username} (uid={uid})")
            else:
                uid = fb.create_user(email=login_email, password=password, display_name=full_name)
                fb.set_role_claim(uid, role)
                logger.info(f"Created Firebase account for {username} (uid={uid})")
        except Exception as e:
            logger.error(f"Firebase is unreachable or unconfigured during user seeding ({username}): {e}")
            if not uid:
                uid = f"usr-{username}"

        # DB lookup / upsert
        user = db.query(User).filter(func.lower(User.username) == username).first()
        if not user and uid:
            user = db.query(User).filter(User.firebase_uid == uid).first()
        if not user and contact_email:
            user = db.query(User).filter(User.email == contact_email).first()

        if not user:
            user = User(
                username=username,
                firebase_uid=uid,
                full_name=full_name,
                role=role,
                email=contact_email,
                language=language,
                active=True,
            )
            db.add(user)
            logger.info(f"Inserted DB user {username}")
        else:
            user.username = username
            user.full_name = full_name
            user.role = role
            user.language = language
            user.active = True
            if uid:
                user.firebase_uid = uid
            if contact_email and not user.email:
                user.email = contact_email
            logger.info(f"Updated DB user {username}")

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error committing seeded users to DB: {e}")
        raise
