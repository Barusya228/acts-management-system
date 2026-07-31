import uuid
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_admin_user, get_current_guest_or_admin_user
from app.db.models import IpadDevice, IpadStudentAssignment, User
from app.schemas.schemas import IpadDeviceBulkCreate, IpadDeviceCreate, IpadDeviceUpdate
from app.services.audit_service import record_audit


router = APIRouter()


def _serialize(device: IpadDevice, assignment: IpadStudentAssignment | None = None) -> dict:
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
    return [_serialize(item) for item in query.order_by(IpadDevice.model, IpadDevice.tag).limit(500).all()]


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
    total = query.count()
    devices = query.order_by(IpadDevice.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    device_ids = [item.id for item in devices]
    assignments = db.query(IpadStudentAssignment).filter(
        IpadStudentAssignment.ipad_device_id.in_(device_ids),
        IpadStudentAssignment.status.in_(["RESERVED", "ISSUED", "RETURN_PENDING"]),
    ).all() if device_ids else []
    assignment_by_device = {item.ipad_device_id: item for item in assignments}
    return {"items": [_serialize(item, assignment_by_device.get(item.id)) for item in devices], "total": total, "page": page, "page_size": page_size}


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
        db.rollback(); raise HTTPException(status_code=409, detail="Tag или Serial Number уже используется")
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
    if len(tags) != len(set(tags)) or len(serials) != len(set(serials)):
        raise HTTPException(status_code=422, detail="Tag или Serial Number повторяется в списке")
    conflicts = db.query(IpadDevice).filter(or_(IpadDevice.tag.in_(tags), IpadDevice.serial_number.in_(serials))).all()
    if conflicts: raise HTTPException(status_code=409, detail="Уже существуют: " + ", ".join(item.tag for item in conflicts))
    created = []
    for tag, serial in rows:
        device = IpadDevice(id=uuid.uuid4(), device_name=name, model=model, tag=tag, serial_number=serial, status=data.status)
        db.add(device); created.append(device)
        record_audit(db, current_user, "IPAD_DEVICE", device.id, "IPAD_DEVICE_CREATED", {"source": "bulk", "tag": tag})
    try: db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(status_code=409, detail="Tag или Serial Number уже используется")
    return {"created": len(created)}


@router.patch("/{device_id}")
def update_ipad(device_id: UUID, data: IpadDeviceUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    device = db.query(IpadDevice).filter(IpadDevice.id == device_id).first()
    if not device: raise HTTPException(status_code=404, detail="iPad не найден")
    active = db.query(IpadStudentAssignment.id).filter(IpadStudentAssignment.ipad_device_id == device.id, IpadStudentAssignment.status.in_(["RESERVED", "ISSUED", "RETURN_PENDING"])).first()
    updates = data.model_dump(exclude_unset=True)
    if active and any(key in updates for key in ("tag", "serial_number", "status")):
        raise HTTPException(status_code=409, detail="Активный iPad управляется через акт")
    for key, value in updates.items(): setattr(device, key, value.strip() if isinstance(value, str) else value)
    record_audit(db, current_user, "IPAD_DEVICE", device.id, "IPAD_DEVICE_UPDATED", {"fields": list(updates)})
    try: db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(status_code=409, detail="Tag или Serial Number уже используется")
    db.refresh(device); return _serialize(device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ipad(device_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    device = db.query(IpadDevice).filter(IpadDevice.id == device_id).first()
    if not device: raise HTTPException(status_code=404, detail="iPad не найден")
    if db.query(IpadStudentAssignment.id).filter(IpadStudentAssignment.ipad_device_id == device.id).first():
        raise HTTPException(status_code=409, detail="iPad имеет историю актов и не может быть удалён")
    record_audit(db, current_user, "IPAD_DEVICE", device.id, "IPAD_DEVICE_DELETED", {"tag": device.tag}); db.flush(); db.delete(device); db.commit()
