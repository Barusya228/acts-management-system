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

from app.api.acts import create_act, delete_act, get_manual_final_email, list_acts, send_manual_final_email, sign_party1, sign_party2, start_return_flow
from app.api.inventory import delete_small_equipment_catalog_item, list_available_devices, update_device
from app.core.database import Base, SessionLocal, engine
from app.db.models import (
    ActDeviceAssignment,
    ActAccessory,
    Act,
    ActVersion,
    DeviceStatus,
    EmailOutbox,
    InventoryDevice,
    Participant,
    ParticipantKind,
    SmallEquipmentCatalog,
    Template,
    User,
    UserRole,
)
from app.schemas.schemas import ActCreate, InventoryDeviceUpdate, ManualFinalEmailRequest, ReturnStartRequest, SignatureRequest


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
        barcode="TEST-BARCODE-001",
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
            }], "accessories_only": True, "accessories": [{
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
    assert "accessories_only" not in act.extra_data_json
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
    with pytest.raises(HTTPException) as active_delete_error:
        delete_small_equipment_catalog_item(accessory.catalog_item_id, db, user)
    assert active_delete_error.value.status_code == 409

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
    delete_small_equipment_catalog_item(accessory.catalog_item_id, db, user)
    catalog_item = db.query(SmallEquipmentCatalog).filter(SmallEquipmentCatalog.id == accessory.catalog_item_id).one()
    assert catalog_item.is_active is False


@pytest.mark.asyncio
async def test_accessories_only_act_full_issue_and_return_lifecycle(lifecycle_data):
    db, user, manager, recipient, template, _device = lifecycle_data
    catalog_item = SmallEquipmentCatalog(name="Тестовая гарнитура", model="USB")
    db.add(catalog_item)
    db.commit()
    db.refresh(catalog_item)

    act = await create_act(
        ActCreate(
            template_id=template.id,
            party1_participant_id=manager.id,
            party1_name=manager.full_name,
            party2_name=recipient.full_name,
            issue_date=date.today(),
            item_name="Будет заменено backend",
            item_serial="IGNORED",
            receiver_email=recipient.email,
            extra_data_json={
                "recipients": [{
                    "participant_id": str(recipient.id),
                    "full_name": recipient.full_name,
                    "email": recipient.email,
                }],
                "accessories_only": False,
                "accessories": [{
                    "catalog_item_id": str(catalog_item.id),
                    "name": catalog_item.name,
                    "model": catalog_item.model,
                    "quantity": 1,
                }],
            },
        ),
        BackgroundTasks(),
        db,
        user,
    )

    assert act.inventory_device_id is None
    assert act.item_name == f"Мелкая техника: {catalog_item.name}"
    assert act.item_serial is None
    assert act.extra_data_json["accessories_only"] is True
    assert db.query(ActDeviceAssignment).filter(ActDeviceAssignment.act_id == act.id).count() == 0
    accessory = db.query(ActAccessory).filter(ActAccessory.act_id == act.id).one()
    assert accessory.catalog_item_id == catalog_item.id
    assert accessory.status == "RESERVED"
    initial_version = db.query(ActVersion).filter(
        ActVersion.act_id == act.id,
        ActVersion.version_number == 1,
    ).one()
    assert initial_version.pdf_file_id is not None
    assert initial_version.data_json["extra_data_json"]["accessories_only"] is True

    await sign_party2(
        act.id,
        SignatureRequest(signature_data=_signature(), participant_id=recipient.id),
        BackgroundTasks(),
        db,
        user,
    )
    completed = await sign_party1(
        act.id,
        SignatureRequest(signature_data=_signature(), participant_id=manager.id),
        BackgroundTasks(),
        db,
        user,
    )
    assert completed.status.value == "COMPLETED"
    db.refresh(accessory)
    assert accessory.status == "ISSUED"

    await start_return_flow(
        act.id,
        ReturnStartRequest(return_date=date.today()),
        BackgroundTasks(),
        db,
        user,
    )
    await sign_party1(
        act.id,
        SignatureRequest(signature_data=_signature(), participant_id=manager.id),
        BackgroundTasks(),
        db,
        user,
    )
    returned = await sign_party2(
        act.id,
        SignatureRequest(signature_data=_signature(), participant_id=recipient.id),
        BackgroundTasks(),
        db,
        user,
    )
    assert returned.status.value == "RETURNED"
    db.refresh(accessory)
    assert accessory.status == "RETURNED"
    latest_version = db.query(ActVersion).filter(ActVersion.act_id == act.id).order_by(
        ActVersion.version_number.desc()
    ).first()
    assert latest_version is not None
    assert latest_version.pdf_file_id is not None
    assert latest_version.data_json["extra_data_json"]["accessories_only"] is True


@pytest.mark.asyncio
async def test_act_without_primary_device_or_accessories_is_rejected(lifecycle_data):
    db, user, manager, recipient, template, device = lifecycle_data
    base_data = {
        "template_id": template.id,
        "party1_participant_id": manager.id,
        "party1_name": manager.full_name,
        "party2_name": recipient.full_name,
        "issue_date": date.today(),
        "item_name": "Нет состава",
        "receiver_email": recipient.email,
    }
    recipients = [{
        "participant_id": str(recipient.id),
        "full_name": recipient.full_name,
        "email": recipient.email,
    }]

    with pytest.raises(HTTPException) as empty_error:
        await create_act(
            ActCreate(**base_data, extra_data_json={"recipients": recipients}),
            BackgroundTasks(),
            db,
            user,
        )
    assert empty_error.value.status_code == 422
    assert empty_error.value.detail == "Добавьте основное устройство или мелкую технику"

    with pytest.raises(HTTPException) as equipment_error:
        await create_act(
            ActCreate(
                **base_data,
                extra_data_json={
                    "recipients": recipients,
                    "equipment_list": [{
                        "inventory_device_id": str(device.id),
                        "name": device.name,
                        "serial": device.inventory_number,
                    }],
                    "accessories": [{"name": "Кабель", "quantity": 1}],
                },
            ),
            BackgroundTasks(),
            db,
            user,
        )
    assert equipment_error.value.status_code == 422
    assert "без основного устройства" in equipment_error.value.detail


@pytest.mark.asyncio
async def test_admin_can_permanently_delete_completed_act(lifecycle_data):
    db, user, manager, recipient, _template, device = lifecycle_data
    act = await _create(lifecycle_data)
    act_id = act.id
    await sign_party2(act.id, SignatureRequest(signature_data=_signature(), participant_id=recipient.id), BackgroundTasks(), db, user)
    await sign_party1(act.id, SignatureRequest(signature_data=_signature(), participant_id=manager.id), BackgroundTasks(), db, user)

    await delete_act(act_id, db, user)

    db.refresh(device)
    assert device.status == DeviceStatus.AVAILABLE
    assert device.assigned_to is None
    assert db.query(Act).filter(Act.id == act_id).first() is None
    assert db.query(ActAccessory).filter(ActAccessory.act_id == act_id).count() == 0


@pytest.mark.asyncio
async def test_final_documents_are_sent_only_by_admin_action(lifecycle_data):
    db, user, manager, recipient, _template, device = lifecycle_data
    act = await _create(lifecycle_data)
    await sign_party2(act.id, SignatureRequest(signature_data=_signature(), participant_id=recipient.id), BackgroundTasks(), db, user)
    await sign_party1(act.id, SignatureRequest(signature_data=_signature(), participant_id=manager.id), BackgroundTasks(), db, user)

    assert db.query(EmailOutbox).filter(EmailOutbox.act_id == act.id).count() == 0
    options = get_manual_final_email(act.id, db, user)
    documents = {item["kind"]: item for item in options["documents"]}
    assert documents["ISSUE_COMPLETED"]["available"] is True
    assert documents["RETURN_COMPLETED"]["available"] is False
    recipient_emails = [item["email"] for item in options["recipients"]]
    assert set(recipient_emails) == {manager.email, recipient.email}

    first = send_manual_final_email(
        act.id,
        ManualFinalEmailRequest(
            kind="ISSUE_COMPLETED",
            recipient_emails=recipient_emails,
            custom_message="Keep this document.",
        ),
        db,
        user,
    )
    second = send_manual_final_email(
        act.id,
        ManualFinalEmailRequest(kind="ISSUE_COMPLETED", recipient_emails=[recipient.email]),
        db,
        user,
    )
    rows = db.query(EmailOutbox).filter(EmailOutbox.act_id == act.id).all()
    assert first["dispatch_id"] != second["dispatch_id"]
    assert len(rows) == 3
    assert all(row.requested_by == user.id for row in rows)
    assert all(row.attachment_storage_path for row in rows)
    assert sum(row.custom_message == "Keep this document." for row in rows) == 2

    listing = await list_acts(
        party1=None,
        party2=None,
        item_name=None,
        email=None,
        search=None,
        template_code=None,
        pending=None,
        page=1,
        page_size=20,
        db=db,
        current_user=user,
    )
    listed_act = next(item for item in listing["items"] if item["id"] == act.id)
    assert listed_act["item_barcode"] == device.barcode
    assert listed_act["final_email_status"] == "PENDING"
    assert listed_act["final_email_status_at"] is not None

    with pytest.raises(HTTPException) as error:
        send_manual_final_email(
            act.id,
            ManualFinalEmailRequest(kind="ISSUE_COMPLETED", recipient_emails=["outsider@example.com"]),
            db,
            user,
        )
    assert error.value.status_code == 422

    await start_return_flow(act.id, ReturnStartRequest(return_date=date.today()), BackgroundTasks(), db, user)
    await sign_party1(act.id, SignatureRequest(signature_data=_signature(), participant_id=manager.id), BackgroundTasks(), db, user)
    await sign_party2(act.id, SignatureRequest(signature_data=_signature(), participant_id=recipient.id), BackgroundTasks(), db, user)
    assert db.query(EmailOutbox).filter(EmailOutbox.act_id == act.id, EmailOutbox.kind == "RETURN_COMPLETED").count() == 0
    returned_options = get_manual_final_email(act.id, db, user)
    returned_documents = {item["kind"]: item for item in returned_options["documents"]}
    assert returned_documents["ISSUE_COMPLETED"]["available"] is True
    assert returned_documents["RETURN_COMPLETED"]["available"] is True


def test_paper_act_status_blocks_device_until_manual_return(lifecycle_data):
    db, user, _manager, _recipient, _template, device = lifecycle_data
    paper_date = date(2025, 9, 1)

    updated = update_device(
        device.id,
        InventoryDeviceUpdate(
            status="paper_issued",
            assigned_to="Legacy Recipient",
            paper_act_number="P-125",
            paper_issue_date=paper_date,
        ),
        db,
        user,
    )
    assert updated.status.value == "paper_issued"
    assert updated.assigned_to == "Legacy Recipient"
    assert updated.paper_act_number == "P-125"
    assert updated.paper_issue_date == paper_date
    assert all(item["id"] != str(device.id) for item in list_available_devices(db, user))

    with pytest.raises(HTTPException) as error:
        update_device(
            device.id,
            InventoryDeviceUpdate(status="paper_issued", assigned_to=""),
            db,
            user,
        )
    assert error.value.status_code == 422

    returned = update_device(device.id, InventoryDeviceUpdate(status="available"), db, user)
    assert returned.status.value == "available"
    assert returned.assigned_to is None
    assert returned.paper_act_number is None
    assert returned.paper_issue_date is None
    assert any(item["id"] == str(device.id) for item in list_available_devices(db, user))


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
