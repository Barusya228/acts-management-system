from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, timedelta
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_admin_user
from app.db.models import Act, ActStatus, User

router = APIRouter()


@router.get("/overview")
async def get_analytics_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Возвращает общую статистику по актам.
    """
    total_acts = db.query(Act).count()
    
    # Акты на подписи
    pending_signature = db.query(Act).filter(
        Act.status.in_([ActStatus.DRAFT, ActStatus.SIGNED_PARTY2])
    ).count()
    
    # Завершенные акты
    completed_acts = db.query(Act).filter(
        Act.status == ActStatus.COMPLETED
    ).count()
    
    # Акты с возвратом
    returned_acts = db.query(Act).filter(
        Act.status == ActStatus.RETURNED
    ).count()
    
    # Акты без возврата (выдана техника на руках)
    active_equipment = db.query(Act).filter(
        Act.status == ActStatus.COMPLETED
    ).count()
    
    return {
        "total_acts": total_acts,
        "pending_signature": pending_signature,
        "completed_acts": completed_acts,
        "returned_acts": returned_acts,
        "active_equipment": active_equipment,
    }


@router.get("/monthly-stats")
async def get_monthly_stats(
    months: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Возвращает статистику выдачи и возврата по месяцам.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=months * 30)
    
    # Выдача по месяцам
    issue_stats = db.query(
        extract('year', Act.issue_date).label('year'),
        extract('month', Act.issue_date).label('month'),
        func.count(Act.id).label('count')
    ).filter(
        Act.issue_date >= cutoff_date.date()
    ).group_by('year', 'month').order_by('year', 'month').all()
    
    # Возврат по месяцам
    return_stats = db.query(
        extract('year', Act.return_date).label('year'),
        extract('month', Act.return_date).label('month'),
        func.count(Act.id).label('count')
    ).filter(
        Act.return_date.isnot(None),
        Act.return_date >= cutoff_date.date()
    ).group_by('year', 'month').order_by('year', 'month').all()
    
    # Форматируем результаты
    issue_by_month = [
        {
            "year": int(row.year),
            "month": int(row.month),
            "count": row.count,
            "label": f"{int(row.year)}-{int(row.month):02d}"
        }
        for row in issue_stats
    ]
    
    return_by_month = [
        {
            "year": int(row.year),
            "month": int(row.month),
            "count": row.count,
            "label": f"{int(row.year)}-{int(row.month):02d}"
        }
        for row in return_stats
    ]
    
    return {
        "issue_by_month": issue_by_month,
        "return_by_month": return_by_month,
    }


@router.get("/top-recipients")
async def get_top_recipients(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Возвращает топ получателей по количеству выданной техники.
    """
    # Получаем все акты
    acts = db.query(Act).all()
    
    # Подсчитываем количество актов на каждого получателя
    recipient_counts = {}
    
    for act in acts:
        extra_data = act.extra_data_json or {}
        recipients = extra_data.get("recipients") if isinstance(extra_data, dict) else None
        
        if isinstance(recipients, list) and recipients:
            for recipient in recipients:
                if not isinstance(recipient, dict):
                    continue
                full_name = str(recipient.get("full_name", "")).strip()
                email = str(recipient.get("email", "")).strip()
                
                if not full_name:
                    continue
                
                key = (full_name, email)
                if key not in recipient_counts:
                    recipient_counts[key] = {
                        "full_name": full_name,
                        "email": email,
                        "total_acts": 0,
                        "active_acts": 0,
                        "returned_acts": 0,
                    }
                
                recipient_counts[key]["total_acts"] += 1
                
                if act.status == ActStatus.COMPLETED:
                    recipient_counts[key]["active_acts"] += 1
                elif act.status == ActStatus.RETURNED:
                    recipient_counts[key]["returned_acts"] += 1
        else:
            # Fallback для старых актов
            full_name = act.party2_name
            email = act.receiver_email
            
            if not full_name:
                continue
            
            key = (full_name, email)
            if key not in recipient_counts:
                recipient_counts[key] = {
                    "full_name": full_name,
                    "email": email,
                    "total_acts": 0,
                    "active_acts": 0,
                    "returned_acts": 0,
                }
            
            recipient_counts[key]["total_acts"] += 1
            
            if act.status == ActStatus.COMPLETED:
                recipient_counts[key]["active_acts"] += 1
            elif act.status == ActStatus.RETURNED:
                recipient_counts[key]["returned_acts"] += 1
    
    # Сортируем по количеству актов
    top_recipients = sorted(
        recipient_counts.values(),
        key=lambda x: x["total_acts"],
        reverse=True
    )[:limit]
    
    return {
        "top_recipients": top_recipients
    }


@router.get("/status-distribution")
async def get_status_distribution(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Возвращает распределение актов по статусам.
    """
    status_counts = db.query(
        Act.status,
        func.count(Act.id).label('count')
    ).group_by(Act.status).all()
    
    status_labels = {
        ActStatus.DRAFT: "Черновик",
        ActStatus.SIGNED_PARTY1: "Подписано стороной 1",
        ActStatus.SIGNED_PARTY2: "Подписано стороной 2",
        ActStatus.COMPLETED: "Завершено",
        ActStatus.RETURN_INITIATED: "Возврат инициирован",
        ActStatus.RETURN_SIGNED_PARTY1: "Возврат подписан стороной 1",
        ActStatus.RETURN_SIGNED_PARTY2: "Возврат подписан стороной 2",
        ActStatus.RETURNED: "Возвращено",
    }
    
    distribution = [
        {
            "status": row.status.value if hasattr(row.status, 'value') else str(row.status),
            "label": status_labels.get(row.status, str(row.status)),
            "count": row.count
        }
        for row in status_counts
    ]
    
    return {
        "distribution": distribution
    }
