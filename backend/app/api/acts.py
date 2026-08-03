from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime
import shutil
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_admin_user, get_current_guest_or_admin_user
from app.db.models import (
    Act,
    ActVersion,
    Template,
    User,
    ActStatus,
    FileAsset,
    FileAssetKind,
    InventoryDevice,
    ActDeviceAssignment,
    ActAccessory,
    IpadStudentAssignment,
    IpadDevice,
    SmallEquipmentCatalog,
    DeviceStatus,
    Participant,
    ParticipantEmploymentStatus,
    ParticipantKind,
    EmailOutbox,
    PdfBackupRecord,
)
from app.schemas.schemas import ActCreate, ActUpdate, ActResponse, ActListResponse, ManualFinalEmailRequest, SignatureRequest, ActVersionResponse, ReturnStartRequest
from app.services.pdf_service import build_act_snapshot, create_pdf_asset_for_version
from app.services.pdf_backup_service import backup_pdf_by_ids
from app.services.audit_service import record_audit
from app.services.email_outbox_service import (
    ISSUE_COMPLETED,
    RETURN_COMPLETED,
    enqueue_manual_final_emails,
)
from app.utils.storage import resolve_storage_path, save_data_url_file, validate_signature_data_url

router = APIRouter()


RESERVED_ACT_FIELDS = {
    "party1_name",
    "party2_name",
    "issue_date",
    "item_name",
    "item_serial",
    "receiver_email",
}

EQUIPMENT_LIST_KEY = "equipment_list"
ACCESSORIES_KEY = "accessories"
RECIPIENTS_KEY = "recipients"
PARTY1_PARTICIPANT_ID_KEY = "party1_participant_id"
INVENTORY_CATEGORY_KEY = "inventory_category"
IPAD_ADVISORY_KEY = "advisory_note"


def _normalize_recipients(recipients: object, preserve_signature_state: bool = True) -> list[dict]:
    if recipients is None:
        return []

    if not isinstance(recipients, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Поле '{RECIPIENTS_KEY}' должно быть массивом"
        )

    normalized_recipients: list[dict] = []
    for index, item in enumerate(recipients):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле '{RECIPIENTS_KEY}[{index}]' должно быть объектом"
            )

        full_name = str(item.get("full_name", "")).strip()
        email = str(item.get("email", "")).strip()
        participant_id = item.get("participant_id")
        if participant_id is not None:
            participant_id = str(participant_id).strip() or None

        if not full_name or not email or "@" not in email:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Получатель #{index + 1} должен содержать ФИО и корректный email"
            )

        normalized_recipients.append({
            "participant_id": participant_id,
            "full_name": full_name,
            "email": email,
            "signed_at": item.get("signed_at") if preserve_signature_state and isinstance(item.get("signed_at"), str) else None,
            "signature_file_path": item.get("signature_file_path") if preserve_signature_state and isinstance(item.get("signature_file_path"), str) else None,
            "return_signed_at": item.get("return_signed_at") if preserve_signature_state and isinstance(item.get("return_signed_at"), str) else None,
            "return_signature_file_path": item.get("return_signature_file_path") if preserve_signature_state and isinstance(item.get("return_signature_file_path"), str) else None,
        })

    return normalized_recipients


def _extract_recipients(extra_data: Optional[dict], fallback_name: str, fallback_email: str) -> list[dict]:
    payload = extra_data or {}
    recipients = _normalize_recipients(payload.get(RECIPIENTS_KEY))
    if recipients:
        return recipients

    fallback_name = (fallback_name or "").strip()
    fallback_email = (fallback_email or "").strip()
    if not fallback_name and not fallback_email:
        return []

    return [{
        "participant_id": None,
        "full_name": fallback_name,
        "email": fallback_email,
        "signed_at": None,
        "signature_file_path": None,
        "return_signed_at": None,
        "return_signature_file_path": None,
    }]


def _manual_email_recipients(db: Session, act: Act) -> list[dict]:
    recipients = []
    for item in _extract_recipients(act.extra_data_json, act.party2_name, act.receiver_email):
        email = str(item.get("email", "")).strip().lower()
        if email:
            recipients.append({
                "participant_id": item.get("participant_id"),
                "full_name": str(item.get("full_name", "")).strip(),
                "email": email,
                "role": "Получатель" if not act.ipad_profile else "Ответственное лицо",
            })
    issuer = None
    issuer_id = (act.extra_data_json or {}).get(PARTY1_PARTICIPANT_ID_KEY)
    if issuer_id:
        try:
            issuer = db.query(Participant).filter(Participant.id == UUID(str(issuer_id))).first()
        except (TypeError, ValueError, AttributeError):
            issuer = None
    if not issuer:
        issuer = db.query(Participant).filter(Participant.full_name == act.party1_name).first()
    if issuer and issuer.email:
        recipients.append({
            "participant_id": str(issuer.id),
            "full_name": issuer.full_name,
            "email": issuer.email.strip().lower(),
            "role": "Выдающий IT",
        })
    unique = {}
    for item in recipients:
        email = item["email"]
        if email in unique:
            unique[email]["role"] = f"{unique[email]['role']}, {item['role']}"
        else:
            unique[email] = item
    return list(unique.values())


def _final_document(db: Session, act: Act, kind: str):
    target_status = ActStatus.COMPLETED.value if kind == ISSUE_COMPLETED else ActStatus.RETURNED.value
    versions = db.query(ActVersion).filter(ActVersion.act_id == act.id).order_by(ActVersion.version_number.desc()).all()
    for version in versions:
        snapshot = version.data_json if isinstance(version.data_json, dict) else {}
        if snapshot.get("status") != target_status or not version.pdf_file_id:
            continue
        asset = db.query(FileAsset).filter(FileAsset.id == version.pdf_file_id).first()
        if asset and resolve_storage_path(asset.storage_path).is_file():
            return version, asset
    return None, None


def _manual_email_history(db: Session, act_id: UUID) -> list[dict]:
    rows = db.query(EmailOutbox).filter(
        EmailOutbox.act_id == act_id,
        EmailOutbox.dispatch_id.isnot(None),
        EmailOutbox.kind.in_([ISSUE_COMPLETED, RETURN_COMPLETED]),
    ).order_by(EmailOutbox.created_at.desc()).all()
    user_ids = {row.requested_by for row in rows if row.requested_by}
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    users_by_id = {item.id: item.full_name for item in users}
    grouped = {}
    for row in rows:
        key = str(row.dispatch_id)
        if key not in grouped:
            grouped[key] = {
                "dispatch_id": key,
                "kind": row.kind,
                "document_version": row.document_version,
                "custom_message": row.custom_message,
                "requested_by": users_by_id.get(row.requested_by, "Администратор"),
                "created_at": row.created_at.isoformat(),
                "recipients": [],
            }
        grouped[key]["recipients"].append({
            "email": row.recipient_email,
            "name": row.recipient_name,
            "status": row.status,
            "sent_at": row.sent_at.isoformat() if row.sent_at else None,
            "last_error": row.last_error,
        })
    result = []
    for item in grouped.values():
        statuses = {recipient["status"] for recipient in item["recipients"]}
        item["status"] = "SENT" if statuses == {"SENT"} else "ERROR" if "DEAD" in statuses else "PENDING"
        result.append(item)
    return result


def _build_party2_summary(recipients: list[dict]) -> str:
    if not recipients:
        return ""
    if len(recipients) == 1:
        return recipients[0]["full_name"]
    return f"{recipients[0]['full_name']} и еще {len(recipients) - 1}"


def _get_primary_recipient_email(recipients: list[dict]) -> str:
    for recipient in recipients:
        email = str(recipient.get("email", "")).strip()
        if email:
            return email
    return ""


def _inventory_category_for_serial(db: Session, serial_number: str | None) -> str | None:
    if not serial_number:
        return None
    device = db.query(InventoryDevice).filter(
        (InventoryDevice.serial_number == serial_number)
        | (InventoryDevice.inventory_number == serial_number)
    ).first()
    return str(device.category) if device else None


def _parse_device_id(value: object, label: str) -> UUID:
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Выберите {label} из инвентаря",
        )


def _reserve_act_devices(
    db: Session,
    act: Act,
    primary_device_id: object,
    equipment_list: list[dict],
) -> list[dict]:
    requested = [(_parse_device_id(primary_device_id, "основное устройство"), "MAIN", None)]
    for index, item in enumerate(equipment_list):
        requested.append((
            _parse_device_id(item.get("inventory_device_id"), f"дополнительное устройство #{index + 1}"),
            "ADDITIONAL",
            item,
        ))

    device_ids = [item[0] for item in requested]
    if len(device_ids) != len(set(device_ids)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Одно устройство нельзя добавить в акт несколько раз",
        )

    devices = (
        db.query(InventoryDevice)
        .filter(InventoryDevice.id.in_(device_ids))
        .order_by(InventoryDevice.id.asc())
        .with_for_update()
        .all()
    )
    devices_by_id = {device.id: device for device in devices}
    if len(devices_by_id) != len(device_ids):
        raise HTTPException(status_code=404, detail="Одно из выбранных устройств не найдено")

    normalized_equipment = []
    for device_id, assignment_type, item in requested:
        device = devices_by_id[device_id]
        if device.status != DeviceStatus.AVAILABLE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Устройство {device.name} уже недоступно: {device.status.value}",
            )
        device.status = DeviceStatus.RESERVED
        device.assigned_to = act.party2_name
        db.add(ActDeviceAssignment(
            act_id=act.id,
            device_id=device.id,
            assignment_type=assignment_type,
            status="RESERVED",
            recipient_name=act.party2_name,
        ))
        if assignment_type == "MAIN":
            act.inventory_device_id = device.id
            act.item_name = device.name
            act.item_serial = device.inventory_number
        else:
            normalized_equipment.append({
                "inventory_device_id": str(device.id),
                "name": device.name,
                "serial": device.inventory_number,
                "imei": str((item or {}).get("imei", "")).strip(),
            })

    return normalized_equipment


def _transition_act_devices(db: Session, act: Act, target_status: str) -> None:
    assignments = (
        db.query(ActDeviceAssignment)
        .filter(ActDeviceAssignment.act_id == act.id)
        .with_for_update()
        .all()
    )
    if not assignments:
        if act.item_serial:
            device = db.query(InventoryDevice).filter(
                InventoryDevice.serial_number == act.item_serial
            ).with_for_update().first()
            if device:
                device.status = (
                    DeviceStatus.ISSUED if target_status == "ISSUED" else DeviceStatus.AVAILABLE
                )
                device.assigned_to = act.party2_name if target_status == "ISSUED" else None
        return

    now = datetime.utcnow()
    expected_status = "RESERVED" if target_status == "ISSUED" else "ISSUED"
    for assignment in assignments:
        if assignment.status != expected_status:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Состояние выдачи устройства не соответствует операции",
            )
        device = db.query(InventoryDevice).filter(
            InventoryDevice.id == assignment.device_id
        ).with_for_update().first()
        if not device:
            raise HTTPException(status_code=409, detail="Связанное устройство не найдено")
        assignment.status = target_status
        if target_status == "ISSUED":
            assignment.issued_at = now
            device.status = DeviceStatus.ISSUED
            device.assigned_to = assignment.recipient_name
        else:
            assignment.returned_at = now
            device.status = DeviceStatus.AVAILABLE
            device.assigned_to = None


def _require_active_template(template: Template) -> None:
    if not template.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Выбранный шаблон отключён и недоступен для новых актов",
        )


def _normalize_accessories(value: object) -> list[dict]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise HTTPException(status_code=422, detail=f"Поле '{ACCESSORIES_KEY}' должно быть массивом")
    normalized = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise HTTPException(status_code=422, detail=f"Мелкая техника #{index + 1} заполнена неверно")
        name = str(item.get("name", "")).strip()
        model = str(item.get("model", "")).strip()
        note = str(item.get("note", "")).strip()
        catalog_item_id = item.get("catalog_item_id")
        try:
            quantity = int(item.get("quantity", 1))
        except (TypeError, ValueError):
            quantity = 0
        if not name or quantity < 1:
            raise HTTPException(
                status_code=422,
                detail=f"Мелкая техника #{index + 1}: укажите название и количество больше нуля",
            )
        normalized.append({
            "catalog_item_id": str(catalog_item_id).strip() if catalog_item_id else None,
            "name": name,
            "model": model or None,
            "quantity": quantity,
            "note": note or None,
            "requires_return": True,
        })
    return normalized


def _transition_act_accessories(db: Session, act: Act, target_status: str) -> None:
    accessories = db.query(ActAccessory).filter(ActAccessory.act_id == act.id).with_for_update().all()
    now = datetime.utcnow()
    expected = "RESERVED" if target_status == "ISSUED" else "ISSUED"
    for accessory in accessories:
        if accessory.status != expected:
            raise HTTPException(status_code=409, detail="Состояние мелкой техники не соответствует операции")
        accessory.status = target_status
        if target_status == "ISSUED":
            accessory.issued_at = now
        else:
            accessory.returned_at = now


def _transition_ipad_assignments(db: Session, act: Act, target_status: str) -> None:
    assignments = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.act_id == act.id
    ).with_for_update().all()
    if not assignments:
        return
    expected = "RESERVED" if target_status == "ISSUED" else "ISSUED"
    now = datetime.utcnow()
    for assignment in assignments:
        if assignment.status != expected:
            raise HTTPException(status_code=409, detail="Состояние iPad не соответствует операции")
        assignment.status = target_status
        if assignment.ipad_device_id:
            device = db.query(IpadDevice).filter(IpadDevice.id == assignment.ipad_device_id).with_for_update().first()
            if device:
                device.status = "ISSUED" if target_status == "ISSUED" else "AVAILABLE"
        if target_status == "RETURNED":
            assignment.returned_at = now


def _get_selectable_participant(
    db: Session,
    participant_id: object,
    allowed_kinds: set[ParticipantKind],
    label: str,
) -> Participant:
    try:
        normalized_id = UUID(str(participant_id))
    except (TypeError, ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Выберите {label} из справочника участников",
        )

    participant = db.query(Participant).filter(Participant.id == normalized_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail=f"{label.capitalize()} не найден")
    if participant.employment_status == ParticipantEmploymentStatus.DEPARTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Нельзя создать новый акт: {participant.full_name} выбыл",
        )
    if not participant.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Нельзя создать новый акт: {participant.full_name} неактивен",
        )
    if participant.kind not in allowed_kinds:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Участник {participant.full_name} не подходит для роли «{label}»",
        )
    return participant


def _validate_new_act_participants(
    db: Session,
    party1_participant_id: object,
    recipients: list[dict],
) -> tuple[Participant, list[dict]]:
    party1 = _get_selectable_participant(
        db,
        party1_participant_id,
        {ParticipantKind.IT_MANAGER, ParticipantKind.BOTH},
        "выдающего",
    )

    normalized_recipients = []
    recipient_ids = set()
    for recipient in recipients:
        participant = _get_selectable_participant(
            db,
            recipient.get("participant_id"),
            {ParticipantKind.EMPLOYEE, ParticipantKind.BOTH},
            "получателя",
        )
        if participant.id in recipient_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Получатель {participant.full_name} выбран несколько раз",
            )
        recipient_ids.add(participant.id)
        normalized_recipients.append({
            **recipient,
            "participant_id": str(participant.id),
            "full_name": participant.full_name,
            "email": participant.email or recipient["email"],
        })

    return party1, normalized_recipients


def _value_matches_type(value, field_type: str) -> bool:
    if value is None:
        return True

    if field_type in {"string", "text"}:
        return isinstance(value, str)
    if field_type == "email":
        return isinstance(value, str) and "@" in value
    if field_type == "date":
        return isinstance(value, str)
    if field_type in {"number", "float"}:
        return isinstance(value, (int, float))
    if field_type in {"integer", "int"}:
        return isinstance(value, int)
    if field_type in {"boolean", "bool"}:
        return isinstance(value, bool)

    return isinstance(value, str)


def _validate_extra_data(extra_data: Optional[dict], template: Template) -> dict:
    payload = extra_data or {}
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Дополнительные поля должны быть объектом (JSON)"
        )
    payload = dict(payload)

    schema = template.schema_json or {}
    fields = schema.get("fields") or []
    if not isinstance(fields, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Некорректная структура шаблона: fields должен быть массивом"
        )

    allowed_dynamic = {}
    required_dynamic = set()
    for field in fields:
        if not isinstance(field, dict):
            continue
        name = field.get("name")
        if not name or name in RESERVED_ACT_FIELDS:
            continue
        allowed_dynamic[name] = field.get("type", "string")
        if field.get("required"):
            required_dynamic.add(name)

    if getattr(template, "code", None) == "IPAD" and IPAD_ADVISORY_KEY not in allowed_dynamic:
        allowed_dynamic[IPAD_ADVISORY_KEY] = "string"
        required_dynamic.add(IPAD_ADVISORY_KEY)

    special_keys = {
        EQUIPMENT_LIST_KEY,
        ACCESSORIES_KEY,
        RECIPIENTS_KEY,
        PARTY1_PARTICIPANT_ID_KEY,
    }
    unknown_keys = [key for key in payload.keys() if key not in allowed_dynamic and key not in special_keys]
    if unknown_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Поля не поддерживаются выбранным шаблоном: {', '.join(unknown_keys)}"
        )

    equipment_list = payload.get(EQUIPMENT_LIST_KEY)
    if equipment_list is not None:
        if not isinstance(equipment_list, list):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле '{EQUIPMENT_LIST_KEY}' должно быть массивом"
            )

        normalized_equipment = []
        for index, item in enumerate(equipment_list):
            if not isinstance(item, dict):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Поле '{EQUIPMENT_LIST_KEY}[{index}]' должно быть объектом"
                )

            name = str(item.get("name", "")).strip()
            serial = str(item.get("serial", "")).strip()
            imei = str(item.get("imei", "")).strip()
            inventory_device_id = item.get("inventory_device_id")
            if inventory_device_id is not None:
                inventory_device_id = str(inventory_device_id).strip() or None
            if not name and not serial and not imei and not inventory_device_id:
                continue
            normalized_item = {
                "name": name,
                "serial": serial,
                "imei": imei,
            }
            if inventory_device_id:
                normalized_item["inventory_device_id"] = inventory_device_id
            normalized_equipment.append(normalized_item)

        payload[EQUIPMENT_LIST_KEY] = normalized_equipment

    recipients = payload.get(RECIPIENTS_KEY)
    if recipients is not None:
        payload[RECIPIENTS_KEY] = _normalize_recipients(
            recipients,
            preserve_signature_state=False,
        )
    if ACCESSORIES_KEY in payload:
        payload[ACCESSORIES_KEY] = _normalize_accessories(payload[ACCESSORIES_KEY])

    for field_name in required_dynamic:
        value = payload.get(field_name)
        if value is None or (isinstance(value, str) and not value.strip()):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле '{field_name}' обязательно по шаблону"
            )

    for key, value in payload.items():
        if key in special_keys:
            continue
        field_type = allowed_dynamic[key]
        if not _value_matches_type(value, field_type):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле '{key}' имеет неверный тип для '{field_type}'"
            )

    normalized = {}
    for key in allowed_dynamic.keys():
        if key in payload:
            normalized[key] = payload[key]
    if EQUIPMENT_LIST_KEY in payload:
        normalized[EQUIPMENT_LIST_KEY] = payload[EQUIPMENT_LIST_KEY]
    if ACCESSORIES_KEY in payload:
        normalized[ACCESSORIES_KEY] = payload[ACCESSORIES_KEY]
    if RECIPIENTS_KEY in payload:
        normalized[RECIPIENTS_KEY] = payload[RECIPIENTS_KEY]
    if PARTY1_PARTICIPANT_ID_KEY in payload:
        normalized[PARTY1_PARTICIPANT_ID_KEY] = payload[PARTY1_PARTICIPANT_ID_KEY]
    return normalized


def _is_return_flow(status_value: ActStatus) -> bool:
    return status_value in {
        ActStatus.RETURN_INITIATED,
        ActStatus.RETURN_SIGNED_PARTY1,
        ActStatus.RETURN_SIGNED_PARTY2,
        ActStatus.RETURNED,
    }


def _can_party1_sign_issue(act: Act) -> bool:
    recipients = _extract_recipients(act.extra_data_json, act.party2_name, act.receiver_email)
    return bool(recipients) and all(recipient.get("signed_at") for recipient in recipients)


def _validate_party1_signer(act: Act, participant_id: object) -> None:
    extra_data = act.extra_data_json if isinstance(act.extra_data_json, dict) else {}
    expected_participant_id = extra_data.get(PARTY1_PARTICIPANT_ID_KEY)
    if expected_participant_id and str(participant_id or "") != str(expected_participant_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Подпись должна принадлежать выбранному выдающему",
        )


def _validate_signature(signature_data: str) -> None:
    try:
        validate_signature_data_url(signature_data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )


def _sign_recipient(
    act: Act,
    signature_data: str,
    participant_id: object = None,
    return_flow: bool = False,
) -> tuple[dict, str, int]:
    extra_data = dict(act.extra_data_json or {})
    recipients = _extract_recipients(extra_data, act.party2_name, act.receiver_email)
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="У акта нет получателей для подписи"
        )

    target_key = "return_signed_at" if return_flow else "signed_at"
    signature_path_key = "return_signature_file_path" if return_flow else "signature_file_path"
    pending_index = next((index for index, recipient in enumerate(recipients) if not recipient.get(target_key)), None)
    if pending_index is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Все получатели уже подписали этот этап"
        )

    expected_participant_id = recipients[pending_index].get("participant_id")
    if expected_participant_id and str(participant_id or "") != str(expected_participant_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Сейчас ожидается подпись: {recipients[pending_index]['full_name']}",
        )

    relative_path, mime_type, size_bytes, sha256 = save_data_url_file(
        signature_data,
        relative_dir=f"acts/{act.id}",
        filename_stem=(
            f"return_signature_party2_recipient_{pending_index + 1}_v{act.current_version}"
            if return_flow
            else f"signature_party2_recipient_{pending_index + 1}_v{act.current_version}"
        )
    )

    recipients[pending_index][target_key] = datetime.utcnow().isoformat()
    recipients[pending_index][signature_path_key] = relative_path
    extra_data[RECIPIENTS_KEY] = recipients
    act.extra_data_json = extra_data
    act.party2_name = _build_party2_summary(recipients)
    act.receiver_email = _get_primary_recipient_email(recipients)

    return {
        "relative_path": relative_path,
        "mime_type": mime_type,
        "size_bytes": size_bytes,
        "sha256": sha256,
    }, recipients[pending_index]["full_name"], pending_index

@router.get("", response_model=ActListResponse)
async def list_acts(
    party1: Optional[str] = Query(None),
    party2: Optional[str] = Query(None),
    item_name: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    query = db.query(Act)
    
    if party1:
        query = query.filter(Act.party1_name.ilike(f"%{party1}%"))
    if party2:
        query = query.filter(Act.party2_name.ilike(f"%{party2}%"))
    if item_name:
        query = query.filter(Act.item_name.ilike(f"%{item_name}%"))
    if email:
        query = query.filter(Act.receiver_email.ilike(f"%{email}%"))
    
    total = query.count()
    acts = query.order_by(Act.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for act in acts:
        item = ActResponse.model_validate(act).model_dump()
        item["template_code"] = act.template.code if act.template else None
        if act.ipad_profile:
            item["advisory_group"] = act.ipad_profile.advisory_group
            item["student_count"] = len(act.ipad_assignments)
        items.append(item)
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.post("", response_model=ActResponse, status_code=status.HTTP_201_CREATED)
async def create_act(
    act_data: ActCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    # Verify template exists
    template = db.query(Template).filter(Template.id == act_data.template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    _require_active_template(template)
    
    normalized_extra_data = _validate_extra_data(act_data.extra_data_json, template)
    recipients = _extract_recipients(normalized_extra_data, act_data.party2_name, act_data.receiver_email)
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нужен хотя бы один получатель"
        )
    party1, recipients = _validate_new_act_participants(
        db,
        act_data.party1_participant_id,
        recipients,
    )
    normalized_extra_data[RECIPIENTS_KEY] = recipients
    normalized_extra_data[PARTY1_PARTICIPANT_ID_KEY] = str(party1.id)

    act_payload = act_data.model_dump()
    act_payload.pop("party1_participant_id", None)
    act_payload["party1_name"] = party1.full_name
    act_payload["party2_name"] = _build_party2_summary(recipients)
    act_payload["receiver_email"] = _get_primary_recipient_email(recipients)
    act_payload["extra_data_json"] = normalized_extra_data

    act = Act(
        **act_payload,
        created_by=current_user.id,
        status=ActStatus.DRAFT,
        current_version=1
    )
    
    db.add(act)
    db.flush()

    normalized_equipment = _reserve_act_devices(
        db,
        act,
        act_data.inventory_device_id,
        normalized_extra_data.get(EQUIPMENT_LIST_KEY, []),
    )
    accessories = normalized_extra_data.get(ACCESSORIES_KEY, [])
    for item in accessories:
        catalog_item = None
        if item.get("catalog_item_id"):
            try:
                catalog_item = db.query(SmallEquipmentCatalog).filter(
                    SmallEquipmentCatalog.id == UUID(item["catalog_item_id"]),
                    SmallEquipmentCatalog.is_active.is_(True),
                ).first()
            except ValueError:
                catalog_item = None
            if not catalog_item:
                raise HTTPException(status_code=422, detail=f"Мелкая техника {item['name']} не найдена в инвентаре")
        else:
            catalog_item = db.query(SmallEquipmentCatalog).filter(
                SmallEquipmentCatalog.name == item["name"],
                SmallEquipmentCatalog.model == (item.get("model") or ""),
            ).first()
            if not catalog_item:
                catalog_item = SmallEquipmentCatalog(name=item["name"], model=item.get("model") or "")
                db.add(catalog_item)
                db.flush()
        db.add(ActAccessory(
            act_id=act.id,
            catalog_item_id=catalog_item.id,
            name=catalog_item.name,
            model=catalog_item.model or None,
            quantity=item["quantity"],
            note=item.get("note"),
            requires_return=True,
            status="RESERVED",
            recipient_name=act.party2_name,
        ))
    if normalized_equipment:
        normalized_extra_data[EQUIPMENT_LIST_KEY] = normalized_equipment
    else:
        normalized_extra_data.pop(EQUIPMENT_LIST_KEY, None)
    inventory_category = _inventory_category_for_serial(db, act.item_serial)
    if inventory_category:
        normalized_extra_data[INVENTORY_CATEGORY_KEY] = inventory_category
    act.extra_data_json = normalized_extra_data
    db.flush()
    
    # Create initial version
    version = ActVersion(
        act_id=act.id,
        version_number=1,
        data_json=build_act_snapshot(act),
        created_by=current_user.id
    )
    db.add(version)
    db.flush()
    pdf_asset = create_pdf_asset_for_version(
        db,
        act,
        version,
        template_name=template.name,
        template_code=template.code,
        use_v2=(getattr(template, "pdf_version", 2) == 2),
    )
    record_audit(db, current_user, "ACT", act.id, "ACT_CREATED", {
        "template": template.code,
        "devices": 1 + len(normalized_equipment),
    })
    db.commit()
    background_tasks.add_task(backup_pdf_by_ids, act.id, version.id, pdf_asset.id)
    
    return act

@router.get("/{act_id}", response_model=ActResponse)
async def get_act(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    return act


@router.patch("/{act_id}", response_model=ActResponse)
async def update_act(
    act_id: UUID,
    payload: ActUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).populate_existing().with_for_update().first()

    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )

    if not act.template or act.template.code != "IPAD":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Редактирование доступно только для IPAD актов"
        )

    if act.status != ActStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Редактирование доступно только для актов в статусе DRAFT"
        )

    existing_recipients = _extract_recipients(
        act.extra_data_json,
        act.party2_name,
        act.receiver_email,
    )
    if any(
        recipient.get("signed_at") or recipient.get("return_signed_at")
        for recipient in existing_recipients
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Редактирование запрещено после первой подписи",
        )

    incoming_extra = payload.extra_data_json or {}
    if not isinstance(incoming_extra, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Дополнительные поля должны быть объектом (JSON)"
        )

    existing_extra = dict(act.extra_data_json or {})
    if IPAD_ADVISORY_KEY in existing_extra:
        incoming_extra[IPAD_ADVISORY_KEY] = existing_extra.get(IPAD_ADVISORY_KEY)
    if PARTY1_PARTICIPANT_ID_KEY in existing_extra:
        incoming_extra[PARTY1_PARTICIPANT_ID_KEY] = existing_extra.get(PARTY1_PARTICIPANT_ID_KEY)
    incoming_extra.pop(INVENTORY_CATEGORY_KEY, None)

    normalized_extra_data = _validate_extra_data(incoming_extra, act.template)
    if payload.item_serial is None and INVENTORY_CATEGORY_KEY in existing_extra:
        normalized_extra_data[INVENTORY_CATEGORY_KEY] = existing_extra[INVENTORY_CATEGORY_KEY]
    recipients = _extract_recipients(normalized_extra_data, act.party2_name, act.receiver_email)
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нужен хотя бы один получатель"
        )
    normalized_extra_data[RECIPIENTS_KEY] = recipients

    has_device_assignments = db.query(ActDeviceAssignment.id).filter(
        ActDeviceAssignment.act_id == act.id
    ).first() is not None
    if has_device_assignments:
        if payload.item_serial is not None and payload.item_serial != act.item_serial:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Зарезервированное устройство нельзя заменить. Отмените акт и создайте новый",
            )
        if EQUIPMENT_LIST_KEY in existing_extra:
            normalized_extra_data[EQUIPMENT_LIST_KEY] = existing_extra[EQUIPMENT_LIST_KEY]
        if ACCESSORIES_KEY in existing_extra:
            normalized_extra_data[ACCESSORIES_KEY] = existing_extra[ACCESSORIES_KEY]

    if payload.item_name is not None:
        act.item_name = payload.item_name
    if payload.item_serial is not None:
        act.item_serial = payload.item_serial
        inventory_category = _inventory_category_for_serial(db, payload.item_serial)
        if inventory_category:
            normalized_extra_data[INVENTORY_CATEGORY_KEY] = inventory_category

    act.party2_name = _build_party2_summary(recipients)
    act.receiver_email = _get_primary_recipient_email(recipients)
    act.extra_data_json = normalized_extra_data
    act.current_version += 1
    act.updated_at = datetime.utcnow()

    version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=build_act_snapshot(act),
        change_note="Обновлены получатели и список iPad",
        created_by=current_user.id,
    )
    db.add(version)
    db.flush()
    pdf_asset = create_pdf_asset_for_version(
        db,
        act,
        version,
        template_name=act.template.name if act.template else None,
        template_code=act.template.code if act.template else None,
        use_v2=(getattr(act.template, "pdf_version", 2) == 2) if act.template else True,
    )
    record_audit(db, current_user, "ACT", act.id, "ACT_UPDATED", {
        "version": act.current_version,
    })

    db.commit()
    background_tasks.add_task(backup_pdf_by_ids, act.id, version.id, pdf_asset.id)
    db.refresh(act)
    return act

@router.delete("/{act_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_act(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).populate_existing().with_for_update().first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    act_storage_dir = resolve_storage_path(f"acts/{act.id}")
    assignments = db.query(ActDeviceAssignment).filter(
        ActDeviceAssignment.act_id == act.id,
        ActDeviceAssignment.status.in_(["RESERVED", "ISSUED"]),
    ).with_for_update().all()
    for assignment in assignments:
        device = db.query(InventoryDevice).filter(
            InventoryDevice.id == assignment.device_id
        ).with_for_update().first()
        if device:
            device.status = DeviceStatus.AVAILABLE
            device.assigned_to = None

    ipad_assignments = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.act_id == act.id,
        IpadStudentAssignment.status.in_(["RESERVED", "ISSUED", "RETURN_PENDING"]),
    ).with_for_update().all()
    for assignment in ipad_assignments:
        if not assignment.ipad_device_id:
            continue
        device = db.query(IpadDevice).filter(IpadDevice.id == assignment.ipad_device_id).with_for_update().first()
        if device:
            device.status = "AVAILABLE"

    db.query(EmailOutbox).filter(EmailOutbox.act_id == act.id).delete(synchronize_session=False)
    db.query(PdfBackupRecord).filter(PdfBackupRecord.act_id == act.id).delete(synchronize_session=False)
    record_audit(db, current_user, "ACT", act.id, "ACT_PERMANENTLY_DELETED", {
        "status": act.status.value,
        "item_name": act.item_name,
    })
    db.flush()
    db.delete(act)
    db.commit()
    shutil.rmtree(act_storage_dir, ignore_errors=True)
    
    return None

@router.post("/{act_id}/sign/party1", response_model=ActResponse)
async def sign_party1(
    act_id: UUID,
    signature: SignatureRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).populate_existing().with_for_update().first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )

    _validate_party1_signer(act, signature.participant_id)
    _validate_signature(signature.signature_data)
    
    if act.status == ActStatus.SIGNED_PARTY2 and _can_party1_sign_issue(act):
        act.status = ActStatus.COMPLETED
    elif act.status == ActStatus.RETURN_INITIATED:
        act.status = ActStatus.RETURN_SIGNED_PARTY1
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Подпись стороны 1 сейчас недоступна по порядку процесса"
        )
    if act.status == ActStatus.COMPLETED:
        _transition_act_devices(db, act, "ISSUED")
        _transition_act_accessories(db, act, "ISSUED")
        _transition_ipad_assignments(db, act, "ISSUED")
    
    relative_path, mime_type, size_bytes, sha256 = save_data_url_file(
        signature.signature_data,
        relative_dir=f"acts/{act.id}",
        filename_stem=(
            f"return_signature_party1_v{act.current_version}"
            if _is_return_flow(act.status)
            else f"signature_party1_v{act.current_version}"
        )
    )
    db.add(FileAsset(
        act_id=act.id,
        kind=(
            FileAssetKind.RETURN_SIGNATURE_PARTY1
            if _is_return_flow(act.status)
            else FileAssetKind.SIGNATURE_PARTY1
        ),
        storage_path=relative_path,
        mime_type=mime_type,
        size_bytes=size_bytes,
        sha256=sha256,
    ))

    act.current_version += 1
    act.updated_at = datetime.utcnow()

    version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=build_act_snapshot(act),
        change_note=(
            "Подписал передающий: сторона 1"
            if act.status == ActStatus.COMPLETED
            else "Подписал возвращающий: сторона 1"
        ),
        created_by=current_user.id
    )
    db.add(version)
    db.flush()
    pdf_asset = create_pdf_asset_for_version(
        db,
        act,
        version,
        template_name=act.template.name if act.template else None,
        template_code=act.template.code if act.template else None,
        use_v2=(getattr(act.template, "pdf_version", 2) == 2) if act.template else True,
    )
    action = "ISSUE_COMPLETED" if act.status == ActStatus.COMPLETED else "RETURN_MANAGER_SIGNED"
    record_audit(db, current_user, "ACT", act.id, action, {
        "participant_id": str(signature.participant_id) if signature.participant_id else None,
        "version": act.current_version,
    })
    db.commit()
    background_tasks.add_task(backup_pdf_by_ids, act.id, version.id, pdf_asset.id)
    db.refresh(act)

    return act

@router.post("/{act_id}/sign/party2", response_model=ActResponse)
async def sign_party2(
    act_id: UUID,
    signature: SignatureRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).populate_existing().with_for_update().first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    _validate_signature(signature.signature_data)

    signed_recipient_name = None

    if act.status == ActStatus.DRAFT:
        asset_info, signed_recipient_name, _ = _sign_recipient(
            act,
            signature.signature_data,
            participant_id=signature.participant_id,
            return_flow=False,
        )
        issue_recipients = _extract_recipients(act.extra_data_json, act.party2_name, act.receiver_email)
        act.status = ActStatus.SIGNED_PARTY2 if all(recipient.get("signed_at") for recipient in issue_recipients) else ActStatus.DRAFT
    elif act.status == ActStatus.RETURN_SIGNED_PARTY1:
        asset_info, signed_recipient_name, _ = _sign_recipient(
            act,
            signature.signature_data,
            participant_id=signature.participant_id,
            return_flow=True,
        )
        return_recipients = _extract_recipients(act.extra_data_json, act.party2_name, act.receiver_email)
        act.status = ActStatus.RETURNED if all(recipient.get("return_signed_at") for recipient in return_recipients) else ActStatus.RETURN_SIGNED_PARTY1
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Подпись стороны 2 сейчас недоступна по порядку процесса"
        )
    if act.status == ActStatus.RETURNED:
        _transition_act_devices(db, act, "RETURNED")
        _transition_act_accessories(db, act, "RETURNED")
        _transition_ipad_assignments(db, act, "RETURNED")
    db.add(FileAsset(
        act_id=act.id,
        kind=(
            FileAssetKind.RETURN_SIGNATURE_PARTY2
            if _is_return_flow(act.status)
            else FileAssetKind.SIGNATURE_PARTY2
        ),
        storage_path=asset_info["relative_path"],
        mime_type=asset_info["mime_type"],
        size_bytes=asset_info["size_bytes"],
        sha256=asset_info["sha256"],
    ))
    
    act.current_version += 1
    act.updated_at = datetime.utcnow()

    version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=build_act_snapshot(act),
        change_note=(
            f"Подписал получатель: {signed_recipient_name}"
            if signed_recipient_name
            else None
        ),
        created_by=current_user.id
    )
    db.add(version)
    db.flush()
    pdf_asset = create_pdf_asset_for_version(
        db,
        act,
        version,
        template_name=act.template.name if act.template else None,
        template_code=act.template.code if act.template else None,
        use_v2=(getattr(act.template, "pdf_version", 2) == 2) if act.template else True,
    )
    action = "RETURN_COMPLETED" if act.status == ActStatus.RETURNED else "ISSUE_RECIPIENT_SIGNED"
    record_audit(db, current_user, "ACT", act.id, action, {
        "participant_id": str(signature.participant_id) if signature.participant_id else None,
        "recipient": signed_recipient_name,
        "version": act.current_version,
    })
    db.commit()
    background_tasks.add_task(backup_pdf_by_ids, act.id, version.id, pdf_asset.id)
    db.refresh(act)

    return act

@router.get("/{act_id}/versions", response_model=list[ActVersionResponse])
async def get_act_versions(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    versions = db.query(ActVersion).filter(ActVersion.act_id == act_id).order_by(ActVersion.version_number.desc()).all()
    
    return versions


@router.post("/{act_id}/return", response_model=ActResponse)
async def start_return_flow(
    act_id: UUID,
    payload: ReturnStartRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).populate_existing().with_for_update().first()

    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    if act.ipad_profile:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Возврат iPad Advisory оформляется в управлении Advisory",
        )

    if act.status != ActStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Возврат можно начать только после полного завершения акта выдачи"
        )
    if payload.return_date < act.issue_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Дата возврата не может быть раньше даты выдачи",
        )

    act.return_date = payload.return_date
    act.return_note = payload.return_note
    act.status = ActStatus.RETURN_INITIATED
    act.current_version += 1
    act.updated_at = datetime.utcnow()

    version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=build_act_snapshot(act),
        change_note="Инициирован возврат техники",
        created_by=current_user.id,
    )
    db.add(version)
    db.flush()
    pdf_asset = create_pdf_asset_for_version(
        db,
        act,
        version,
        template_name=act.template.name if act.template else None,
        template_code=act.template.code if act.template else None,
        use_v2=(getattr(act.template, "pdf_version", 2) == 2) if act.template else True,
    )
    record_audit(db, current_user, "ACT", act.id, "RETURN_STARTED", {
        "return_date": payload.return_date.isoformat(),
        "version": act.current_version,
    })

    db.commit()
    background_tasks.add_task(backup_pdf_by_ids, act.id, version.id, pdf_asset.id)
    db.refresh(act)
    return act


@router.get("/{act_id}/download/pdf")
async def download_act_pdf(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()

    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )

    pdf_asset = (
        db.query(FileAsset)
        .filter(FileAsset.act_id == act_id, FileAsset.kind == FileAssetKind.PDF)
        .order_by(FileAsset.created_at.desc())
        .first()
    )

    if not pdf_asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not found"
        )

    file_path = resolve_storage_path(pdf_asset.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored PDF file not found"
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"act_{act.id}_v{act.current_version}.pdf",
        content_disposition_type="attachment",
    )


@router.get("/{act_id}/preview/pdf")
async def preview_act_pdf(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()

    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )

    pdf_asset = (
        db.query(FileAsset)
        .filter(FileAsset.act_id == act_id, FileAsset.kind == FileAssetKind.PDF)
        .order_by(FileAsset.created_at.desc())
        .first()
    )

    if not pdf_asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not found"
        )

    file_path = resolve_storage_path(pdf_asset.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored PDF file not found"
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"act_{act.id}_v{act.current_version}.pdf",
        content_disposition_type="inline",
    )


@router.get("/{act_id}/versions/{version_number}/download/pdf")
async def download_act_pdf_by_version(
    act_id: UUID,
    version_number: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()

    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )

    version = (
        db.query(ActVersion)
        .filter(ActVersion.act_id == act_id, ActVersion.version_number == version_number)
        .first()
    )

    if not version or not version.pdf_file_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF for this version not found"
        )

    pdf_asset = db.query(FileAsset).filter(FileAsset.id == version.pdf_file_id).first()
    if not pdf_asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF asset not found"
        )

    file_path = resolve_storage_path(pdf_asset.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored PDF file not found"
        )

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=f"act_{act.id}_v{version_number}.pdf",
        content_disposition_type="attachment",
    )


@router.get("/{act_id}/manual-final-email")
def get_manual_final_email(
    act_id: UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    act = db.query(Act).filter(Act.id == act_id).first()
    if not act:
        raise HTTPException(status_code=404, detail="Акт не найден")
    issue_version, _issue_asset = _final_document(db, act, ISSUE_COMPLETED)
    return_version, _return_asset = _final_document(db, act, RETURN_COMPLETED)
    return {
        "recipients": _manual_email_recipients(db, act),
        "documents": [
            {
                "kind": ISSUE_COMPLETED,
                "label": "Финальный акт выдачи",
                "available": bool(issue_version),
                "version": issue_version.version_number if issue_version else None,
            },
            {
                "kind": RETURN_COMPLETED,
                "label": "Финальный акт возврата",
                "available": bool(return_version),
                "version": return_version.version_number if return_version else None,
            },
        ],
        "history": _manual_email_history(db, act.id),
    }


@router.post("/{act_id}/manual-final-email", status_code=status.HTTP_201_CREATED)
def send_manual_final_email(
    act_id: UUID,
    payload: ManualFinalEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    act = db.query(Act).filter(Act.id == act_id).populate_existing().with_for_update().first()
    if not act:
        raise HTTPException(status_code=404, detail="Акт не найден")
    version, asset = _final_document(db, act, payload.kind)
    if not version or not asset:
        detail = "Финальный PDF выдачи ещё не готов" if payload.kind == ISSUE_COMPLETED else "Финальный PDF возврата ещё не готов"
        raise HTTPException(status_code=409, detail=detail)
    allowed = {item["email"]: item for item in _manual_email_recipients(db, act)}
    requested_emails = [str(email).strip().lower() for email in payload.recipient_emails]
    if len(requested_emails) != len(set(requested_emails)):
        raise HTTPException(status_code=422, detail="Получатель указан несколько раз")
    unknown = [email for email in requested_emails if email not in allowed]
    if unknown:
        raise HTTPException(status_code=422, detail="Можно отправлять акт только его участникам")
    recipients = [allowed[email] for email in requested_emails]
    dispatch_id, queued = enqueue_manual_final_emails(
        db,
        act,
        payload.kind,
        recipients,
        asset.storage_path,
        current_user.id,
        version.version_number,
        payload.custom_message,
    )
    if not queued:
        raise HTTPException(status_code=409, detail="Не удалось поставить письма в очередь")
    if payload.kind == ISSUE_COMPLETED:
        act.issue_completion_email_sent = False
    else:
        act.return_completion_email_sent = False
    record_audit(db, current_user, "ACT", act.id, "MANUAL_FINAL_EMAIL_ENQUEUED", {
        "dispatch_id": str(dispatch_id),
        "kind": payload.kind,
        "version": version.version_number,
        "recipients": requested_emails,
        "queued": queued,
    })
    db.commit()
    return {"dispatch_id": str(dispatch_id), "queued": queued, "message": "Финальный документ поставлен в очередь"}
