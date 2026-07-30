import asyncio
import base64
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from io import BytesIO

import pytest
from fastapi import BackgroundTasks, HTTPException
from PIL import Image, ImageDraw
from sqlalchemy import text

from app.api.acts import create_act, sign_party1, sign_party2, start_return_flow
from app.core.database import Base, SessionLocal, engine
from app.db.models import (
    ActDeviceAssignment,
    ActAccessory,
    DeviceStatus,
    InventoryDevice,
    Participant,
    ParticipantKind,
    Template,
    User,
    UserRole,
)
from app.schemas.schemas import ActCreate, ReturnStartRequest, SignatureRequest


pytestmark = pytest.mark.skipif(
    "acts_test" not in os.environ.get("DATABASE_URL", ""),
    reason="requires the isolated PostgreSQL test database",
)


def _signature() -> str:
    image = Image.new("RGB", (180, 80), "white")
    ImageDraw.Draw(image).line((15, 55, 160, 20), fill="black", width=4)
    output = BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


@pytest.fixture
def lifecycle_data():
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    user = User(
        username="integration-admin",
        full_name="Integration Admin",
        password_hash="not-used",
        role=UserRole.ADMIN,
    )
    manager = Participant(
        full_name="Manager Test",
        email="manager@example.com",
        kind=ParticipantKind.IT_MANAGER,
    )
    recipient = Participant(
        full_name="Recipient Test",
        email="recipient@example.com",
        kind=ParticipantKind.EMPLOYEE,
    )
    template = Template(
        code="GENERIC_ONE",
        name="Integration template",
        schema_json={"fields": [], "max_recipients": 1},
        is_active=True,
    )
    device = InventoryDevice(
        inventory_number="TEST-001",
        name="Test laptop",
        category="laptop",
        serial_number="SERIAL-TEST-001",
        status=DeviceStatus.AVAILABLE,
    )
    db.add_all([user, manager, recipient, template, device])
    db.commit()
    for item in [user, manager, recipient, template, device]:
        db.refresh(item)
    yield db, user, manager, recipient, template, device
    db.close()


async def _create(lifecycle_data):
    db, user, manager, recipient, template, device = lifecycle_data
    return await create_act(
        ActCreate(
            template_id=template.id,
            party1_participant_id=manager.id,
            inventory_device_id=device.id,
            party1_name=manager.full_name,
            party2_name=recipient.full_name,
            issue_date=date.today(),
            item_name=device.name,
            item_serial=device.serial_number,
            receiver_email=recipient.email,
            extra_data_json={"recipients": [{
                "participant_id": str(recipient.id),
                "full_name": recipient.full_name,
                "email": recipient.email,
            }], "accessories": [{
                "name": "Мышь Logitech",
                "model": "M185",
                "quantity": 1,
                "note": "Тестовая позиция",
                "requires_return": True,
            }]},
        ),
        BackgroundTasks(),
        db,
        user,
    )


@pytest.mark.asyncio
async def test_full_issue_and_return_lifecycle(lifecycle_data):
    db, user, manager, recipient, _template, device = lifecycle_data
    act = await _create(lifecycle_data)
    db.refresh(device)
    assert device.status == DeviceStatus.RESERVED
    accessory = db.query(ActAccessory).filter(ActAccessory.act_id == act.id).one()
    assert accessory.status == "RESERVED"

    await sign_party2(act.id, SignatureRequest(signature_data=_signature(), participant_id=recipient.id), BackgroundTasks(), db, user)
    await sign_party1(act.id, SignatureRequest(signature_data=_signature(), participant_id=manager.id), BackgroundTasks(), db, user)
    db.refresh(device)
    assert device.status == DeviceStatus.ISSUED
    assert device.assigned_to == recipient.full_name
    db.refresh(accessory)
    assert accessory.status == "ISSUED"

    await start_return_flow(act.id, ReturnStartRequest(return_date=date.today()), BackgroundTasks(), db, user)
    await sign_party1(act.id, SignatureRequest(signature_data=_signature(), participant_id=manager.id), BackgroundTasks(), db, user)
    returned = await sign_party2(act.id, SignatureRequest(signature_data=_signature(), participant_id=recipient.id), BackgroundTasks(), db, user)
    db.refresh(device)
    assignment = db.query(ActDeviceAssignment).filter(ActDeviceAssignment.act_id == act.id).one()
    assert returned.status.value == "RETURNED"
    assert assignment.status == "RETURNED"
    assert device.status == DeviceStatus.AVAILABLE
    assert device.assigned_to is None
    db.refresh(accessory)
    assert accessory.status == "RETURNED"


def _parallel_sign(act_id, participant_id, user, party):
    db = SessionLocal()
    try:
        operation = sign_party1 if party == "party1" else sign_party2
        return asyncio.run(operation(
            act_id,
            SignatureRequest(signature_data=_signature(), participant_id=participant_id),
            BackgroundTasks(),
            db,
            user,
        ))
    except HTTPException as exc:
        return exc
    finally:
        db.close()


@pytest.mark.asyncio
async def test_parallel_signatures_and_returns_are_serialized(lifecycle_data):
    db, user, manager, recipient, _template, _device = lifecycle_data
    act = await _create(lifecycle_data)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(
            lambda _index: _parallel_sign(act.id, recipient.id, user, "party2"),
            range(2),
        ))
    assert sum(isinstance(result, HTTPException) for result in results) == 1

    await sign_party1(act.id, SignatureRequest(signature_data=_signature(), participant_id=manager.id), BackgroundTasks(), db, user)
    await start_return_flow(act.id, ReturnStartRequest(return_date=date.today()), BackgroundTasks(), db, user)
    await sign_party1(act.id, SignatureRequest(signature_data=_signature(), participant_id=manager.id), BackgroundTasks(), db, user)

    with ThreadPoolExecutor(max_workers=2) as pool:
        return_results = list(pool.map(
            lambda _index: _parallel_sign(act.id, recipient.id, user, "party2"),
            range(2),
        ))
    assert sum(isinstance(result, HTTPException) for result in return_results) == 1
