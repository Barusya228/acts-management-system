from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.acts import (
    PARTY1_PARTICIPANT_ID_KEY,
    RECIPIENTS_KEY,
    _build_party2_summary,
    _get_primary_recipient_email,
    _get_selectable_participant,
    _require_active_template,
)
from app.core.database import get_db
from app.core.deps import get_current_guest_or_admin_user
from app.db.models import (
    Act,
    ActStatus,
    ActVersion,
    IpadAdvisoryAct,
    IpadAssignmentEvent,
    IpadDevice,
    IpadStudentAssignment,
    Participant,
    ParticipantEmploymentStatus,
    ParticipantKind,
    Template,
    User,
)
from app.schemas.schemas import (
    IpadAdvisoryActCreate,
    IpadReplacementRequest,
    IpadStudentDepartureRequest,
)
from app.services.audit_service import record_audit
from app.services.pdf_backup_service import backup_pdf_by_ids
from app.services.pdf_service import build_act_snapshot, create_pdf_asset_for_version


router = APIRouter()


def _serialize(act: Act) -> dict:
    profile = act.ipad_profile
    return {
        "id": str(act.id),
        "template_id": str(act.template_id),
        "advisory_group": profile.advisory_group,
        "academic_year": profile.academic_year,
        "issue_date": act.issue_date.isoformat(),
        "issuer": act.party1_name,
        "issuer_participant_id": (act.extra_data_json or {}).get(PARTY1_PARTICIPANT_ID_KEY),
        "responsibles": (act.extra_data_json or {}).get(RECIPIENTS_KEY, []),
        "status": act.status.value,
        "current_version": act.current_version,
        "students": [{
            "id": str(item.id),
            "student_name": item.student_name,
            "student_status": item.student_status,
            "ipad_name": item.ipad_name,
            "ipad_model": item.ipad_model,
            "ipad_tag": item.ipad_tag,
            "serial_number": item.serial_number,
            "imei": item.imei,
            "note": item.note,
            "status": item.status,
            "events": [{
                "id": str(event.id),
                "event_type": event.event_type,
                "data": event.data_json,
                "note": event.note,
                "created_at": event.created_at.isoformat(),
            } for event in item.events],
        } for item in act.ipad_assignments],
    }


def _add_event_version(
    db: Session,
    act: Act,
    current_user: User,
    change_note: str,
) -> tuple[ActVersion, object]:
    act.current_version += 1
    act.updated_at = datetime.utcnow()
    version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=build_act_snapshot(act),
        change_note=change_note,
        created_by=current_user.id,
    )
    db.add(version)
    db.flush()
    pdf_asset = create_pdf_asset_for_version(
        db,
        act,
        version,
        template_name=act.template.name,
        template_code="IPAD",
        use_v2=True,
    )
    return version, pdf_asset


@router.post("", status_code=status.HTTP_201_CREATED)
def create_ipad_advisory_act(
    payload: IpadAdvisoryActCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    template = db.query(Template).filter(Template.id == payload.template_id).first()
    if not template or template.code != "IPAD":
        raise HTTPException(status_code=422, detail="Выберите шаблон IPAD")
    _require_active_template(template)
    group = payload.advisory_group.strip()
    academic_year = payload.academic_year.strip()
    if not group or not academic_year:
        raise HTTPException(status_code=422, detail="Укажите advisory и учебный год")
    if not payload.responsible_participant_ids:
        raise HTTPException(status_code=422, detail="Добавьте хотя бы одно ответственное лицо")
    if not payload.students:
        raise HTTPException(status_code=422, detail="Добавьте хотя бы одного ученика и iPad")

    issuer = _get_selectable_participant(
        db, payload.issuer_participant_id, {ParticipantKind.IT_MANAGER, ParticipantKind.BOTH}, "выдающего"
    )
    responsibles = []
    responsible_ids = set()
    for participant_id in payload.responsible_participant_ids:
        participant = db.query(Participant).filter(Participant.id == participant_id).first()
        if not participant or not participant.is_active or participant.employment_status == ParticipantEmploymentStatus.DEPARTED:
            raise HTTPException(status_code=409, detail="Ответственное лицо недоступно для нового акта")
        if participant.id in responsible_ids:
            raise HTTPException(status_code=422, detail=f"Ответственный {participant.full_name} выбран несколько раз")
        if not participant.email:
            raise HTTPException(status_code=422, detail=f"У ответственного {participant.full_name} нет email")
        responsible_ids.add(participant.id)
        responsibles.append({
            "participant_id": str(participant.id),
            "full_name": participant.full_name,
            "email": participant.email,
            "signed_at": None,
            "signature_file_path": None,
            "return_signed_at": None,
            "return_signature_file_path": None,
        })

    student_names = set()
    ipad_device_ids = set()
    normalized_students = []
    for index, student in enumerate(payload.students):
        student_name = student.student_name.strip()
        if not student_name:
            raise HTTPException(status_code=422, detail=f"Строка #{index + 1}: укажите ученика")
        if student_name.casefold() in student_names:
            raise HTTPException(status_code=422, detail=f"Ученик {student_name} добавлен несколько раз")
        if student.ipad_device_id in ipad_device_ids:
            raise HTTPException(status_code=422, detail="Один iPad назначен нескольким ученикам")
        student_names.add(student_name.casefold())
        ipad_device_ids.add(student.ipad_device_id)
        normalized_students.append((student, student_name))

    devices = db.query(IpadDevice).filter(IpadDevice.id.in_(ipad_device_ids)).order_by(IpadDevice.id).with_for_update().all()
    devices_by_id = {item.id: item for item in devices}
    if len(devices_by_id) != len(ipad_device_ids):
        raise HTTPException(status_code=404, detail="Один из выбранных iPad не найден")
    unavailable = next((item for item in devices if item.status != "AVAILABLE"), None)
    if unavailable:
        raise HTTPException(status_code=409, detail=f"iPad {unavailable.tag} недоступен: {unavailable.status}")

    extra_data = {
        PARTY1_PARTICIPANT_ID_KEY: str(issuer.id),
        RECIPIENTS_KEY: responsibles,
        "advisory_group": group,
        "academic_year": academic_year,
    }
    act = Act(
        template_id=template.id,
        party1_name=issuer.full_name,
        party2_name=_build_party2_summary(responsibles),
        issue_date=payload.issue_date,
        item_name=f"Комплект iPad: {group}",
        item_serial=None,
        receiver_email=_get_primary_recipient_email(responsibles),
        extra_data_json=extra_data,
        created_by=current_user.id,
        status=ActStatus.DRAFT,
        current_version=1,
    )
    db.add(act)
    db.flush()
    db.add(IpadAdvisoryAct(act_id=act.id, advisory_group=group, academic_year=academic_year))
    for student, student_name in normalized_students:
        device = devices_by_id[student.ipad_device_id]
        device.status = "RESERVED"
        db.add(IpadStudentAssignment(
            act_id=act.id,
            ipad_device_id=device.id,
            student_name=student_name,
            ipad_name=device.device_name,
            ipad_model=device.model,
            ipad_tag=device.tag,
            serial_number=device.serial_number,
            imei=None,
            note=student.note.strip() if student.note else None,
            status="RESERVED",
        ))
    db.flush()
    version = ActVersion(act_id=act.id, version_number=1, data_json=build_act_snapshot(act), created_by=current_user.id)
    db.add(version)
    db.flush()
    pdf_asset = create_pdf_asset_for_version(db, act, version, template.name, "IPAD", True)
    record_audit(db, current_user, "ACT", act.id, "IPAD_ACT_CREATED", {
        "advisory_group": group,
        "responsibles": len(responsibles),
        "students": len(normalized_students),
    })
    db.commit()
    background_tasks.add_task(backup_pdf_by_ids, act.id, version.id, pdf_asset.id)
    db.refresh(act)
    return _serialize(act)


@router.get("/{act_id}")
def get_ipad_advisory_act(
    act_id: UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_guest_or_admin_user),
):
    act = db.query(Act).filter(Act.id == act_id).first()
    if not act or not act.ipad_profile:
        raise HTTPException(status_code=404, detail="iPad-акт не найден")
    return _serialize(act)


@router.post("/{act_id}/students/{assignment_id}/departure")
def record_student_departure(
    act_id: UUID,
    assignment_id: UUID,
    payload: IpadStudentDepartureRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    act = db.query(Act).filter(Act.id == act_id).populate_existing().with_for_update().first()
    assignment = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.id == assignment_id,
        IpadStudentAssignment.act_id == act_id,
    ).with_for_update().first()
    if not act or not act.ipad_profile or not assignment:
        raise HTTPException(status_code=404, detail="Назначение ученика не найдено")
    if act.status != ActStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Выбытие оформляется только в действующем подписанном акте")
    if assignment.student_status != "ACTIVE":
        raise HTTPException(status_code=409, detail="Ученик уже выбыл")
    assignment.student_status = "DEPARTED"
    assignment.status = "RETURNED" if payload.ipad_returned else "RETURN_PENDING"
    assignment.returned_at = datetime.utcnow() if payload.ipad_returned else None
    device = db.query(IpadDevice).filter(IpadDevice.id == assignment.ipad_device_id).with_for_update().first()
    if device:
        if payload.ipad_returned:
            condition = (payload.return_condition or "").strip().casefold()
            device.status = "MAINTENANCE" if condition and condition not in {"исправен", "хорошее", "рабочее"} else "AVAILABLE"
        else:
            device.status = "RETURN_PENDING"
    event = IpadAssignmentEvent(
        assignment_id=assignment.id,
        event_type="STUDENT_DEPARTED",
        data_json={
            "departure_date": payload.departure_date.isoformat(),
            "reason": payload.reason.strip(),
            "ipad_returned": payload.ipad_returned,
            "return_condition": payload.return_condition,
        },
        note=payload.note,
        created_by=current_user.id,
    )
    db.add(event)
    db.flush()
    version, pdf_asset = _add_event_version(db, act, current_user, f"Выбытие ученика: {assignment.student_name}")
    record_audit(db, current_user, "ACT", act.id, "IPAD_STUDENT_DEPARTED", {"assignment_id": str(assignment.id)})
    db.commit()
    background_tasks.add_task(backup_pdf_by_ids, act.id, version.id, pdf_asset.id)
    db.refresh(act)
    return _serialize(act)


@router.post("/{act_id}/students/{assignment_id}/replacement")
def replace_student_ipad(
    act_id: UUID,
    assignment_id: UUID,
    payload: IpadReplacementRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    act = db.query(Act).filter(Act.id == act_id).populate_existing().with_for_update().first()
    assignment = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.id == assignment_id,
        IpadStudentAssignment.act_id == act_id,
    ).with_for_update().first()
    if not act or not act.ipad_profile or not assignment:
        raise HTTPException(status_code=404, detail="Назначение ученика не найдено")
    if act.status != ActStatus.COMPLETED or assignment.student_status != "ACTIVE" or assignment.status != "ISSUED":
        raise HTTPException(status_code=409, detail="Замена доступна только для активного ученика с выданным iPad")
    new_device = db.query(IpadDevice).filter(IpadDevice.id == payload.ipad_device_id).with_for_update().first()
    old_device = db.query(IpadDevice).filter(IpadDevice.id == assignment.ipad_device_id).with_for_update().first()
    if not new_device or new_device.status != "AVAILABLE":
        raise HTTPException(status_code=409, detail="Новый iPad недоступен")
    old = {
        "ipad_name": assignment.ipad_name,
        "ipad_model": assignment.ipad_model,
        "ipad_tag": assignment.ipad_tag,
        "serial_number": assignment.serial_number,
        "imei": assignment.imei,
        "condition": payload.old_condition,
    }
    if old_device:
        old_device.status = "MAINTENANCE" if payload.old_condition.strip() else "AVAILABLE"
    new_device.status = "ISSUED"
    assignment.ipad_device_id = new_device.id
    assignment.ipad_name = new_device.device_name
    assignment.ipad_model = new_device.model
    assignment.ipad_tag = new_device.tag
    assignment.serial_number = new_device.serial_number
    assignment.imei = None
    event = IpadAssignmentEvent(
        assignment_id=assignment.id,
        event_type="IPAD_REPLACED",
        data_json={
            "replacement_date": payload.replacement_date.isoformat(),
            "reason": payload.reason.strip(),
            "old": old,
            "new": {
                "ipad_name": assignment.ipad_name,
                "ipad_model": assignment.ipad_model,
                "ipad_tag": assignment.ipad_tag,
                "serial_number": assignment.serial_number,
                "imei": assignment.imei,
            },
        },
        note=payload.note,
        created_by=current_user.id,
    )
    db.add(event)
    db.flush()
    version, pdf_asset = _add_event_version(db, act, current_user, f"Замена iPad: {assignment.student_name}")
    record_audit(db, current_user, "ACT", act.id, "IPAD_REPLACED", {"assignment_id": str(assignment.id), "old_tag": old["ipad_tag"], "new_tag": new_device.tag})
    db.commit()
    background_tasks.add_task(backup_pdf_by_ids, act.id, version.id, pdf_asset.id)
    db.refresh(act)
    return _serialize(act)
