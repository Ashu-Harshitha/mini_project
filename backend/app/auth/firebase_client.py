import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("agriadvisor.firebase")

try:
    import firebase_admin
    from firebase_admin import auth as fb_auth, credentials
except ImportError:
    firebase_admin = None
    fb_auth = None
    credentials = None


class FirebaseClient:
    """
    Firebase Admin SDK wrapper.
    Initializes once from GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_PROJECT_ID.
    """
    def __init__(self):
        self._app = None
        self._initialize()

    def _initialize(self):
        if not firebase_admin:
            logger.warning("firebase_admin package is not installed.")
            return

        if firebase_admin._apps:
            self._app = firebase_admin.get_app()
            return

        try:
            from app.core.config import settings
            default_cred = settings.GOOGLE_APPLICATION_CREDENTIALS
            default_project = settings.FIREBASE_PROJECT_ID
        except Exception:
            default_cred = None
            default_project = None

        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or default_cred
        project_id = os.getenv("FIREBASE_PROJECT_ID") or default_project

        if cred_path and not os.path.isabs(cred_path):
            if not os.path.exists(cred_path):
                backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                candidate = os.path.join(backend_root, cred_path.lstrip("./\\"))
                if os.path.exists(candidate):
                    cred_path = candidate

        try:
            if cred_path and os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                pid = getattr(cred, "project_id", None) or project_id
                options = {"projectId": pid} if pid else {}
                self._app = firebase_admin.initialize_app(cred, options)
                logger.info(f"Initialized Firebase Admin SDK from credentials: {cred_path} for project: {pid}")
            elif project_id:
                self._app = firebase_admin.initialize_app(options={"projectId": project_id})
                logger.info(f"Initialized Firebase Admin SDK for project {project_id}")
            else:
                self._app = firebase_admin.initialize_app()
                logger.info("Initialized default Firebase Admin SDK")
        except Exception as e:
            logger.error(f"Firebase Admin SDK initialization failed or offline: {e}")
            self._app = None

    def is_configured(self) -> bool:
        return bool(firebase_admin and firebase_admin._apps)

    def create_user(self, email: str, password: str, display_name: str) -> str:
        if not fb_auth or not firebase_admin._apps:
            raise RuntimeError("Firebase Admin is not configured or reachable")
        user = fb_auth.create_user(
            email=email,
            password=password,
            display_name=display_name,
        )
        return user.uid

    def set_role_claim(self, uid: str, role: str) -> None:
        if not fb_auth or not firebase_admin._apps:
            raise RuntimeError("Firebase Admin is not configured or reachable")
        fb_auth.set_custom_user_claims(uid, {"role": role})

    def update_password(self, uid: str, password: str) -> None:
        if not fb_auth or not firebase_admin._apps:
            raise RuntimeError("Firebase Admin is not configured or reachable")
        fb_auth.update_user(uid, password=password)

    def delete_user(self, uid: str) -> None:
        if not fb_auth or not firebase_admin._apps:
            raise RuntimeError("Firebase Admin is not configured or reachable")
        fb_auth.delete_user(uid)

    def get_user_by_email(self, email: str) -> Optional[Any]:
        if not fb_auth or not firebase_admin._apps:
            return None
        try:
            return fb_auth.get_user_by_email(email)
        except Exception as e:
            if "UserNotFoundError" in type(e).__name__ or "not found" in str(e).lower():
                return None
            logger.warning(f"Error looking up Firebase user by email {email}: {e}")
            return None

    def verify_id_token(self, token: str) -> Dict[str, Any]:
        if not fb_auth or not firebase_admin._apps:
            raise RuntimeError("Firebase Admin is not configured or reachable")
        return fb_auth.verify_id_token(token)


# Singleton wrapper instance
_client_instance = FirebaseClient()


def get_firebase() -> FirebaseClient:
    """
    FastAPI dependency returning the FirebaseClient wrapper.
    Tests override this dependency with an in-memory fake.
    """
    return _client_instance


def create_user(email: str, password: str, display_name: str) -> str:
    return _client_instance.create_user(email, password, display_name)


def set_role_claim(uid: str, role: str) -> None:
    _client_instance.set_role_claim(uid, role)


def update_password(uid: str, password: str) -> None:
    _client_instance.update_password(uid, password)


def delete_user(uid: str) -> None:
    _client_instance.delete_user(uid)


def get_user_by_email(email: str) -> Optional[Any]:
    return _client_instance.get_user_by_email(email)


def verify_id_token(token: str) -> Dict[str, Any]:
    return _client_instance.verify_id_token(token)
