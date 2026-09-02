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
    ActVersion,
    EmailOutbox,
    IpadAdvisoryAct,
    IpadActAppendix,
    IpadDevice,
    IpadOperationOption,
    IpadStudentAssignment,
    Participant,
    ParticipantKind,
    Template,
    User,
    UserRole,
)
from app.schemas.schemas import (
    IpadAdvisoryAssignmentsUpdate,
    IpadAdvisoryParticipantsUpdate,
    IpadAppendixReplacementCreate,
    IpadAppendixSignatureRequest,
    IpadAppendixYearEndReturnCreate,
    IpadStudentAssignmentUpdate,
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


def test_replacement_creates_new_revision_with_new_tag(ipad_data):
    db, user, issuer, responsible, act, assignment, old_device, new_device = ipad_data
    initial_version = act.current_version
    appendix_data = ipad_api.create_replacement_appendix(
        act.id,
        assignment.id,
        IpadAppendixReplacementCreate(
            responsible_participant_id=responsible.id,
            replacement_date=date.today(),
            reason="CRACKED_SCREEN",
            ipad_device_id=new_device.id,
        ),
        db,
        user,
    )
    signature = _signature()
    ipad_api.sign_appendix(
        act.id,
        UUID(appendix_data["id"]),
        "responsible",
        IpadAppendixSignatureRequest(participant_id=responsible.id, signature_data=signature),
        BackgroundTasks(),
        db,
        user,
    )
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
    db.refresh(new_device)
    # Замена применена: назначение указывает на новый iPad, старый — на обслуживание.
    assert assignment.ipad_tag == new_device.tag
    assert new_device.status == "ISSUED"
    assert old_device.status == "MAINTENANCE"
    # Создана новая ревизия основного акта со снапшотом нового состава.
    assert act.current_version == initial_version + 1
    from app.db.models import ActVersion
    version = db.query(ActVersion).filter(
        ActVersion.act_id == act.id,
        ActVersion.version_number == act.current_version,
    ).one()
    assert version.pdf_file_id is not None
    assert "Замена iPad" in (version.change_note or "")
    students = version.data_json["extra_data_json"]["ipad_advisory"]["students"]
    assert students[0]["ipad_tag"] == new_device.tag
    # PDF приложения сгенерирован.
    appendix = db.query(IpadActAppendix).filter(IpadActAppendix.id == UUID(appendix_data["id"])).one()
    assert appendix.pdf_storage_path


def test_cancel_replacement_appendix_releases_reserved_ipad(ipad_data):
    db, user, _issuer, responsible, act, assignment, _old_device, new_device = ipad_data
    appendix = ipad_api.create_replacement_appendix(
        act.id,
        assignment.id,
        IpadAppendixReplacementCreate(
            responsible_participant_id=responsible.id,
            replacement_date=date.today(),
            reason="CRACKED_SCREEN",
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


def test_custom_replacement_reason_is_saved_with_maintenance_result(ipad_data):
    db, user, _issuer, responsible, act, assignment, _old_device, new_device = ipad_data
    option = IpadOperationOption(
        code="CUSTOM_REPLACEMENT_TEST",
        option_type="REPLACEMENT_REASON",
        name="Не работает камера",
    )
    db.add(option)
    db.commit()

    result = ipad_api.create_replacement_appendix(
        act.id,
        assignment.id,
        IpadAppendixReplacementCreate(
            responsible_participant_id=responsible.id,
            replacement_date=date.today(),
            reason=option.code,
            ipad_device_id=new_device.id,
        ),
        db,
        user,
    )

    assert result["payload"]["reason"] == option.code
    assert result["payload"]["reason_label"] == option.name
    assert result["payload"]["old_result_status"] == "MAINTENANCE"


def test_custom_departure_condition_is_saved_with_maintenance_result(ipad_data):
    db, user, issuer, responsible, act, assignment, _old_device, _new_device = ipad_data
    option = IpadOperationOption(
        code="CUSTOM_RETURN_TEST",
        option_type="RETURN_CONDITION",
        name="Есть глубокие царапины",
    )
    db.add(option)
    db.commit()

    result = ipad_api.create_departure_appendix(
        act.id,
        assignment.id,
        ipad_api.IpadAppendixDepartureCreate(
            responsible_participant_id=responsible.id,
            issuer_participant_id=issuer.id,
            departure_date=date.today(),
            return_condition=option.code,
        ),
        db,
        user,
    )

    assert result["payload"]["return_condition"] == option.code
    assert result["payload"]["return_condition_label"] == option.name
    assert result["payload"]["device_result_status"] == "MAINTENANCE"


def test_assignments_can_be_replaced_during_signing_and_reset_signatures(ipad_data):
    db, user, _issuer, _responsible, act, assignment, old_device, new_device = ipad_data
    old_assignment_id = assignment.id
    act.status = ActStatus.SIGNED_PARTY2
    assignment.status = "RESERVED"
    old_device.status = "RESERVED"
    extra = dict(act.extra_data_json or {})
    extra["recipients"] = [{
        **extra["recipients"][0],
        "signature_file_path": "acts/old-signature.png",
    }]
    act.extra_data_json = extra
    db.commit()

    result = ipad_api.update_ipad_advisory_assignments(
        act.id,
        IpadAdvisoryAssignmentsUpdate(students=[IpadStudentAssignmentUpdate(
            student_name="Replacement Student",
            ipad_device_id=new_device.id,
            note="Updated before signing",
        )]),
        BackgroundTasks(),
        db,
        user,
    )

    db.refresh(act)
    db.refresh(old_device)
    db.refresh(new_device)
    assignments = db.query(IpadStudentAssignment).filter(IpadStudentAssignment.act_id == act.id).all()
    assert act.status == ActStatus.DRAFT
    assert old_device.status == "AVAILABLE"
    assert new_device.status == "RESERVED"
    assert len(assignments) == 1
    assert assignments[0].id != old_assignment_id
    assert assignments[0].student_name == "Replacement Student"
    assert assignments[0].ipad_device_id == new_device.id
    assert result["responsibles"][0]["signed_at"] is None
    assert result["responsibles"][0]["signature_file_path"] is None
    version = db.query(ActVersion).filter(
        ActVersion.act_id == act.id,
        ActVersion.version_number == act.current_version,
    ).one()
    assert version.pdf_file_id is not None
    assert version.data_json["extra_data_json"]["ipad_advisory"]["students"][0]["student_name"] == "Replacement Student"


def test_participants_can_be_replaced_during_signing_and_reset_signatures(ipad_data):
    db, user, _issuer, _responsible, act, _assignment, _old_device, _new_device = ipad_data
    new_issuer = Participant(full_name="New IT Manager", email="new-it@example.com", kind=ParticipantKind.IT_MANAGER)
    new_responsible = Participant(full_name="New Class Advisor", email="new-advisor@example.com", kind=ParticipantKind.EMPLOYEE)
    db.add_all([new_issuer, new_responsible])
    db.flush()
    act.status = ActStatus.SIGNED_PARTY2
    extra = dict(act.extra_data_json or {})
    extra["recipients"] = [{
        **extra["recipients"][0],
        "signature_file_path": "acts/old-signature.png",
    }]
    act.extra_data_json = extra
    previous_version = act.current_version
    db.commit()

    result = ipad_api.update_ipad_advisory_participants(
        act.id,
        IpadAdvisoryParticipantsUpdate(
            issuer_participant_id=new_issuer.id,
            responsible_participant_ids=[new_responsible.id],
        ),
        BackgroundTasks(),
        db,
        user,
    )

    db.refresh(act)
    assert act.status == ActStatus.DRAFT
    assert act.party1_name == new_issuer.full_name
    assert act.party2_name == new_responsible.full_name
    assert act.receiver_email == new_responsible.email
    assert act.current_version == previous_version + 1
    assert result["issuer_participant_id"] == str(new_issuer.id)
    assert result["responsibles"] == [{
        "participant_id": str(new_responsible.id),
        "full_name": new_responsible.full_name,
        "email": new_responsible.email,
        "signed_at": None,
        "signature_file_path": None,
        "return_signed_at": None,
        "return_signature_file_path": None,
    }]
    version = db.query(ActVersion).filter(
        ActVersion.act_id == act.id,
        ActVersion.version_number == act.current_version,
    ).one()
    assert version.pdf_file_id is not None
    assert version.data_json["party1_name"] == new_issuer.full_name
    assert version.data_json["party2_name"] == new_responsible.full_name


def test_participants_cannot_be_replaced_after_ipad_act_completion(ipad_data):
    db, user, issuer, responsible, act, _assignment, _old_device, _new_device = ipad_data

    with pytest.raises(HTTPException) as error:
        ipad_api.update_ipad_advisory_participants(
            act.id,
            IpadAdvisoryParticipantsUpdate(
                issuer_participant_id=issuer.id,
                responsible_participant_ids=[responsible.id],
            ),
            BackgroundTasks(),
            db,
            user,
        )

    assert error.value.status_code == 409


def test_year_end_return_is_applied_after_both_signatures(ipad_data, monkeypatch):
    db, user, issuer, responsible, act, assignment, old_device, _new_device = ipad_data
    appendix_data = ipad_api.create_year_end_return_appendix(
        act.id,
        IpadAppendixYearEndReturnCreate(
            responsible_participant_id=responsible.id,
            returned_at=date.today(),
            items=[IpadYearEndReturnItem(
                assignment_id=assignment.id,
                condition="OK",
            )],
        ),
        db,
        user,
    )

    monkeypatch.setattr(ipad_api, "_add_event_version", lambda *_args: (SimpleNamespace(id="version"), SimpleNamespace(id="pdf", storage_path="test.pdf")))
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
    assert db.query(EmailOutbox).filter(EmailOutbox.act_id == act.id).count() == 0


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
