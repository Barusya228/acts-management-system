import uuid
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import BigInteger, case, cast, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_admin_user, get_current_guest_or_admin_user
from app.db.models import Act, IpadActAppendix, IpadDevice, IpadStudentAssignment, User
from app.db.states import ACTIVE_IPAD_ASSIGNMENT_STATUSES
from app.schemas.schemas import IpadAvailableResolveRequest, IpadDeviceBulkCreate, IpadDeviceCreate, IpadDeviceUpdate
from app.services.audit_service import record_audit


router = APIRouter()


def _serialize(
    device: IpadDevice,
    assignment: IpadStudentAssignment | None = None,
    duplicate_tag_count: int = 1,
) -> dict:
    return {
        "id": str(device.id),
        "device_name": device.device_name,
        "model": device.model,
        "tag": device.tag,
        "serial_number": device.serial_number,
        "status": device.status,
        "notes": device.notes,
        "student_name": assignment.student_name if assignment else None,
        "act_id": str(assignment.act_id) if assignment else None,
        "created_at": device.created_at.isoformat(),
        "updated_at": device.updated_at.isoformat(),
        "duplicate_tag_count": duplicate_tag_count,
    }


@router.get("/available")
def available_ipads(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_guest_or_admin_user),
):
    query = db.query(IpadDevice).filter(IpadDevice.status == "AVAILABLE")
    if search:
        value = f"%{search}%"
        query = query.filter(
            IpadDevice.tag.ilike(value)
            | IpadDevice.serial_number.ilike(value)
            | IpadDevice.model.ilike(value)
        )
    devices = query.order_by(IpadDevice.model, IpadDevice.tag, IpadDevice.serial_number).limit(500).all()
    tag_counts = dict(db.query(IpadDevice.tag, func.count(IpadDevice.id)).filter(
        IpadDevice.tag.in_([item.tag for item in devices])
    ).group_by(IpadDevice.tag).all()) if devices else {}
    return [_serialize(item, duplicate_tag_count=tag_counts.get(item.tag, 1)) for item in devices]


@router.post("/available/resolve")
def resolve_available_ipads(
    payload: IpadAvailableResolveRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_guest_or_admin_user),
):
    requested = [str(item).strip() for item in payload.serial_numbers]
    if any(not item for item in requested):
        raise HTTPException(status_code=422, detail="Serial Number не может быть пустым")

    normalized = {item.casefold() for item in requested}
    devices = db.query(IpadDevice).filter(
        func.lower(IpadDevice.serial_number).in_(normalized)
    ).order_by(IpadDevice.serial_number).all()
    devices_by_serial = {item.serial_number.casefold(): item for item in devices}

    items = []
    for serial_number in requested:
        device = devices_by_serial.get(serial_number.casefold())
        if device is None:
            items.append({
                "serial_number": serial_number,
                "match_status": "NOT_FOUND",
                "device": None,
            })
            continue
        items.append({
            "serial_number": serial_number,
            "match_status": "AVAILABLE" if device.status == "AVAILABLE" else "UNAVAILABLE",
            "device": _serialize(device),
        })
    return {"items": items}


@router.get("/groups")
def ipad_groups(
    status_value: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    query = db.query(IpadDevice.device_name, IpadDevice.model, func.count(IpadDevice.id))
    if status_value:
        query = query.filter(IpadDevice.status == status_value)
    return [{"device_name": name, "model": model or "", "count": count} for name, model, count in query.group_by(IpadDevice.device_name, IpadDevice.model).order_by(func.count(IpadDevice.id).desc()).all()]


@router.get("")
def list_ipads(
    search: Optional[str] = None,
    status_value: Optional[str] = Query(None, alias="status"),
    model: Optional[str] = None,
    duplicate_tags_only: bool = Query(False),
    tag_order: Literal["asc", "desc"] = Query("asc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    query = db.query(IpadDevice)
    if status_value:
        query = query.filter(IpadDevice.status == status_value)
    if model is not None:
        query = query.filter(IpadDevice.model == model) if model else query.filter(IpadDevice.model.is_(None))
    if search:
        value = f"%{search}%"
        query = query.filter(IpadDevice.device_name.ilike(value) | IpadDevice.model.ilike(value) | IpadDevice.tag.ilike(value) | IpadDevice.serial_number.ilike(value))
    if duplicate_tags_only:
        duplicate_tags = db.query(IpadDevice.tag).group_by(IpadDevice.tag).having(
            func.count(IpadDevice.id) > 1
        )
        query = query.filter(IpadDevice.tag.in_(duplicate_tags))
    total = query.count()
    tag_is_numeric = IpadDevice.tag.op("~")(r"^[0-9]+$")
    numeric_bucket = case((tag_is_numeric, 0), else_=1)
    tag_letters = func.lower(func.regexp_replace(IpadDevice.tag, r"[0-9]+", "", "g"))
    tag_number = cast(
        func.nullif(func.regexp_replace(IpadDevice.tag, r"[^0-9]+", "", "g"), ""),
        BigInteger,
    )
    if tag_order == "desc":
        ordering = (
            numeric_bucket.asc(),
            tag_letters.desc(),
            tag_number.desc().nullslast(),
            func.lower(IpadDevice.tag).desc(),
            IpadDevice.created_at.desc(),
        )
    else:
        ordering = (
            numeric_bucket.asc(),
            tag_letters.asc(),
            tag_number.asc().nullslast(),
            func.lower(IpadDevice.tag).asc(),
            IpadDevice.created_at.desc(),
        )
    devices = query.order_by(*ordering).offset((page - 1) * page_size).limit(page_size).all()
    device_ids = [item.id for item in devices]
    assignments = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.ipad_device_id.in_(device_ids),
        IpadStudentAssignment.status.in_(ACTIVE_IPAD_ASSIGNMENT_STATUSES),
    ).all() if device_ids else []
    assignment_by_device = {item.ipad_device_id: item for item in assignments}
    tag_counts = dict(db.query(IpadDevice.tag, func.count(IpadDevice.id)).filter(
        IpadDevice.tag.in_([item.tag for item in devices])
    ).group_by(IpadDevice.tag).all()) if devices else {}
    return {"items": [_serialize(item, assignment_by_device.get(item.id), tag_counts.get(item.tag, 1)) for item in devices], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_ipad(data: IpadDeviceCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    values = data.model_dump()
    values.update(device_name=data.device_name.strip(), model=data.model.strip() if data.model else None, tag=data.tag.strip(), serial_number=data.serial_number.strip())
    if not values["device_name"] or not values["tag"] or not values["serial_number"]:
        raise HTTPException(status_code=422, detail="Device name, Tag и Serial Number обязательны")
    device = IpadDevice(**values)
    db.add(device)
    db.flush()
    record_audit(db, current_user, "IPAD_DEVICE", device.id, "IPAD_DEVICE_CREATED", {"tag": device.tag})
    try: db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(status_code=409, detail="Serial Number уже используется")
    db.refresh(device)
    return _serialize(device)


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
def bulk_create_ipads(data: IpadDeviceBulkCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    name = data.device_name.strip()
    model = data.model.strip() if data.model else None
    rows = [(item.tag.strip(), item.serial_number.strip()) for item in data.devices]
    if not name or not rows or any(not tag or not serial for tag, serial in rows):
        raise HTTPException(status_code=422, detail="Заполните общие поля, Tag и Serial Number")
    tags = [item[0] for item in rows]; serials = [item[1] for item in rows]
    if len(serials) != len(set(serials)):
        raise HTTPException(status_code=422, detail="Serial Number повторяется в списке")
    conflicts = db.query(IpadDevice).filter(IpadDevice.serial_number.in_(serials)).all()
    if conflicts: raise HTTPException(status_code=409, detail="Serial Number уже существуют: " + ", ".join(item.serial_number for item in conflicts))
    created = []
    for tag, serial in rows:
        device = IpadDevice(id=uuid.uuid4(), device_name=name, model=model, tag=tag, serial_number=serial, status=data.status)
        db.add(device); created.append(device)
        record_audit(db, current_user, "IPAD_DEVICE", device.id, "IPAD_DEVICE_CREATED", {"source": "bulk", "tag": tag})
    try: db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(status_code=409, detail="Serial Number уже используется")
    return {"created": len(created)}


@router.patch("/{device_id}")
def update_ipad(device_id: UUID, data: IpadDeviceUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    device = db.query(IpadDevice).filter(IpadDevice.id == device_id).first()
    if not device: raise HTTPException(status_code=404, detail="iPad не найден")
    active = db.query(IpadStudentAssignment.id).filter(IpadStudentAssignment.ipad_device_id == device.id, IpadStudentAssignment.status.in_(ACTIVE_IPAD_ASSIGNMENT_STATUSES)).first()
    updates = data.model_dump(exclude_unset=True)
    if active and any(key in updates for key in ("tag", "serial_number", "status")):
        raise HTTPException(status_code=409, detail="Активный iPad управляется через акт")
    for key, value in updates.items(): setattr(device, key, value.strip() if isinstance(value, str) else value)
    record_audit(db, current_user, "IPAD_DEVICE", device.id, "IPAD_DEVICE_UPDATED", {"fields": list(updates)})
    try: db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(status_code=409, detail="Serial Number уже используется")
    db.refresh(device); return _serialize(device)


@router.get("/{device_id}/history")
def ipad_history(
    device_id: UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    """Паспорт устройства: все выдачи, повреждения, замены и ремонты iPad."""
    device = db.query(IpadDevice).filter(IpadDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="iPad не найден")

    events: list[dict] = []

    # Выдачи: каждое назначение ученику через акт.
    assignments = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.ipad_device_id == device.id
    ).all()
    act_ids = {item.act_id for item in assignments}
    acts = {act.id: act for act in db.query(Act).filter(Act.id.in_(act_ids)).all()} if act_ids else {}
    for item in assignments:
        act = acts.get(item.act_id)
        events.append({
            "type": "ASSIGNMENT",
            "title": f"Выдан ученику: {item.student_name}",
            "detail": f"Акт ACT-{str(item.act_id).split('-')[0].upper()}" + (f" · {act.item_name}" if act else ""),
            "status": item.status,
            "act_id": str(item.act_id),
            "created_at": item.assigned_at.isoformat(),
        })

    # Приложения: замены (старый/новый), выбытия, поздние возвраты — по payload.
    device_id_str = str(device.id)
    appendices = db.query(IpadActAppendix).filter(IpadActAppendix.status == "APPLIED").all()
    for appendix in appendices:
        payload = appendix.payload_json or {}
        related = device_id_str in {
            str(payload.get("old_device_id")), str(payload.get("new_device_id")), str(payload.get("device_id")),
        }
        if not related and appendix.operation_type == "YEAR_END_RETURN":
            related = any(str(item.get("device_id")) == device_id_str for item in payload.get("items", []) if isinstance(item, dict))
        if not related:
            continue
        titles = {
            "IPAD_REPLACEMENT": "Замена iPad",
            "STUDENT_DEPARTURE": "Выбытие ученика",
            "STUDENT_ADDITION": "Добавление ученика",
            "LATE_RETURN": "Поздний возврат",
            "YEAR_END_RETURN": "Годовой возврат",
        }
        role = ""
        if appendix.operation_type == "IPAD_REPLACEMENT":
            role = " (заменён)" if str(payload.get("old_device_id")) == device_id_str else " (выдан взамен)"
        condition = payload.get("reason_label") or payload.get("return_condition_label") or payload.get("condition_label")
        events.append({
            "type": "APPENDIX",
            "title": titles.get(appendix.operation_type, appendix.operation_type) + role,
            "detail": (payload.get("student_name") or "") + (f" · {condition}" if condition else ""),
            "status": appendix.operation_type,
            "act_id": str(appendix.act_id),
            "created_at": (appendix.applied_at or appendix.created_at).isoformat(),
        })

    events.sort(key=lambda item: item["created_at"], reverse=True)
    return {
        "device": _serialize(device),
        "events": events,
    }


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ipad(device_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    device = db.query(IpadDevice).filter(IpadDevice.id == device_id).first()
    if not device: raise HTTPException(status_code=404, detail="iPad не найден")
    if db.query(IpadStudentAssignment.id).filter(IpadStudentAssignment.ipad_device_id == device.id).first():
        raise HTTPException(status_code=409, detail="iPad имеет историю актов и не может быть удалён")
    record_audit(db, current_user, "IPAD_DEVICE", device.id, "IPAD_DEVICE_DELETED", {"tag": device.tag}); db.flush(); db.delete(device); db.commit()
