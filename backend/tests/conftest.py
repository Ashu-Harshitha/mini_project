import pytest
import os
import yaml
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.core.database import Base, get_db
from app.main import app
from app.models.models import User, Farm, Field, Case, ChemicalRule
from app.api.deps import get_current_user
from app.auth.firebase_client import get_firebase

# Test in-memory SQLite database
TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class FakeFirebaseUser:
    def __init__(self, uid: str, email: str, display_name: str = ""):
        self.uid = uid
        self.email = email
        self.display_name = display_name


class FakeFirebaseClient:
    def __init__(self):
        self.users_by_email = {}
        self.users_by_uid = {}
        self.claims_by_uid = {}
        self.passwords = {}
        self.reset_password_calls = []

    def create_user(self, email: str, password: str, display_name: str, uid: str = None) -> str:
        clean_email = email.lower()
        if clean_email in self.users_by_email:
            raise ValueError(f"User with email {email} already exists")
        if not uid:
            uid = f"fake-uid-{clean_email.split('@')[0]}"
        user = FakeFirebaseUser(uid=uid, email=clean_email, display_name=display_name)
        self.users_by_email[clean_email] = user
        self.users_by_uid[uid] = user
        self.passwords[uid] = password
        if uid not in self.claims_by_uid:
            self.claims_by_uid[uid] = {}
        return uid

    def set_role_claim(self, uid: str, role: str):
        if uid not in self.claims_by_uid:
            self.claims_by_uid[uid] = {}
        self.claims_by_uid[uid]["role"] = role

    def update_password(self, uid: str, password: str):
        if uid not in self.users_by_uid:
            raise ValueError(f"User {uid} not found")
        self.passwords[uid] = password
        self.reset_password_calls.append({"uid": uid, "password": password})

    def delete_user(self, uid: str):
        user = self.users_by_uid.pop(uid, None)
        if user:
            self.users_by_email.pop(user.email, None)
        self.claims_by_uid.pop(uid, None)
        self.passwords.pop(uid, None)

    def get_user_by_email(self, email: str):
        return self.users_by_email.get(email.lower())

    def verify_id_token(self, token: str) -> dict:
        if token.startswith("invalid"):
            raise ValueError("Invalid authentication token")
        # Check by uid
        if token in self.users_by_uid:
            user = self.users_by_uid[token]
            email = getattr(user, "email", f"{token}@agriadvisor.app")
            role = self.claims_by_uid.get(token, {}).get("role", "farmer")
            return {"uid": token, "role": role, "email": email}
        # If token format is "token-<uid>"
        if token.startswith("token-"):
            uid = token.replace("token-", "")
            role = self.claims_by_uid.get(uid, {}).get("role", "farmer")
            return {"uid": uid, "role": role}
        # Fallback for mock tokens
        return {"uid": token, "role": "farmer"}


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    from app.core.config import settings
    from app.services.ai.gemini_client import get_gemini_client
    orig_mode = settings.AI_MODE
    settings.AI_MODE = "mock"
    get_gemini_client().ai_mode = "mock"
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    settings.AI_MODE = orig_mode


@pytest.fixture
def fake_firebase():
    client = FakeFirebaseClient()
    return client


@pytest.fixture
def db():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    # Seed chemical rules into test DB
    yaml_path = os.path.join(os.path.dirname(__file__), "..", "data", "chemical_rules.yaml")
    if os.path.exists(yaml_path):
        with open(yaml_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            for r in data.get("rules", []):
                session.add(ChemicalRule(**r))
        session.commit()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def test_user(db, fake_firebase):
    user = User(
        username="testfarmer",
        firebase_uid="usr-test-farmer",
        email="test.farmer@agriadvisor.ai",
        full_name="Test Farmer",
        role="farmer",
        language="en",
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    fake_firebase.users_by_uid[user.firebase_uid] = FakeFirebaseUser(
        uid=user.firebase_uid,
        email="farmer@agriadvisor.app",
        display_name=user.full_name,
    )
    fake_firebase.set_role_claim(user.firebase_uid, "farmer")
    return user


@pytest.fixture
def test_agronomist(db, fake_firebase):
    user = User(
        username="testagronomist",
        firebase_uid="usr-test-agronomist",
        email="test.agronomist@agriadvisor.ai",
        full_name="Dr. Test Agronomist",
        role="agronomist",
        language="en",
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    fake_firebase.users_by_uid[user.firebase_uid] = FakeFirebaseUser(
        uid=user.firebase_uid,
        email="agronomist@agriadvisor.app",
        display_name=user.full_name,
    )
    fake_firebase.set_role_claim(user.firebase_uid, "agronomist")
    return user


@pytest.fixture
def test_admin(db, fake_firebase):
    user = User(
        username="admin",
        firebase_uid="usr-test-admin",
        email="admin@agriadvisor.ai",
        full_name="Administrator",
        role="admin",
        language="en",
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    fake_firebase.users_by_uid[user.firebase_uid] = FakeFirebaseUser(
        uid=user.firebase_uid,
        email="admin@agriadvisor.app",
        display_name=user.full_name,
    )
    fake_firebase.set_role_claim(user.firebase_uid, "admin")
    return user


@pytest.fixture
def test_farm(db):
    farm = Farm(
        name="Test Conventional Farm",
        operator_name="John Doe",
        location="Ames, IA",
        total_acreage=400.0,
        is_organic=False,
    )
    db.add(farm)
    db.commit()
    db.refresh(farm)

    field = Field(
        farm_id=farm.id,
        name="Test Field 1",
        acreage=50.0,
        soil_type="Loam",
        current_crop="Corn",
    )
    db.add(field)
    db.commit()
    db.refresh(field)

    return farm


@pytest.fixture
def test_organic_farm(db):
    farm = Farm(
        name="Test Organic Eco Farm",
        operator_name="Jane Green",
        location="Boone, IA",
        total_acreage=250.0,
        is_organic=True,
    )
    db.add(farm)
    db.commit()
    db.refresh(farm)

    field = Field(
        farm_id=farm.id,
        name="Organic Field Alpha",
        acreage=40.0,
        soil_type="Silt loam",
        current_crop="Corn",
    )
    db.add(field)
    db.commit()
    db.refresh(field)

    return farm


@pytest.fixture
def client(db, test_user, fake_firebase):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    def override_get_current_user():
        return test_user

    def override_get_firebase():
        return fake_firebase

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_firebase] = override_get_firebase

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
