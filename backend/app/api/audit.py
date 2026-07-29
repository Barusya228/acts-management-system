from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_admin_user
from app.db.models import AuditLog, User


router = APIRouter()


@router.get("")
def list_audit_log(
    entity_type: Optional[str] = None,
    entity_id: Optional[UUID] = None,
    action: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    query = db.query(AuditLog)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)

    total = query.count()
    items = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    users = db.query(User).filter(User.id.in_({item.user_id for item in items if item.user_id})).all()
    users_by_id = {user.id: user for user in users}
    return {
        "items": [
            {
                "id": str(item.id),
                "user_id": str(item.user_id) if item.user_id else None,
                "actor": users_by_id[item.user_id].full_name if item.user_id in users_by_id else None,
                "entity_type": item.entity_type,
                "entity_id": str(item.entity_id),
                "action": item.action,
                "metadata": item.metadata_json or {},
                "created_at": item.created_at.isoformat(),
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
