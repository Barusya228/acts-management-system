from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_admin_user
from app.db.models import Act, ActStatus, User
from app.schemas.schemas import ActResponse
from app.services.audit_service import record_audit
from app.services.email_outbox_service import REMINDER, enqueue_act_emails

router = APIRouter()


def _get_pending_recipients(act: Act) -> list[dict]:
    """
    Возвращает список получателей, которые еще не подписали акт.
    """
    extra_data = act.extra_data_json or {}
    recipients = extra_data.get("recipients") if isinstance(extra_data, dict) else None
    
    if not isinstance(recipients, list) or not recipients:
        # Fallback для старых актов
        return [{
            "full_name": act.party2_name,
            "email": act.receiver_email,
            "signed_at": None,
        }]
    
    pending = []
    for recipient in recipients:
        if not isinstance(recipient, dict):
            continue
        
        signed_at = recipient.get("signed_at")
        if not signed_at:
            pending.append({
                "full_name": str(recipient.get("full_name", "")).strip(),
                "email": str(recipient.get("email", "")).strip(),
                "signed_at": None,
            })
    
    return pending


@router.get("/pending-acts", response_model=list[ActResponse])
async def get_pending_acts(
    days_threshold: int = 3,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Возвращает акты, которые висят без подписи больше указанного количества дней.
    По умолчанию 3 дня.
    """
    threshold_date = datetime.utcnow() - timedelta(days=days_threshold)
    
    # Акты в статусе DRAFT или SIGNED_PARTY2, созданные раньше threshold_date
    acts = db.query(Act).filter(
        Act.status.in_([ActStatus.DRAFT, ActStatus.SIGNED_PARTY2]),
        Act.created_at < threshold_date
    ).order_by(Act.created_at.asc()).all()
    
    return acts


@router.post("/send-reminder/{act_id}")
async def send_reminder(
    act_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Отправляет напоминание получателям, которые еще не подписали акт.
    """
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Акт не найден"
        )
    
    if act.status not in [ActStatus.DRAFT, ActStatus.SIGNED_PARTY2]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Акт уже завершен или не требует подписи"
        )
    
    pending_recipients = _get_pending_recipients(act)
    
    if not pending_recipients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нет получателей, ожидающих подписи"
        )
    
    queued = enqueue_act_emails(
        db,
        act,
        REMINDER,
        pending_only=True,
        dedupe_suffix=datetime.utcnow().strftime("%Y-%m-%d"),
    )
    record_audit(db, current_user, "ACT", act.id, "EMAIL_ENQUEUED", {
        "kind": REMINDER,
        "queued": queued,
    })
    db.commit()
    return {
        "message": f"Напоминание поставлено в очередь для {queued} получателей",
        "recipients_count": queued,
    }
