import hashlib
import mimetypes
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.services.act_shared import (
    PARTY1_PARTICIPANT_ID_KEY,
    RECIPIENTS_KEY,
    build_party2_summary as _build_party2_summary,
    get_primary_recipient_email as _get_primary_recipient_email,
    get_selectable_participant as _get_selectable_participant,
    require_active_template as _require_active_template,
    validate_signature as _validate_signature,
)
from app.core.database import get_db
from app.core.deps import get_current_guest_or_admin_user
from app.db.states import ACTIVE_IPAD_ASSIGNMENT_STATUSES
from app.db.models import (
    Act,
    ActStatus,
    ActVersion,
    FileAsset,
    FileAssetKind,
    IpadAdvisoryAct,
    IpadActAppendix,
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
    IpadAppendixReplacementCreate,
    IpadAppendixDepartureCreate,
    IpadAppendixStudentAddCreate,
    IpadAppendixLateReturnCreate,
    IpadAppendixYearEndReturnCreate,
    IpadAppendixSignatureRequest,
)
from app.services.audit_service import record_audit
from app.services.pdf_backup_service import backup_pdf_by_ids
from app.services.pdf_service import build_act_snapshot, create_pdf_asset_for_version
from app.services.ipad_appendix_service import (
    apply_appendix,
    create_appendix_pdf,
    ensure_no_pending_appendix,
    next_appendix_number,
    release_appendix_reservation,
    save_appendix_signature,
    serialize_appendix,
)
from app.utils.storage import resolve_storage_path


router = APIRouter()

# Классификация повреждений iPad: человекочитаемые подписи (для PDF/аудита).
IPAD_DAMAGE_LABELS = {
    "OK": "Всё в порядке",
    "BENT_BODY": "Погнутый корпус",
    "CRACKED_SCREEN": "Треснутый экран",
    "LOST": "Потерян",
    "WEAK_BATTERY": "Слабый аккумулятор",
    "DAMAGED_DISPLAY": "Повреждена матрица",
    "NOT_RETURNED": "iPad не сдан (ожидается возврат)",
}


def _device_status_for_condition(condition: str) -> str:
    """Статус устройства по классификации состояния: OK → снова в выдачу,
    потерян → списан, любое повреждение → на обслуживание."""
    if condition == "OK":
        return "AVAILABLE"
    if condition == "LOST":
        return "RETIRED"
    return "MAINTENANCE"


def _register_signature_asset(db: Session, act: Act, kind: FileAssetKind, relative_path: str) -> None:
    """Регистрирует файл подписи приложения как последнюю подпись акта данного вида."""
    absolute = resolve_storage_path(relative_path)
    if not absolute.is_file():
        return
    content = absolute.read_bytes()
    db.add(FileAsset(
        act_id=act.id,
        kind=kind,
        storage_path=relative_path,
        mime_type=mimetypes.guess_type(str(absolute))[0] or "image/png",
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    ))


def _sync_act_signatures_from_appendix(db: Session, act: Act, appendix: IpadActAppendix) -> None:
    """Подписи применённого приложения становятся подписями текущей ревизии акта.

    PDF ревизии берёт подпись IT из последнего FileAsset(SIGNATURE_PARTY1),
    а подписи ответственных — из recipients[].signature_file_path. Обновляем
    оба источника, чтобы актуальная ревизия несла свежие подписи сторон.
    """
    if appendix.issuer_signature_path:
        _register_signature_asset(db, act, FileAssetKind.SIGNATURE_PARTY1, appendix.issuer_signature_path)
    if not appendix.responsible_signature_path:
        return
    _register_signature_asset(db, act, FileAssetKind.SIGNATURE_PARTY2, appendix.responsible_signature_path)
    extra = dict(act.extra_data_json or {})
    recipients = extra.get(RECIPIENTS_KEY)
    if not isinstance(recipients, list):
        return
    signed_at = appendix.responsible_signed_at.isoformat() if appendix.responsible_signed_at else datetime.utcnow().isoformat()
    for recipient in recipients:
        if isinstance(recipient, dict) and str(recipient.get("participant_id")) == str(appendix.responsible_participant_id):
            recipient["signature_file_path"] = appendix.responsible_signature_path
            recipient["signed_at"] = signed_at
    act.extra_data_json = extra
    flag_modified(act, "extra_data_json")


def _appendix_change_note(appendix: IpadActAppendix) -> str:
    """Человекочитаемое описание ревизии по применённому приложению."""
    payload = appendix.payload_json or {}
    prefix = f"Приложение №{appendix.appendix_number}"
    operation = appendix.operation_type
    if operation == "IPAD_REPLACEMENT":
        old_tag = (payload.get("old_ipad") or {}).get("tag", "?")
        new_tag = (payload.get("new_ipad") or {}).get("tag", "?")
        return f"{prefix}: Замена iPad — {payload.get('student_name', '')} (Tag {old_tag} → {new_tag})"
    if operation == "STUDENT_DEPARTURE":
        return f"{prefix}: Выбытие ученика — {payload.get('student_name', '')}"
    if operation == "STUDENT_ADDITION":
        return f"{prefix}: Добавление ученика — {payload.get('student_name', '')}"
    if operation == "LATE_RETURN":
        return f"{prefix}: Поздний возврат iPad — {payload.get('student_name', '')}"
    if operation == "YEAR_END_RETURN":
        return f"{prefix}: Годовой возврат Advisory завершён"
    return f"{prefix}: {operation}"


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
        "appendices": [serialize_appendix(item) for item in sorted(act.ipad_appendices, key=lambda row: row.appendix_number, reverse=True)],
    }


def _appendix_participants(
    db: Session,
    act: Act,
    responsible_id: UUID,
    issuer_id: UUID | None = None,
) -> tuple[Participant, Participant]:
    responsible_ids = {
        str(item.get("participant_id"))
        for item in (act.extra_data_json or {}).get(RECIPIENTS_KEY, [])
        if isinstance(item, dict)
    }
    if str(responsible_id) not in responsible_ids:
        raise HTTPException(status_code=422, detail="Выберите ответственное лицо из основного акта")
    responsible = db.query(Participant).filter(Participant.id == responsible_id).first()
    if issuer_id is not None:
        # IT-сотрудник, оформляющий операцию, выбирается из справочника выдающих.
        issuer = _get_selectable_participant(
            db, issuer_id, {ParticipantKind.IT_MANAGER, ParticipantKind.BOTH}, "выдающего"
        )
    else:
        act_issuer_id = (act.extra_data_json or {}).get(PARTY1_PARTICIPANT_ID_KEY)
        issuer = db.query(Participant).filter(Participant.id == act_issuer_id).first()
    if not responsible or not issuer:
        raise HTTPException(status_code=409, detail="Подписанты приложения не найдены")
    return responsible, issuer


def _create_appendix(
    db: Session,
    act: Act,
    operation_type: str,
    responsible: Participant,
    issuer: Participant,
    payload: dict,
    current_user: User,
) -> IpadActAppendix:
    appendix = IpadActAppendix(
        act_id=act.id,
        appendix_number=next_appendix_number(db, act.id),
        operation_type=operation_type,
        responsible_participant_id=responsible.id,
        issuer_participant_id=issuer.id,
        payload_json=payload,
        created_by=current_user.id,
    )
    db.add(appendix)
    db.flush()
    record_audit(db, current_user, "IPAD_APPENDIX", appendix.id, "IPAD_APPENDIX_CREATED", {"operation": operation_type})
    return appendix


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


@router.post("/{act_id}/appendices/replacement", status_code=status.HTTP_201_CREATED)
def create_replacement_appendix(
    act_id: UUID,
    assignment_id: UUID,
    payload: IpadAppendixReplacementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    act = db.query(Act).filter(Act.id == act_id).with_for_update().first()
    if not act or not act.ipad_profile or act.status != ActStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Изменения доступны только в действующем iPad-акте")
    ensure_no_pending_appendix(db, act.id)
    assignment = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.id == assignment_id,
        IpadStudentAssignment.act_id == act.id,
        IpadStudentAssignment.student_status == "ACTIVE",
        IpadStudentAssignment.status == "ISSUED",
    ).with_for_update().first()
    new_device = db.query(IpadDevice).filter(IpadDevice.id == payload.ipad_device_id).with_for_update().first()
    if not assignment or not new_device or new_device.status != "AVAILABLE":
        raise HTTPException(status_code=409, detail="Ученик или новый iPad недоступен")
    responsible, issuer = _appendix_participants(db, act, payload.responsible_participant_id, payload.issuer_participant_id)
    old_device = assignment.ipad_device
    new_device.status = "RESERVED"
    appendix = _create_appendix(db, act, "IPAD_REPLACEMENT", responsible, issuer, {
        "assignment_id": str(assignment.id),
        "student_name": assignment.student_name,
        "replacement_date": payload.replacement_date.isoformat(),
        "reason": payload.reason,
        "reason_label": IPAD_DAMAGE_LABELS.get(payload.reason, payload.reason),
        "old_result_status": _device_status_for_condition(payload.reason),
        "old_device_id": str(old_device.id),
        "old_ipad": {"model": old_device.model, "tag": old_device.tag, "serial_number": old_device.serial_number},
        "new_device_id": str(new_device.id),
        "new_ipad": {"model": new_device.model, "tag": new_device.tag, "serial_number": new_device.serial_number},
        "note": payload.note,
    }, current_user)
    db.commit()
    return serialize_appendix(appendix)


@router.post("/{act_id}/appendices/departure", status_code=status.HTTP_201_CREATED)
def create_departure_appendix(
    act_id: UUID,
    assignment_id: UUID,
    payload: IpadAppendixDepartureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    act = db.query(Act).filter(Act.id == act_id).with_for_update().first()
    if not act or not act.ipad_profile or act.status != ActStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Изменения доступны только в действующем iPad-акте")
    ensure_no_pending_appendix(db, act.id)
    assignment = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.id == assignment_id,
        IpadStudentAssignment.act_id == act.id,
        IpadStudentAssignment.student_status == "ACTIVE",
    ).with_for_update().first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Активный ученик не найден")
    responsible, issuer = _appendix_participants(db, act, payload.responsible_participant_id, payload.issuer_participant_id)
    # NOT_RETURNED — ученик выбыл, но iPad ещё не сдан: устройство переходит
    # в ожидание позднего возврата, иначе результат определяется состоянием.
    ipad_returned = payload.return_condition != "NOT_RETURNED"
    appendix = _create_appendix(db, act, "STUDENT_DEPARTURE", responsible, issuer, {
        "assignment_id": str(assignment.id),
        "device_id": str(assignment.ipad_device_id),
        "student_name": assignment.student_name,
        "departure_date": payload.departure_date.isoformat(),
        "ipad_returned": ipad_returned,
        "return_condition": payload.return_condition,
        "return_condition_label": IPAD_DAMAGE_LABELS.get(payload.return_condition, payload.return_condition),
        "device_result_status": _device_status_for_condition(payload.return_condition) if ipad_returned else "RETURN_PENDING",
        "ipad": {"model": assignment.ipad_model, "tag": assignment.ipad_tag, "serial_number": assignment.serial_number},
        "note": payload.note,
    }, current_user)
    db.commit()
    return serialize_appendix(appendix)


@router.post("/{act_id}/appendices/student-addition", status_code=status.HTTP_201_CREATED)
def create_student_addition_appendix(
    act_id: UUID,
    payload: IpadAppendixStudentAddCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    act = db.query(Act).filter(Act.id == act_id).with_for_update().first()
    if not act or not act.ipad_profile or act.status != ActStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Изменения доступны только в действующем iPad-акте")
    ensure_no_pending_appendix(db, act.id)
    student_name = payload.student_name.strip()
    if not student_name:
        raise HTTPException(status_code=422, detail="Укажите ФИО ученика")
    exists = db.query(IpadStudentAssignment.id).filter(
        IpadStudentAssignment.act_id == act.id,
        func.lower(IpadStudentAssignment.student_name) == student_name.lower(),
        IpadStudentAssignment.student_status == "ACTIVE",
    ).first()
    device = db.query(IpadDevice).filter(IpadDevice.id == payload.ipad_device_id).with_for_update().first()
    if exists or not device or device.status != "AVAILABLE":
        raise HTTPException(status_code=409, detail="Ученик уже существует или iPad недоступен")
    responsible, issuer = _appendix_participants(db, act, payload.responsible_participant_id)
    device.status = "RESERVED"
    appendix = _create_appendix(db, act, "STUDENT_ADDITION", responsible, issuer, {
        "student_name": student_name,
        "added_at": payload.added_at.isoformat(),
        "reason": payload.reason.strip(),
        "device_id": str(device.id),
        "ipad": {"model": device.model, "tag": device.tag, "serial_number": device.serial_number},
        "note": payload.note,
    }, current_user)
    db.commit()
    return serialize_appendix(appendix)


@router.post("/{act_id}/appendices/late-return", status_code=status.HTTP_201_CREATED)
def create_late_return_appendix(
    act_id: UUID,
    assignment_id: UUID,
    payload: IpadAppendixLateReturnCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    act = db.query(Act).filter(Act.id == act_id).with_for_update().first()
    ensure_no_pending_appendix(db, act_id)
    assignment = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.id == assignment_id,
        IpadStudentAssignment.act_id == act_id,
        IpadStudentAssignment.status == "RETURN_PENDING",
    ).with_for_update().first()
    if not act or not act.ipad_profile or not assignment:
        raise HTTPException(status_code=404, detail="Ожидающий возврата iPad не найден")
    responsible, issuer = _appendix_participants(db, act, payload.responsible_participant_id, payload.issuer_participant_id)
    appendix = _create_appendix(db, act, "LATE_RETURN", responsible, issuer, {
        "assignment_id": str(assignment.id),
        "device_id": str(assignment.ipad_device_id),
        "student_name": assignment.student_name,
        "returned_at": payload.returned_at.isoformat(),
        "condition": payload.condition,
        "condition_label": IPAD_DAMAGE_LABELS.get(payload.condition, payload.condition),
        "device_result_status": _device_status_for_condition(payload.condition),
        "ipad": {"model": assignment.ipad_model, "tag": assignment.ipad_tag, "serial_number": assignment.serial_number},
        "note": payload.note,
    }, current_user)
    db.commit()
    return serialize_appendix(appendix)


@router.post("/{act_id}/appendices/year-end-return", status_code=status.HTTP_201_CREATED)
def create_year_end_return_appendix(
    act_id: UUID,
    payload: IpadAppendixYearEndReturnCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    act = db.query(Act).filter(Act.id == act_id).with_for_update().first()
    if not act or not act.ipad_profile or act.status != ActStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Годовой возврат доступен только для действующего iPad-акта")
    if payload.returned_at < act.issue_date:
        raise HTTPException(status_code=422, detail="Дата возврата не может быть раньше даты выдачи")
    ensure_no_pending_appendix(db, act.id)
    assignments = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.act_id == act.id,
        IpadStudentAssignment.status.in_(ACTIVE_IPAD_ASSIGNMENT_STATUSES),
    ).with_for_update().all()
    if any(item.student_status != "ACTIVE" or item.status != "ISSUED" for item in assignments):
        raise HTTPException(status_code=409, detail="Сначала завершите все ожидающие и поздние возвраты iPad")
    expected_ids = {str(item.id) for item in assignments}
    supplied_ids = [str(item.assignment_id) for item in payload.items]
    if len(supplied_ids) != len(set(supplied_ids)):
        raise HTTPException(status_code=422, detail="Один iPad указан в возврате несколько раз")
    supplied = {str(item.assignment_id): item for item in payload.items}
    if not expected_ids or set(supplied) != expected_ids:
        raise HTTPException(status_code=422, detail="Укажите результат возврата для каждого активного iPad")
    responsible, issuer = _appendix_participants(db, act, payload.responsible_participant_id)
    items = []
    for assignment in assignments:
        result = supplied[str(assignment.id)]
        items.append({
            "assignment_id": str(assignment.id),
            "device_id": str(assignment.ipad_device_id),
            "student_name": assignment.student_name,
            "ipad": {"model": assignment.ipad_model, "tag": assignment.ipad_tag, "serial_number": assignment.serial_number},
            "device_result_status": _device_status_for_condition(result.condition),
            "condition": result.condition,
            "condition_label": IPAD_DAMAGE_LABELS.get(result.condition, result.condition),
        })
    appendix = _create_appendix(db, act, "YEAR_END_RETURN", responsible, issuer, {
        "returned_at": payload.returned_at.isoformat(),
        "items": items,
        "note": payload.note,
    }, current_user)
    db.commit()
    return serialize_appendix(appendix)


@router.post("/{act_id}/appendices/{appendix_id}/sign/{party}")
def sign_appendix(
    act_id: UUID,
    appendix_id: UUID,
    party: str,
    payload: IpadAppendixSignatureRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    if party not in {"responsible", "issuer"}:
        raise HTTPException(status_code=404, detail="Неизвестная сторона")
    act = db.query(Act).filter(Act.id == act_id).populate_existing().with_for_update().first()
    if not act or not act.ipad_profile:
        raise HTTPException(status_code=404, detail="iPad-акт не найден")
    appendix = db.query(IpadActAppendix).filter(
        IpadActAppendix.id == appendix_id,
        IpadActAppendix.act_id == act_id,
    ).populate_existing().with_for_update().first()
    if not appendix:
        raise HTTPException(status_code=404, detail="Приложение не найдено")
    if appendix.operation_type == "YEAR_END_RETURN" and act.status != ActStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Статус Advisory изменился, создайте возврат заново")
    expected_id = appendix.responsible_participant_id if party == "responsible" else appendix.issuer_participant_id
    expected_status = "WAITING_RESPONSIBLE" if party == "responsible" else "WAITING_ISSUER"
    if payload.participant_id != expected_id or appendix.status != expected_status:
        raise HTTPException(status_code=409, detail="Сейчас ожидается подпись другой стороны")
    _validate_signature(payload.signature_data)
    save_appendix_signature(appendix, party, payload.signature_data)
    version = None
    pdf_asset = None
    if party == "issuer":
        apply_appendix(db, appendix, current_user)
        create_appendix_pdf(appendix, appendix.act)
        # Подписи приложения переносятся в акт: актуальная ревизия подписана
        # теми, кто оформил изменение, а не только исходными подписями выдачи.
        _sync_act_signatures_from_appendix(db, act, appendix)
        # Каждое применённое приложение порождает новую ревизию основного акта:
        # старый PDF остаётся в истории, актуальный отражает текущий состав iPad.
        version, pdf_asset = _add_event_version(db, act, current_user, _appendix_change_note(appendix))
        if appendix.operation_type == "YEAR_END_RETURN":
            record_audit(db, current_user, "ACT", act.id, "IPAD_YEAR_END_RETURN_COMPLETED", {"version": act.current_version})
    record_audit(db, current_user, "IPAD_APPENDIX", appendix.id, f"IPAD_APPENDIX_{party.upper()}_SIGNED")
    db.commit()
    if version and pdf_asset:
        background_tasks.add_task(backup_pdf_by_ids, act.id, version.id, pdf_asset.id)
    db.refresh(appendix)
    return serialize_appendix(appendix)


@router.delete("/{act_id}/appendices/{appendix_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_appendix(
    act_id: UUID,
    appendix_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    appendix = db.query(IpadActAppendix).filter(IpadActAppendix.id == appendix_id, IpadActAppendix.act_id == act_id).with_for_update().first()
    if not appendix or appendix.status not in {"WAITING_RESPONSIBLE", "WAITING_ISSUER"}:
        raise HTTPException(status_code=409, detail="Это приложение нельзя отменить")
    release_appendix_reservation(db, appendix)
    appendix.status = "CANCELLED"
    appendix.cancelled_at = datetime.utcnow()
    record_audit(db, current_user, "IPAD_APPENDIX", appendix.id, "IPAD_APPENDIX_CANCELLED")
    db.commit()
    return None


@router.get("/{act_id}/appendices/{appendix_id}/pdf")
def download_appendix_pdf(
    act_id: UUID,
    appendix_id: UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_guest_or_admin_user),
):
    appendix = db.query(IpadActAppendix).filter(IpadActAppendix.id == appendix_id, IpadActAppendix.act_id == act_id).first()
    if not appendix or not appendix.pdf_storage_path:
        raise HTTPException(status_code=404, detail="PDF приложения не найден")
    path = resolve_storage_path(appendix.pdf_storage_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Файл PDF приложения отсутствует в хранилище")
    return FileResponse(path, media_type="application/pdf", filename=f"appendix_{appendix.appendix_number}.pdf")
