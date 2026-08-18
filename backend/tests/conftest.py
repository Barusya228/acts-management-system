"""Общие фикстуры тестов.

HTTP-фикстуры используют реальное приложение FastAPI с реальной цепочкой
авторизации (без dependency overrides), чтобы проверять именно те коды
ответов, которые увидят клиенты.
"""

import os

import pytest

requires_postgres = pytest.mark.skipif(
    "acts_test" not in os.environ.get("DATABASE_URL", ""),
    reason="requires the isolated PostgreSQL test database",
)


@pytest.fixture
def http_env():
    """Чистая схема БД + пользователи + TestClient реального приложения."""
    from sqlalchemy import text
    from starlette.testclient import TestClient

    from app.core.database import Base, SessionLocal, engine
    from app.core.security import get_password_hash
    from app.db.models import User, UserRole
    from app.main import app

    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    admin = User(
        username="http-admin",
        full_name="HTTP Admin",
        password_hash=get_password_hash("admin-pass"),
        role=UserRole.ADMIN,
    )
    signer = User(
        username="http-signer",
        full_name="Kiosk Signer",
        password_hash=get_password_hash("unused"),
        role=UserRole.GUEST,
    )
    db.add_all([admin, signer])
    db.commit()
    db.refresh(admin)
    db.refresh(signer)

    client = TestClient(app)
    yield client, db, admin, signer
    db.close()


def admin_headers(client) -> dict:
    """Логин администратора через реальный endpoint."""
    response = client.post("/api/auth/login", json={"username": "http-admin", "password": "admin-pass"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def kiosk_headers(client, headers: dict, name: str = "Test Kiosk") -> tuple[dict, str]:
    """Полный цикл: админ создаёт код → киоск привязывается → токен устройства."""
    created = client.post("/api/auth/kiosks", json={"name": name}, headers=headers)
    assert created.status_code == 201, created.text
    kiosk_id = created.json()["id"]
    enrolled = client.post("/api/auth/kiosks/enroll", json={"enrollment_code": created.json()["enrollment_code"]})
    assert enrolled.status_code == 200, enrolled.text
    return {"Authorization": f"Bearer {enrolled.json()['access_token']}"}, kiosk_id
