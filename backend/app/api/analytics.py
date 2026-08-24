import csv
from io import StringIO

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import String, cast, extract, func
from datetime import datetime, timedelta
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_admin_user
from app.db.models import Act, ActStatus, AuditLog, EmailOutbox, InventoryDevice, IpadDevice, User
from app.services.recipients import act_recipients

router = APIRouter()

_ACT_STATUS_RU = {
    "DRAFT": "Черновик",
    "SIGNED_PARTY1": "На подписи",
    "SIGNED_PARTY2": "На подписи",
    "COMPLETED": "Завершено",
    "RETURN_INITIATED": "Возврат начат",
    "RETURN_SIGNED_PARTY1": "Возврат: подписал IT",
    "RETURN_SIGNED_PARTY2": "Возврат: подписал получатель",
    "RETURNED": "Возвращено",
}


def _csv_response(filename: str, header: list[str], rows: list[list]) -> StreamingResponse:
    """CSV с BOM — чтобы Excel корректно открывал кириллицу."""
    buffer = StringIO()
    buffer.write("\ufeff")
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(header)
    writer.writerows(rows)
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/acts.csv")
async def export_acts_csv(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    acts = db.query(Act).options(selectinload(Act.template)).order_by(Act.created_at.desc()).all()
    rows = [[
        f"ACT-{str(act.id).split('-')[0].upper()}",
        act.template.name if act.template else "",
        act.item_name,
        act.party1_name,
        act.party2_name,
        act.issue_date.strftime("%d.%m.%Y") if act.issue_date else "",
        _ACT_STATUS_RU.get(act.status.value if hasattr(act.status, "value") else str(act.status), str(act.status)),
        act.return_date.strftime("%d.%m.%Y") if act.return_date else "",
    ] for act in acts]
    return _csv_response(
        f"acts_{datetime.utcnow().strftime('%Y%m%d')}.csv",
        ["Номер", "Шаблон", "Документ", "Выдал", "Получатель", "Дата выдачи", "Статус", "Дата возврата"],
        rows,
    )


@router.get("/export/inventory.csv")
async def export_inventory_csv(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    devices = db.query(InventoryDevice).order_by(InventoryDevice.name).all()
    ipads = db.query(IpadDevice).order_by(IpadDevice.tag).all()
    rows = [[
        "Техника", device.name, device.model or "", device.serial_number or "",
        device.inventory_number or "", device.status, device.assigned_to or "",
    ] for device in devices] + [[
        "iPad", ipad.device_name, ipad.model or "", ipad.serial_number,
        ipad.tag, ipad.status, "",
    ] for ipad in ipads]
    return _csv_response(
        f"inventory_{datetime.utcnow().strftime('%Y%m%d')}.csv",
        ["Тип", "Название", "Модель", "Серийный номер", "Инв. номер / Tag", "Статус", "Закреплено за"],
        rows,
    )


@router.get("/dashboard")
async def get_dashboard(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    """Сводка для стартового экрана админки: акты, iPad-парк, последние события."""
    pending_acts = db.query(Act).filter(
        Act.status.in_([ActStatus.DRAFT, ActStatus.SIGNED_PARTY1, ActStatus.SIGNED_PARTY2])
    ).count()
    completed_acts = db.query(Act).filter(Act.status == ActStatus.COMPLETED).count()
    return_in_progress = db.query(Act).filter(Act.status.in_([
        ActStatus.RETURN_INITIATED, ActStatus.RETURN_SIGNED_PARTY1, ActStatus.RETURN_SIGNED_PARTY2,
    ])).count()

    ipad_counts = dict(
        db.query(IpadDevice.status, func.count(IpadDevice.id)).group_by(IpadDevice.status).all()
    )
    # В старых базах статусы инвентаря могли сохраниться в верхнем регистре
    # (AVAILABLE), тогда как текущий Enum использует lowercase (available).
    # CAST обходит enum-конвертер SQLAlchemy и позволяет поддержать оба формата.
    status_text = cast(InventoryDevice.status, String)
    device_counts = {
        str(key).lower(): value
        for key, value in db.query(status_text, func.count(InventoryDevice.id)).group_by(status_text).all()
    }
    email_counts = dict(
        db.query(EmailOutbox.status, func.count(EmailOutbox.id)).group_by(EmailOutbox.status).all()
    )

    recent = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(5).all()
    actor_ids = {item.user_id for item in recent if item.user_id}
    actors = {u.id: u.full_name for u in db.query(User).filter(User.id.in_(actor_ids)).all()} if actor_ids else {}

    return {
        "acts": {
            "pending": pending_acts,
            "completed": completed_acts,
            "return_in_progress": return_in_progress,
        },
        "ipads": {
            "available": ipad_counts.get("AVAILABLE", 0),
            "issued": ipad_counts.get("ISSUED", 0),
            "reserved": ipad_counts.get("RESERVED", 0),
            "return_pending": ipad_counts.get("RETURN_PENDING", 0),
            "maintenance": ipad_counts.get("MAINTENANCE", 0),
            "retired": ipad_counts.get("RETIRED", 0),
        },
        "devices": {
            "available": device_counts.get("available", 0),
            "issued": device_counts.get("issued", 0),
            "maintenance": device_counts.get("maintenance", 0),
            "retired": device_counts.get("retired", 0),
            "paper_issued": device_counts.get("paper_issued", 0),
        },
        "email": {
            "queued": email_counts.get("PENDING", 0) + email_counts.get("PROCESSING", 0),
            "errors": email_counts.get("DEAD", 0),
        },
        "recent_actions": [{
            "id": str(item.id),
            "actor": actors.get(item.user_id),
            "action": item.action,
            "entity_type": item.entity_type,
            "created_at": item.created_at.isoformat(),
        } for item in recent],
    }


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
    # Один проход по актам; извлечение получателей — через доменный модуль.
    acts = db.query(Act).all()
    recipient_counts: dict = {}

    for act in acts:
        for recipient in act_recipients(act):
            full_name = recipient["full_name"]
            if not full_name:
                continue
            key = (full_name, recipient["email"])
            if key not in recipient_counts:
                recipient_counts[key] = {
                    "full_name": full_name,
                    "email": recipient["email"],
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
