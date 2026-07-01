from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_admin_user, get_current_guest_or_admin_user
from app.db.models import Act, ActVersion, Template, User, ActStatus, FileAsset, FileAssetKind, InventoryDevice
from app.schemas.schemas import ActCreate, ActUpdate, ActResponse, ActListResponse, SignatureRequest, ActVersionResponse, ReturnStartRequest
from app.services.pdf_service import build_act_snapshot, create_pdf_asset_for_version
from app.services.email_service import (
    send_act_completed_email,
    send_act_created_email,
    send_return_completed_email,
)
from app.utils.storage import resolve_storage_path, save_data_url_file

router = APIRouter()


def _update_device_status(db: Session, serial_number: str, status: str, assigned_to: str | None = None):
    """Update inventory device status and assigned_to by serial number."""
    device = db.query(InventoryDevice).filter(InventoryDevice.serial_number == serial_number).first()
    if device:
        device.status = status
        if assigned_to is not None:
            device.assigned_to = assigned_to
        db.commit()


RESERVED_ACT_FIELDS = {
    "party1_name",
    "party2_name",
    "issue_date",
    "item_name",
    "item_serial",
    "receiver_email",
}

EQUIPMENT_LIST_KEY = "equipment_list"
RECIPIENTS_KEY = "recipients"
IPAD_ADVISORY_KEY = "advisory_note"


def _normalize_recipients(recipients: object) -> list[dict]:
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
            "signed_at": item.get("signed_at") if isinstance(item.get("signed_at"), str) else None,
            "signature_file_path": item.get("signature_file_path") if isinstance(item.get("signature_file_path"), str) else None,
            "return_signed_at": item.get("return_signed_at") if isinstance(item.get("return_signed_at"), str) else None,
            "return_signature_file_path": item.get("return_signature_file_path") if isinstance(item.get("return_signature_file_path"), str) else None,
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

    unknown_keys = [key for key in payload.keys() if key not in allowed_dynamic and key not in {EQUIPMENT_LIST_KEY, RECIPIENTS_KEY}]
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
            if not name and not serial and not imei:
                continue
            normalized_equipment.append({"name": name, "serial": serial, "imei": imei})

        payload[EQUIPMENT_LIST_KEY] = normalized_equipment

    recipients = payload.get(RECIPIENTS_KEY)
    if recipients is not None:
        payload[RECIPIENTS_KEY] = _normalize_recipients(recipients)

    for field_name in required_dynamic:
        value = payload.get(field_name)
        if value is None or (isinstance(value, str) and not value.strip()):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле '{field_name}' обязательно по шаблону"
            )

    for key, value in payload.items():
        if key in {EQUIPMENT_LIST_KEY, RECIPIENTS_KEY}:
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
    if RECIPIENTS_KEY in payload:
        normalized[RECIPIENTS_KEY] = payload[RECIPIENTS_KEY]
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


def _sign_recipient(act: Act, signature_data: str, return_flow: bool = False) -> tuple[dict, str, int]:
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
    acts = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "items": acts,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.post("", response_model=ActResponse, status_code=status.HTTP_201_CREATED)
async def create_act(
    act_data: ActCreate,
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
    
    normalized_extra_data = _validate_extra_data(act_data.extra_data_json, template)
    recipients = _extract_recipients(normalized_extra_data, act_data.party2_name, act_data.receiver_email)
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нужен хотя бы один получатель"
        )
    normalized_extra_data[RECIPIENTS_KEY] = recipients

    act_payload = act_data.model_dump()
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
    db.commit()
    db.refresh(act)
    
    # Create initial version
    version = ActVersion(
        act_id=act.id,
        version_number=1,
        data_json=build_act_snapshot(act),
        created_by=current_user.id
    )
    db.add(version)
    db.flush()
    create_pdf_asset_for_version(
        db,
        act,
        version,
        template_name=template.name,
        template_code=template.code,
        use_v2=(getattr(template, "pdf_version", 2) == 2),
    )
    db.commit()
    
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()

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

    incoming_extra = payload.extra_data_json or {}
    if not isinstance(incoming_extra, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Дополнительные поля должны быть объектом (JSON)"
        )

    existing_extra = dict(act.extra_data_json or {})
    if IPAD_ADVISORY_KEY in existing_extra:
        incoming_extra[IPAD_ADVISORY_KEY] = existing_extra.get(IPAD_ADVISORY_KEY)

    normalized_extra_data = _validate_extra_data(incoming_extra, act.template)
    recipients = _extract_recipients(normalized_extra_data, act.party2_name, act.receiver_email)
    if not recipients:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Нужен хотя бы один получатель"
        )
    normalized_extra_data[RECIPIENTS_KEY] = recipients

    if payload.item_name is not None:
        act.item_name = payload.item_name
    if payload.item_serial is not None:
        act.item_serial = payload.item_serial

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
    create_pdf_asset_for_version(
        db,
        act,
        version,
        template_name=act.template.name if act.template else None,
        template_code=act.template.code if act.template else None,
        use_v2=(getattr(act.template, "pdf_version", 2) == 2) if act.template else True,
    )

    db.commit()
    db.refresh(act)
    return act

@router.delete("/{act_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_act(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    db.delete(act)
    db.commit()
    
    return None

@router.post("/{act_id}/sign/party1", response_model=ActResponse)
async def sign_party1(
    act_id: UUID,
    signature: SignatureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    if act.status == ActStatus.SIGNED_PARTY2 and _can_party1_sign_issue(act):
        act.status = ActStatus.COMPLETED
    elif act.status == ActStatus.RETURN_INITIATED:
        act.status = ActStatus.RETURN_SIGNED_PARTY1
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Подпись стороны 1 сейчас недоступна по порядку процесса"
        )
    
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
    
    db.commit()
    db.refresh(act)

    if (
        act.status == ActStatus.COMPLETED
        and not act.issue_completion_email_sent
        and pdf_asset.storage_path
    ):
        try:
            email_sent = await send_act_completed_email(
                act,
                pdf_path=resolve_storage_path(pdf_asset.storage_path),
            )
            if email_sent:
                act.issue_completion_email_sent = True
                db.commit()
                db.refresh(act)
        except Exception:
            pass

    # Inventory: mark device as issued when act is completed
    if act.status == ActStatus.COMPLETED and act.item_serial:
        _update_device_status(db, act.item_serial, "issued", act.party2_name)

    return act

@router.post("/{act_id}/sign/party2", response_model=ActResponse)
async def sign_party2(
    act_id: UUID,
    signature: SignatureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    signed_recipient_name = None

    if act.status == ActStatus.DRAFT:
        asset_info, signed_recipient_name, _ = _sign_recipient(act, signature.signature_data, return_flow=False)
        issue_recipients = _extract_recipients(act.extra_data_json, act.party2_name, act.receiver_email)
        act.status = ActStatus.SIGNED_PARTY2 if all(recipient.get("signed_at") for recipient in issue_recipients) else ActStatus.DRAFT
    elif act.status == ActStatus.RETURN_SIGNED_PARTY1:
        asset_info, signed_recipient_name, _ = _sign_recipient(act, signature.signature_data, return_flow=True)
        return_recipients = _extract_recipients(act.extra_data_json, act.party2_name, act.receiver_email)
        act.status = ActStatus.RETURNED if all(recipient.get("return_signed_at") for recipient in return_recipients) else ActStatus.RETURN_SIGNED_PARTY1
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Подпись стороны 2 сейчас недоступна по порядку процесса"
        )
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
    
    db.commit()
    db.refresh(act)

    if (
        act.status == ActStatus.RETURNED
        and not act.return_completion_email_sent
        and pdf_asset.storage_path
    ):
        try:
            email_sent = await send_return_completed_email(
                act,
                pdf_path=resolve_storage_path(pdf_asset.storage_path),
            )
            if email_sent:
                act.return_completion_email_sent = True
                db.commit()
                db.refresh(act)
        except Exception:
            # Email delivery should not break signing flow.
            pass

    # Inventory: mark device back to available when returned
    if act.status == ActStatus.RETURNED and act.item_serial:
        _update_device_status(db, act.item_serial, "available")

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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()

    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )

    if act.status != ActStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Возврат можно начать только после полного завершения акта выдачи"
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
    create_pdf_asset_for_version(
        db,
        act,
        version,
        template_name=act.template.name if act.template else None,
        template_code=act.template.code if act.template else None,
        use_v2=(getattr(act.template, "pdf_version", 2) == 2) if act.template else True,
    )

    db.commit()
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


@router.post("/{act_id}/send-notification")
async def send_act_notification(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Отправляет email уведомление получателям о созданном акте.
    """
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    try:
        await send_act_created_email(act)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Не удалось отправить уведомление: {str(exc)}"
        )
    
    return {"message": "Уведомление отправлено получателям"}
