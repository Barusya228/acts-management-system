import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from app.core.database import get_db
from app.core.deps import get_current_admin_user, get_current_guest_or_admin_user
from app.services.audit_service import record_audit
from app.db.models import ActDeviceAssignment, InventoryCategory, InventoryDevice, User
from app.schemas.schemas import (
    InventoryCategoryCreate,
    InventoryCategoryResponse,
    InventoryCategoryUpdate,
    InventoryBulkCreate,
    InventoryDeviceCreate,
    InventoryDeviceUpdate,
    InventoryDeviceResponse,
    InventoryListResponse,
)

router = APIRouter()


CYRILLIC_TRANSLITERATION = str.maketrans({
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
})


def _category_code(value: str) -> str:
    transliterated = value.strip().lower().translate(CYRILLIC_TRANSLITERATION)
    return re.sub(r"[^a-z0-9]+", "-", transliterated).strip("-")


def _require_active_category(db: Session, code: str) -> InventoryCategory:
    category = db.query(InventoryCategory).filter(
        InventoryCategory.code == code,
        InventoryCategory.is_active.is_(True),
    ).first()
    if not category:
        raise HTTPException(status_code=422, detail="Выберите активную категорию инвентаря")
    return category


@router.get("/categories", response_model=list[InventoryCategoryResponse])
def list_categories(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    query = db.query(InventoryCategory)
    if not include_inactive:
        query = query.filter(InventoryCategory.is_active.is_(True))
    return query.order_by(InventoryCategory.name.asc()).all()


@router.post("/categories", response_model=InventoryCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    data: InventoryCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    name = data.name.strip()
    code = _category_code(data.code or name)
    if not name or not code:
        raise HTTPException(status_code=422, detail="Укажите название и корректный код категории")
    if db.query(InventoryCategory).filter(InventoryCategory.code == code).first():
        raise HTTPException(status_code=409, detail="Категория с таким кодом уже существует")

    category = InventoryCategory(
        name=name,
        code=code,
        icon=data.icon.strip() or "📦",
        is_active=True,
        is_system=False,
    )
    db.add(category)
    db.flush()
    record_audit(db, current_user, "INVENTORY_CATEGORY", category.id, "CATEGORY_CREATED", {
        "code": category.code,
    })
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Категория с таким кодом уже существует")
    db.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=InventoryCategoryResponse)
def update_category(
    category_id: UUID,
    data: InventoryCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    category = db.query(InventoryCategory).filter(InventoryCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    updates = data.model_dump(exclude_unset=True)
    if "name" in updates:
        if updates["name"] is None:
            raise HTTPException(status_code=422, detail="Название категории не может быть пустым")
        updates["name"] = updates["name"].strip()
        if not updates["name"]:
            raise HTTPException(status_code=422, detail="Название категории не может быть пустым")
    if "icon" in updates:
        if updates["icon"] is None:
            raise HTTPException(status_code=422, detail="Значок категории не может быть пустым")
        updates["icon"] = updates["icon"].strip() or "📦"
    if "is_active" in updates and updates["is_active"] is None:
        raise HTTPException(status_code=422, detail="Статус категории не может быть пустым")
    for field, value in updates.items():
        setattr(category, field, value)
    record_audit(db, current_user, "INVENTORY_CATEGORY", category.id, "CATEGORY_UPDATED", {
        "fields": list(updates.keys()),
    })
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: UUID,
    replacement_code: str = Query("other"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    category = db.query(InventoryCategory).filter(InventoryCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    if category.is_system:
        raise HTTPException(status_code=409, detail="Системную категорию удалить нельзя")

    devices_count = db.query(InventoryDevice).filter(
        InventoryDevice.category == category.code
    ).count()
    if devices_count:
        if replacement_code == category.code:
            raise HTTPException(status_code=422, detail="Категория замены должна отличаться от удаляемой")
        replacement = _require_active_category(db, replacement_code)
        db.query(InventoryDevice).filter(
            InventoryDevice.category == category.code
        ).update({InventoryDevice.category: replacement.code}, synchronize_session=False)

    record_audit(db, current_user, "INVENTORY_CATEGORY", category.id, "CATEGORY_DELETED", {
        "code": category.code,
        "reassigned_devices": devices_count,
    })
    db.flush()
    db.delete(category)
    db.commit()
    return None


@router.get("/available")
def list_available_devices(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_guest_or_admin_user),
):
    """Public: list available devices for act creation picker."""
    devices = (
        db.query(InventoryDevice)
        .filter(InventoryDevice.status == "available")
        .order_by(InventoryDevice.category, InventoryDevice.name)
        .all()
    )
    return [
        {
            "id": str(d.id),
            "name": d.name,
            "model": d.model or "",
            "serial_number": d.serial_number,
            "category": d.category,
            "inventory_number": d.inventory_number,
            "barcode": d.barcode or "",
        }
        for d in devices
    ]


@router.get("/groups")
def list_device_groups(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    query = db.query(
        InventoryDevice.name,
        InventoryDevice.model,
        func.count(InventoryDevice.id).label("count"),
    )
    if category:
        query = query.filter(InventoryDevice.category == category)
    if status == "assigned":
        query = query.filter(InventoryDevice.status.in_(["reserved", "issued"]))
    elif status:
        query = query.filter(InventoryDevice.status == status)
    if search:
        value = f"%{search}%"
        query = query.filter(
            InventoryDevice.name.ilike(value)
            | InventoryDevice.model.ilike(value)
            | InventoryDevice.inventory_number.ilike(value)
            | InventoryDevice.barcode.ilike(value)
        )
    rows = query.group_by(InventoryDevice.name, InventoryDevice.model).order_by(
        func.count(InventoryDevice.id).desc(),
        InventoryDevice.name.asc(),
        InventoryDevice.model.asc(),
    ).all()
    return [
        {"name": name, "model": model or "", "count": count}
        for name, model, count in rows
    ]


@router.get("", response_model=InventoryListResponse)
def list_devices(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    name: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    query = db.query(InventoryDevice)

    if category:
        query = query.filter(InventoryDevice.category == category)
    if status == "assigned":
        query = query.filter(InventoryDevice.status.in_(["reserved", "issued"]))
    elif status:
        query = query.filter(InventoryDevice.status == status)
    if search:
        s = f"%{search}%"
        query = query.filter(
            InventoryDevice.name.ilike(s)
            | InventoryDevice.model.ilike(s)
            | InventoryDevice.serial_number.ilike(s)
            | InventoryDevice.inventory_number.ilike(s)
            | InventoryDevice.assigned_to.ilike(s)
        )
    if name:
        query = query.filter(InventoryDevice.name == name)
    if model is not None:
        if model:
            query = query.filter(InventoryDevice.model == model)
        else:
            query = query.filter(InventoryDevice.model.is_(None))

    total = query.count()
    devices = query.order_by(InventoryDevice.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {"items": devices, "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=InventoryDeviceResponse, status_code=status.HTTP_201_CREATED)
def create_device(
    data: InventoryDeviceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    _require_active_category(db, data.category)
    if data.status in {"reserved", "issued"}:
        raise HTTPException(status_code=422, detail="Статус выдачи меняется только через акт")
    if not data.inventory_number.strip() or not data.barcode.strip() or not data.name.strip() or not data.serial_number.strip():
        raise HTTPException(status_code=422, detail="Инвентарный номер, штрихкод и название обязательны")
    device = InventoryDevice(**data.model_dump())
    db.add(device)
    db.flush()
    record_audit(db, current_user, "INVENTORY_DEVICE", device.id, "DEVICE_CREATED", {
        "serial_number": device.serial_number,
    })
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Инвентарный номер, штрихкод или серийный номер уже используется")
    db.refresh(device)
    return device


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
def create_devices_bulk(
    data: InventoryBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    _require_active_category(db, data.category)
    name = data.name.strip()
    model = data.model.strip() if data.model else None
    if not name:
        raise HTTPException(status_code=422, detail="Название устройства обязательно")
    if not data.devices:
        raise HTTPException(status_code=422, detail="Добавьте хотя бы одно устройство")

    rows = []
    inventory_numbers = set()
    barcodes = set()
    for index, item in enumerate(data.devices):
        inventory_number = item.inventory_number.strip()
        barcode = item.barcode.strip()
        if not inventory_number or not barcode:
            raise HTTPException(
                status_code=422,
                detail=f"Строка #{index + 1}: инвентарный номер и штрихкод обязательны",
            )
        if inventory_number in inventory_numbers or barcode in barcodes:
            raise HTTPException(
                status_code=422,
                detail=f"Строка #{index + 1}: инвентарный номер или штрихкод повторяется в списке",
            )
        inventory_numbers.add(inventory_number)
        barcodes.add(barcode)
        rows.append((inventory_number, barcode))

    conflicts = db.query(InventoryDevice).filter(
        (InventoryDevice.inventory_number.in_(inventory_numbers))
        | (InventoryDevice.serial_number.in_(inventory_numbers))
        | (InventoryDevice.barcode.in_(barcodes))
    ).all()
    if conflicts:
        identifiers = ", ".join(
            f"{device.inventory_number}/{device.barcode or 'без ШК'}"
            for device in conflicts
        )
        raise HTTPException(status_code=409, detail=f"Устройства уже существуют: {identifiers}")

    created = []
    for inventory_number, barcode in rows:
        device = InventoryDevice(
            id=uuid.uuid4(),
            inventory_number=inventory_number,
            barcode=barcode,
            serial_number=inventory_number,
            name=name,
            model=model,
            category=data.category,
            status=data.status,
        )
        db.add(device)
        record_audit(db, current_user, "INVENTORY_DEVICE", device.id, "DEVICE_CREATED", {
            "source": "bulk",
            "inventory_number": inventory_number,
        })
        created.append(device)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Инвентарный номер или штрихкод уже используется")
    return {
        "created": len(created),
        "device_ids": [str(device.id) for device in created],
    }


@router.patch("/{device_id}", response_model=InventoryDeviceResponse)
def update_device(
    device_id: UUID,
    data: InventoryDeviceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    device = db.query(InventoryDevice).filter(InventoryDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Устройство не найдено")

    updates = data.model_dump(exclude_unset=True)
    if "inventory_number" in updates and updates["inventory_number"]:
        # New acts use the inventory number as the visible equipment identifier.
        updates["serial_number"] = updates["inventory_number"].strip()
    if "category" in updates and updates["category"] is None:
        raise HTTPException(status_code=422, detail="Категория не может быть пустой")
    if "status" in updates and updates["status"] is None:
        raise HTTPException(status_code=422, detail="Статус не может быть пустым")
    if "status" in updates and updates["status"] != device.status:
        active_assignment = db.query(ActDeviceAssignment.id).filter(
            ActDeviceAssignment.device_id == device.id,
            ActDeviceAssignment.status.in_(["RESERVED", "ISSUED"]),
        ).first()
        if active_assignment:
            raise HTTPException(status_code=409, detail="Статус устройства управляется активным актом")
        if updates["status"] in {"reserved", "issued"}:
            raise HTTPException(status_code=422, detail="Статус выдачи меняется только через акт")
    for required_field in ("inventory_number", "name", "serial_number"):
        if required_field in updates and (
            updates[required_field] is None or not updates[required_field].strip()
        ):
            raise HTTPException(status_code=422, detail="Обязательные поля устройства не могут быть пустыми")
    if "barcode" in updates and (updates["barcode"] is None or not updates["barcode"].strip()):
        raise HTTPException(status_code=422, detail="Штрихкод не может быть пустым")
    if "category" in updates and updates["category"] != device.category:
        _require_active_category(db, updates["category"])
    for field, value in updates.items():
        setattr(device, field, value)
    record_audit(db, current_user, "INVENTORY_DEVICE", device.id, "DEVICE_UPDATED", {
        "fields": list(updates.keys()),
    })

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Инвентарный номер, штрихкод или серийный номер уже используется")
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    device = db.query(InventoryDevice).filter(InventoryDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Устройство не найдено")

    record_audit(db, current_user, "INVENTORY_DEVICE", device.id, "DEVICE_DELETED", {
        "serial_number": device.serial_number,
    })
    db.flush()
    db.delete(device)
    db.commit()
