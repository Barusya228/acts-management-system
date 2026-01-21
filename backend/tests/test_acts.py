import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.core.db.base import Base
from app.core.db.session import get_db
from app.core.security import get_password_hash
from app.db.models.user import User, UserRole
from app.db.models.template import Template
from app.core.config import settings

# Test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_user(db_session):
    user = User(
        email="test@example.com",
        full_name="Test User",
        password_hash=get_password_hash("testpass123"),
        role=UserRole.STAFF,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def test_template(db_session):
    template = Template(
        code="TEST",
        name="Test Template",
        description="Test template",
        schema_json={
            "signature_party1": {"x": 50, "y": 150, "w": 200, "h": 80},
            "signature_party2": {"x": 300, "y": 150, "w": 200, "h": 80}
        },
        is_active=True
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)
    return template


@pytest.fixture(scope="function")
def auth_token(client, test_user):
    response = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "testpass123"}
    )
    return response.json()["access_token"]


def test_create_act(client, auth_token, test_template):
    headers = {"Authorization": f"Bearer {auth_token}"}
    response = client.post(
        "/api/acts",
        json={
            "template_id": str(test_template.id),
            "party1_name": "Party 1",
            "party2_name": "Party 2",
            "issue_date": "2024-01-01T00:00:00",
            "item_name": "Test Item",
            "receiver_email": "receiver@example.com"
        },
        headers=headers
    )
    assert response.status_code == 201
    data = response.json()
    assert data["party1_name"] == "Party 1"
    assert data["party2_name"] == "Party 2"
    assert data["item_name"] == "Test Item"


def test_list_acts(client, auth_token, test_template):
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Create an act first
    client.post(
        "/api/acts",
        json={
            "template_id": str(test_template.id),
            "party1_name": "Party 1",
            "party2_name": "Party 2",
            "issue_date": "2024-01-01T00:00:00",
            "item_name": "Test Item",
            "receiver_email": "receiver@example.com"
        },
        headers=headers
    )
    
    # List acts
    response = client.get("/api/acts", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) > 0

