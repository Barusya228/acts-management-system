import os
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.api.auth import create_kiosk_enrollment, enroll_kiosk, revoke_kiosk
from app.core.database import Base, SessionLocal, engine
from app.core.security import decode_access_token
from app.db.models import KioskDevice, User, UserRole
from app.schemas.schemas import KioskCreateRequest, KioskEnrollRequest


pytestmark = pytest.mark.skipif(
    "acts_test" not in os.environ.get("DATABASE_URL", ""),
    reason="requires the isolated PostgreSQL test database",
)


@pytest.fixture
def kiosk_data():
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    admin = User(username="kiosk-admin", full_name="Admin", password_hash="unused", role=UserRole.ADMIN)
    signer = User(username="kiosk-signer", full_name="Kiosk Signer", password_hash="unused", role=UserRole.GUEST)
    db.add_all([admin, signer])
    db.commit()
    db.refresh(admin)
    db.refresh(signer)
    yield db, admin, signer
    db.close()


def test_kiosk_enrollment_issues_device_bound_token(kiosk_data):
    db, admin, signer = kiosk_data

    created = create_kiosk_enrollment(KioskCreateRequest(name="iPad C314"), db, admin)
    assert created["enrollment_code"]

    token = enroll_kiosk(KioskEnrollRequest(enrollment_code=created["enrollment_code"]), db)
    payload = decode_access_token(token["access_token"])
    assert payload["sub"] == str(signer.id)
    assert payload["kiosk_id"] == created["id"]

    kiosk = db.query(KioskDevice).filter(KioskDevice.id == created["id"]).one()
    assert kiosk.status == "ACTIVE"
    assert kiosk.enrollment_code is None

    # Код одноразовый: повторная привязка тем же кодом невозможна.
    with pytest.raises(HTTPException) as reuse_error:
        enroll_kiosk(KioskEnrollRequest(enrollment_code=created["enrollment_code"]), db)
    assert reuse_error.value.status_code == 401


def test_expired_enrollment_code_is_rejected(kiosk_data):
    db, admin, _signer = kiosk_data
    created = create_kiosk_enrollment(KioskCreateRequest(name="iPad Expired"), db, admin)
    kiosk = db.query(KioskDevice).filter(KioskDevice.id == created["id"]).one()
    kiosk.enrollment_expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()

    with pytest.raises(HTTPException) as error:
        enroll_kiosk(KioskEnrollRequest(enrollment_code=created["enrollment_code"]), db)
    assert error.value.status_code == 401


def test_revoked_kiosk_is_marked_and_loses_code(kiosk_data):
    db, admin, _signer = kiosk_data
    created = create_kiosk_enrollment(KioskCreateRequest(name="iPad Revoked"), db, admin)
    enroll_kiosk(KioskEnrollRequest(enrollment_code=created["enrollment_code"]), db)

    revoke_kiosk(created["id"], db, admin)
    kiosk = db.query(KioskDevice).filter(KioskDevice.id == created["id"]).one()
    assert kiosk.status == "REVOKED"
    assert kiosk.revoked_at is not None
