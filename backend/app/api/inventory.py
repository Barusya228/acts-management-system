from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from app.core.database import get_db
from app.core.deps import get_current_admin_user, get_current_guest_or_admin_user
from app.db.models import InventoryDevice, User
from app.schemas.schemas import (
    InventoryDeviceCreate,
    InventoryDeviceUpdate,
    InventoryDeviceResponse,
    InventoryListResponse,
)

router = APIRouter()


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
        }
        for d in devices
    ]


@router.get("", response_model=InventoryListResponse)
def list_devices(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    query = db.query(InventoryDevice)

    if category:
        query = query.filter(InventoryDevice.category == category)
    if status:
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

    total = query.count()
    devices = query.order_by(InventoryDevice.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {"items": devices, "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=InventoryDeviceResponse, status_code=status.HTTP_201_CREATED)
def create_device(
    data: InventoryDeviceCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    device = InventoryDevice(**data.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.patch("/{device_id}", response_model=InventoryDeviceResponse)
def update_device(
    device_id: UUID,
    data: InventoryDeviceUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    device = db.query(InventoryDevice).filter(InventoryDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Устройство не найдено")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(device, field, value)

    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    device = db.query(InventoryDevice).filter(InventoryDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Устройство не найдено")

    db.delete(device)
    db.commit()
