import pytest
from sqlalchemy.exc import IntegrityError
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import get_db
from app.models.models import User
from app.scripts.seed_users import seed_users
from app.auth.firebase_client import get_firebase


def test_seed_creates_three_users_and_is_idempotent(db, fake_firebase):
    # Run seed
    seed_users(db, fake_firebase)

    admin = db.query(User).filter(User.username == "admin").first()
    farmer = db.query(User).filter(User.username == "farmer").first()
    agronomist = db.query(User).filter(User.username == "agronomist").first()

    assert admin is not None
    assert admin.full_name == "Administrator"
    assert admin.role == "admin"
    assert admin.language == "en"

    assert farmer is not None
    assert farmer.full_name == "James Donovan"
    assert farmer.role == "farmer"

    assert agronomist is not None
    assert agronomist.full_name == "Dr. Sarah Chen"
    assert agronomist.role == "agronomist"

    # Check fake Firebase users and custom claims
    assert "admin@agriadvisor.app" in fake_firebase.users_by_email
    assert "farmer@agriadvisor.app" in fake_firebase.users_by_email
    assert "agronomist@agriadvisor.app" in fake_firebase.users_by_email

    assert fake_firebase.claims_by_uid[admin.firebase_uid]["role"] == "admin"
    assert fake_firebase.claims_by_uid[farmer.firebase_uid]["role"] == "farmer"
    assert fake_firebase.claims_by_uid[agronomist.firebase_uid]["role"] == "agronomist"

    # Idempotence check: run again
    seed_users(db, fake_firebase)
    users = db.query(User).filter(User.username.in_(["admin", "farmer", "agronomist"])).all()
    assert len(users) == 3


def test_register_creates_farmer_and_ignores_role(db, fake_firebase):
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_firebase] = lambda: fake_firebase

    try:
        with TestClient(app) as client:
            payload = {
                "full_name": "Test New Farmer",
                "username": "newfarmer",
                "password": "secretpassword",
                "email": "farmer.real@example.com",
                "role": "admin",  # Must be ignored!
            }
            res = client.post("/auth/register", json=payload)
            assert res.status_code == 201
            data = res.json()
            assert data["username"] == "newfarmer"
            assert data["login_email"] == "newfarmer@agriadvisor.app"

            # Verify in DB: role must be 'farmer'
            user = db.query(User).filter(User.username == "newfarmer").first()
            assert user is not None
            assert user.role == "farmer"
            assert user.full_name == "Test New Farmer"
            assert user.email == "farmer.real@example.com"
            assert user.active is True

            # Verify in Fake Firebase
            assert fake_firebase.claims_by_uid[user.firebase_uid]["role"] == "farmer"
    finally:
        app.dependency_overrides.clear()


def test_register_duplicate_username_returns_409(db, fake_firebase):
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_firebase] = lambda: fake_firebase

    try:
        with TestClient(app) as client:
            payload = {
                "full_name": "Farmer One",
                "username": "uniquename",
                "password": "secretpassword",
            }
            res1 = client.post("/auth/register", json=payload)
            assert res1.status_code == 201

            # Exact duplicate
            res2 = client.post("/auth/register", json=payload)
            assert res2.status_code == 409
            assert "taken" in res2.json()["detail"].lower()

            # Case-insensitive duplicate
            payload_upper = {
                "full_name": "Farmer Two",
                "username": "UNIQUENAME",
                "password": "secretpassword",
            }
            res3 = client.post("/auth/register", json=payload_upper)
            assert res3.status_code == 409
    finally:
        app.dependency_overrides.clear()


def test_farmer_gets_403_on_admin_routes(db, fake_firebase):
    # Setup farmer user
    farmer = User(
        username="farmerjoe",
        firebase_uid="uid-farmer-joe",
        full_name="Farmer Joe",
        role="farmer",
        active=True,
    )
    db.add(farmer)
    db.commit()

    fake_firebase.create_user(
        email="farmerjoe@agriadvisor.app",
        password="password123",
        display_name="Farmer Joe",
        uid=farmer.firebase_uid,
    )
    fake_firebase.set_role_claim(farmer.firebase_uid, "farmer")

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_firebase] = lambda: fake_firebase

    try:
        with TestClient(app) as client:
            headers = {"Authorization": f"Bearer {farmer.firebase_uid}"}

            res1 = client.get("/admin/users", headers=headers)
            assert res1.status_code == 403

            res2 = client.post("/admin/agronomists", json={"full_name": "Dr. X", "username": "drx", "password": "password123"}, headers=headers)
            assert res2.status_code == 403

            res3 = client.post("/admin/users/1/reset-password", json={"new_password": "newpass123"}, headers=headers)
            assert res3.status_code == 403

            res4 = client.delete("/admin/users/1", headers=headers)
            assert res4.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_admin_can_create_agronomist(db, fake_firebase):
    admin = User(
        username="superadmin",
        firebase_uid="uid-super-admin",
        full_name="Super Admin",
        role="admin",
        active=True,
    )
    db.add(admin)
    db.commit()

    fake_firebase.create_user(
        email="superadmin@agriadvisor.app",
        password="password123",
        display_name="Super Admin",
    )
    fake_firebase.set_role_claim(admin.firebase_uid, "admin")

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_firebase] = lambda: fake_firebase

    try:
        with TestClient(app) as client:
            headers = {"Authorization": f"Bearer {admin.firebase_uid}"}
            payload = {
                "full_name": "Dr. Emily Green",
                "username": "drgreen",
                "password": "securepassword",
                "email": "drgreen@agri.org",
                "phone": "+15551234567",
            }
            res = client.post("/admin/agronomists", json=payload, headers=headers)
            assert res.status_code == 201
            data = res.json()
            assert data["username"] == "drgreen"
            assert data["role"] == "agronomist"

            # Check DB
            created = db.query(User).filter(User.username == "drgreen").first()
            assert created is not None
            assert created.role == "agronomist"
            assert created.created_by == admin.id

            # Check Fake Firebase
            assert fake_firebase.claims_by_uid[created.firebase_uid]["role"] == "agronomist"
    finally:
        app.dependency_overrides.clear()


def test_reset_password_calls_fake(db, fake_firebase):
    admin = User(
        username="adminreset",
        firebase_uid="uid-admin-reset",
        full_name="Admin Reset",
        role="admin",
        active=True,
    )
    farmer = User(
        username="farmerreset",
        firebase_uid="uid-farmer-reset",
        full_name="Farmer Reset",
        role="farmer",
        active=True,
    )
    db.add_all([admin, farmer])
    db.commit()

    fake_firebase.create_user(
        email="adminreset@agriadvisor.app",
        password="adminpass123",
        display_name="Admin Reset",
        uid=admin.firebase_uid,
    )
    fake_firebase.set_role_claim(admin.firebase_uid, "admin")

    fake_firebase.create_user(
        email="farmerreset@agriadvisor.app",
        password="farmerpass123",
        display_name="Farmer Reset",
        uid=farmer.firebase_uid,
    )
    fake_firebase.set_role_claim(farmer.firebase_uid, "farmer")

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_firebase] = lambda: fake_firebase

    try:
        with TestClient(app) as client:
            headers = {"Authorization": f"Bearer {admin.firebase_uid}"}
            res = client.post(
                f"/admin/users/{farmer.id}/reset-password",
                json={"new_password": "brandnewpassword123"},
                headers=headers,
            )
            assert res.status_code == 200
            assert fake_firebase.passwords[farmer.firebase_uid] == "brandnewpassword123"
            assert len(fake_firebase.reset_password_calls) == 1
            assert fake_firebase.reset_password_calls[0]["uid"] == farmer.firebase_uid
    finally:
        app.dependency_overrides.clear()


def test_delete_admin_or_yourself_is_refused(db, fake_firebase):
    admin = User(
        username="deladmin",
        firebase_uid="uid-del-admin",
        full_name="Del Admin",
        role="admin",
        active=True,
    )
    farmer = User(
        username="delfarmer",
        firebase_uid="uid-del-farmer",
        full_name="Del Farmer",
        role="farmer",
        active=True,
    )
    db.add_all([admin, farmer])
    db.commit()

    fake_firebase.create_user(
        email="deladmin@agriadvisor.app",
        password="adminpass123",
        display_name="Del Admin",
        uid=admin.firebase_uid,
    )
    fake_firebase.set_role_claim(admin.firebase_uid, "admin")

    fake_firebase.create_user(
        email="delfarmer@agriadvisor.app",
        password="farmerpass123",
        display_name="Del Farmer",
        uid=farmer.firebase_uid,
    )
    fake_firebase.set_role_claim(farmer.firebase_uid, "farmer")

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_firebase] = lambda: fake_firebase

    try:
        with TestClient(app) as client:
            headers = {"Authorization": f"Bearer {admin.firebase_uid}"}

            # 1. Deleting self is refused
            res1 = client.delete(f"/admin/users/{admin.id}", headers=headers)
            assert res1.status_code == 400
            assert "own admin account" in res1.json()["detail"].lower()

            # 2. Deleting normal user works: soft deletes in DB and deletes in Firebase
            farmer_uid = farmer.firebase_uid
            res2 = client.delete(f"/admin/users/{farmer.id}", headers=headers)
            assert res2.status_code == 200
            db.refresh(farmer)
            assert farmer.active is False
            assert farmer_uid not in fake_firebase.users_by_uid
    finally:
        app.dependency_overrides.clear()


def test_second_admin_cannot_exist_db_index(db):
    first_admin = User(
        username="adminfirst",
        firebase_uid="uid-admin-1",
        role="admin",
        active=True,
    )
    db.add(first_admin)
    db.commit()

    second_admin = User(
        username="adminsecond",
        firebase_uid="uid-admin-2",
        role="admin",
        active=True,
    )
    db.add(second_admin)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # But multiple farmers can exist without violating the partial index
    f1 = User(username="farmerone", firebase_uid="uid-f-1", role="farmer")
    f2 = User(username="farmertwo", firebase_uid="uid-f-2", role="farmer")
    db.add_all([f1, f2])
    db.commit()


def test_inactive_user_gets_401(db, fake_firebase):
    inactive_user = User(
        username="inactivedude",
        firebase_uid="uid-inactive",
        full_name="Inactive Dude",
        role="farmer",
        active=False,  # Soft deleted / inactive
    )
    db.add(inactive_user)
    db.commit()

    fake_firebase.users_by_uid[inactive_user.firebase_uid] = fake_firebase.create_user(
        email="inactivedude@agriadvisor.app",
        password="pass123456",
        display_name="Inactive Dude",
    )

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_firebase] = lambda: fake_firebase

    try:
        with TestClient(app) as client:
            headers = {"Authorization": f"Bearer {inactive_user.firebase_uid}"}
            res = client.get("/me", headers=headers)
            assert res.status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_me_endpoint_returns_user_profile(db, fake_firebase):
    user = User(
        username="profiletester",
        firebase_uid="uid-profile-tester",
        full_name="Profile Tester",
        role="farmer",
        language="hi",
        email="profile@example.com",
        phone="+919876543210",
        active=True,
    )
    db.add(user)
    db.commit()

    fake_firebase.create_user(
        email="profiletester@agriadvisor.app",
        password="pass123456",
        display_name="Profile Tester",
        uid=user.firebase_uid,
    )
    fake_firebase.set_role_claim(user.firebase_uid, "farmer")

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_firebase] = lambda: fake_firebase

    try:
        with TestClient(app) as client:
            headers = {"Authorization": f"Bearer {user.firebase_uid}"}
            res = client.get("/me", headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["id"] == user.id
            assert data["username"] == "profiletester"
            assert data["full_name"] == "Profile Tester"
            assert data["role"] == "farmer"
            assert data["language"] == "hi"
            assert data["email"] == "profile@example.com"
            assert data["phone"] == "+919876543210"
    finally:
        app.dependency_overrides.clear()
