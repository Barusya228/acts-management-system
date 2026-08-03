import base64
import os
from datetime import date, datetime
from io import BytesIO
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import BackgroundTasks, HTTPException
from PIL import Image, ImageDraw
from sqlalchemy import text

import app.api.ipad_acts as ipad_api
from app.api.acts import delete_act
from app.core.database import Base, SessionLocal, engine
from app.db.models import (
    Act,
    ActStatus,
    IpadAdvisoryAct,
    IpadActAppendix,
    IpadDevice,
    IpadStudentAssignment,
    Participant,
    ParticipantKind,
    Template,
    User,
    UserRole,
)
from app.schemas.schemas import (
    IpadAppendixReplacementCreate,
    IpadAppendixSignatureRequest,
    IpadAppendixYearEndReturnCreate,
    IpadYearEndReturnItem,
)


pytestmark = pytest.mark.skipif(
    "acts_test" not in os.environ.get("DATABASE_URL", ""),
    reason="requires the isolated PostgreSQL test database",
)


def _signature():
    image = Image.new("RGB", (180, 80), "white")
    ImageDraw.Draw(image).line((15, 55, 160, 20), fill="black", width=4)
    output = BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


@pytest.fixture
def ipad_data():
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    user = User(username="ipad-admin", full_name="iPad Admin", password_hash="unused", role=UserRole.ADMIN)
    issuer = Participant(full_name="IT Manager", email="it@example.com", kind=ParticipantKind.IT_MANAGER)
    responsible = Participant(full_name="Class Advisor", email="advisor@example.com", kind=ParticipantKind.EMPLOYEE)
    template = Template(code="IPAD", name="iPad Advisory", schema_json={"fields": []}, is_active=True)
    old_device = IpadDevice(device_name="iPad", model="10th Gen", tag="T-001", serial_number="SERIAL-OLD", status="ISSUED")
    new_device = IpadDevice(device_name="iPad", model="10th Gen", tag="T-002", serial_number="SERIAL-NEW", status="AVAILABLE")
    db.add_all([user, issuer, responsible, template, old_device, new_device])
    db.flush()
    act = Act(
        template_id=template.id,
        party1_name=issuer.full_name,
        party2_name=responsible.full_name,
        issue_date=date.today(),
        item_name="Advisory iPad",
        receiver_email=responsible.email,
        extra_data_json={
            "party1_participant_id": str(issuer.id),
            "recipients": [{"participant_id": str(responsible.id), "full_name": responsible.full_name, "email": responsible.email, "signed_at": datetime.utcnow().isoformat()}],
        },
        status=ActStatus.COMPLETED,
        created_by=user.id,
    )
    db.add(act)
    db.flush()
    db.add(IpadAdvisoryAct(act_id=act.id, advisory_group="7A", academic_year="2026-2027"))
    assignment = IpadStudentAssignment(
        act_id=act.id,
        ipad_device_id=old_device.id,
        student_name="Student One",
        ipad_name=old_device.device_name,
        ipad_model=old_device.model,
        ipad_tag=old_device.tag,
        serial_number=old_device.serial_number,
        status="ISSUED",
    )
    db.add(assignment)
    db.commit()
    for item in [user, issuer, responsible, act, assignment, old_device, new_device]:
        db.refresh(item)
    yield db, user, issuer, responsible, act, assignment, old_device, new_device
    db.close()


def test_cancel_replacement_appendix_releases_reserved_ipad(ipad_data):
    db, user, _issuer, responsible, act, assignment, _old_device, new_device = ipad_data
    appendix = ipad_api.create_replacement_appendix(
        act.id,
        assignment.id,
        IpadAppendixReplacementCreate(
            responsible_participant_id=responsible.id,
            replacement_date=date.today(),
            reason="Damaged",
            old_condition="Broken screen",
            ipad_device_id=new_device.id,
        ),
        db,
        user,
    )
    db.refresh(new_device)
    assert new_device.status == "RESERVED"

    ipad_api.cancel_appendix(act.id, UUID(appendix["id"]), db, user)
    db.refresh(new_device)
    assert new_device.status == "AVAILABLE"


def test_year_end_return_is_applied_after_both_signatures(ipad_data, monkeypatch):
    db, user, issuer, responsible, act, assignment, old_device, _new_device = ipad_data
    appendix_data = ipad_api.create_year_end_return_appendix(
        act.id,
        IpadAppendixYearEndReturnCreate(
            responsible_participant_id=responsible.id,
            returned_at=date.today(),
            items=[IpadYearEndReturnItem(
                assignment_id=assignment.id,
                device_result_status="AVAILABLE",
                condition="Good",
            )],
        ),
        db,
        user,
    )

    monkeypatch.setattr(ipad_api, "_add_event_version", lambda *_args: (SimpleNamespace(id="version"), SimpleNamespace(id="pdf", storage_path="test.pdf")))
    monkeypatch.setattr(ipad_api, "enqueue_act_emails", lambda *_args: None)
    signature = _signature()
    responsible_result = ipad_api.sign_appendix(
        act.id,
        UUID(appendix_data["id"]),
        "responsible",
        IpadAppendixSignatureRequest(participant_id=responsible.id, signature_data=signature),
        BackgroundTasks(),
        db,
        user,
    )
    assert responsible_result["status"] == "WAITING_ISSUER"
    db.refresh(assignment)
    assert assignment.status == "ISSUED"
    ipad_api.sign_appendix(
        act.id,
        UUID(appendix_data["id"]),
        "issuer",
        IpadAppendixSignatureRequest(participant_id=issuer.id, signature_data=signature),
        BackgroundTasks(),
        db,
        user,
    )
    db.refresh(act)
    db.refresh(assignment)
    db.refresh(old_device)
    assert act.status == ActStatus.RETURNED
    assert assignment.status == "RETURNED"
    assert old_device.status == "AVAILABLE"
    appendix = db.query(IpadActAppendix).filter(IpadActAppendix.id == UUID(appendix_data["id"])).one()
    assert appendix.status == "APPLIED"
    assert appendix.responsible_signature_path
    assert appendix.issuer_signature_path
    assert appendix.pdf_storage_path


def test_year_end_return_rejects_outstanding_departed_ipad(ipad_data):
    db, user, _issuer, responsible, act, assignment, _old_device, new_device = ipad_data
    assignment.student_status = "DEPARTED"
    assignment.status = "RETURN_PENDING"
    new_device.status = "ISSUED"
    db.commit()

    with pytest.raises(HTTPException) as error:
        ipad_api.create_year_end_return_appendix(
            act.id,
            IpadAppendixYearEndReturnCreate(
                responsible_participant_id=responsible.id,
                returned_at=date.today(),
                items=[],
            ),
            db,
            user,
        )

    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_permanent_delete_releases_issued_ipad(ipad_data):
    db, user, _issuer, _responsible, act, _assignment, old_device, _new_device = ipad_data
    act_id = act.id

    await delete_act(act_id, db, user)

    db.refresh(old_device)
    assert old_device.status == "AVAILABLE"
    assert db.query(Act).filter(Act.id == act_id).first() is None
