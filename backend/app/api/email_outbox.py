from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_admin_user
from app.db.models import EmailOutbox, User


router = APIRouter()


@router.get("")
def list_outbox(
    status: Optional[str] = None,
    act_id: Optional[UUID] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    query = db.query(EmailOutbox)
    if status:
        query = query.filter(EmailOutbox.status == status)
    if act_id:
        query = query.filter(EmailOutbox.act_id == act_id)
    total = query.count()
    items = query.order_by(EmailOutbox.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/{outbox_id}/retry")
def retry_email(
    outbox_id: UUID,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    row = db.query(EmailOutbox).filter(EmailOutbox.id == outbox_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Email не найден")
    if row.status not in {"DEAD", "PENDING"}:
        raise HTTPException(status_code=409, detail="Этот email нельзя поставить в очередь повторно")
    from datetime import datetime
    row.status = "PENDING"
    row.attempts = 0
    row.next_attempt_at = datetime.utcnow()
    row.last_error = None
    db.commit()
    return {"status": "queued"}
