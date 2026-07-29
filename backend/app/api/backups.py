import threading

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_admin_user
from app.db.models import Act, ActVersion, FileAsset, FileAssetKind, PdfBackupRecord, User
from app.services.pdf_backup_service import (
    BACKUP_STATUS_FAILED,
    BACKUP_STATUS_SUCCESS,
    backup_pdf_after_commit,
    is_backup_record_valid,
)


router = APIRouter()
sync_lock = threading.Lock()


def _serialize_record(record: PdfBackupRecord, act: Act | None) -> dict:
    return {
        "id": str(record.id),
        "file_asset_id": str(record.file_asset_id),
        "act_id": str(record.act_id),
        "act_title": act.item_name if act else "Удалённый акт",
        "party2_name": act.party2_name if act else None,
        "version_number": record.version_number,
        "destination": record.destination,
        "backup_path": record.backup_path,
        "size_bytes": record.size_bytes,
        "sha256": record.sha256,
        "status": record.status,
        "error_message": record.error_message,
        "created_at": record.created_at.isoformat(),
    }


@router.get("")
async def get_backup_overview(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    query = db.query(PdfBackupRecord)
    total = query.count()
    records = (
        query.order_by(PdfBackupRecord.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    act_ids = {record.act_id for record in records}
    acts = db.query(Act).filter(Act.id.in_(act_ids)).all() if act_ids else []
    acts_by_id = {act.id: act for act in acts}

    successful = db.query(func.count(PdfBackupRecord.id)).filter(
        PdfBackupRecord.status == BACKUP_STATUS_SUCCESS
    ).scalar() or 0
    failed_record = aliased(PdfBackupRecord)
    successful_record = aliased(PdfBackupRecord)
    unresolved_failed = db.query(func.count(func.distinct(failed_record.file_asset_id))).filter(
        failed_record.status == BACKUP_STATUS_FAILED,
        ~db.query(successful_record.id).filter(
            successful_record.file_asset_id == failed_record.file_asset_id,
            successful_record.status == BACKUP_STATUS_SUCCESS,
        ).exists(),
    ).scalar() or 0
    last_success = (
        db.query(PdfBackupRecord)
        .filter(PdfBackupRecord.status == BACKUP_STATUS_SUCCESS)
        .order_by(PdfBackupRecord.created_at.desc())
        .first()
    )

    return {
        "enabled": settings.PDF_BACKUP_ENABLED,
        "destination": settings.PDF_BACKUP_LABEL,
        "total": total,
        "successful": successful,
        "failed": unresolved_failed,
        "last_success_at": last_success.created_at.isoformat() if last_success else None,
        "page": page,
        "page_size": page_size,
        "items": [_serialize_record(record, acts_by_id.get(record.act_id)) for record in records],
    }


@router.post("/sync")
def sync_existing_pdf_backups(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_admin_user),
):
    if not settings.PDF_BACKUP_ENABLED:
        raise HTTPException(status_code=409, detail="Резервное копирование PDF отключено")
    if not sync_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Синхронизация PDF уже выполняется")

    try:
        assets = db.query(FileAsset).filter(FileAsset.kind == FileAssetKind.PDF).all()
        copied = 0
        failed = 0
        skipped = 0

        for asset in assets:
            existing = db.query(PdfBackupRecord).filter(
                PdfBackupRecord.file_asset_id == asset.id,
                PdfBackupRecord.status == BACKUP_STATUS_SUCCESS,
            ).first()
            if existing and is_backup_record_valid(existing):
                skipped += 1
                continue

            version = db.query(ActVersion).filter(ActVersion.pdf_file_id == asset.id).first()
            act = db.query(Act).filter(Act.id == asset.act_id).first()
            if not version or not act:
                skipped += 1
                continue

            record = backup_pdf_after_commit(db, act, version, asset)
            if record and record.status == BACKUP_STATUS_SUCCESS:
                copied += 1
            else:
                failed += 1

        return {
            "status": "success",
            "copied": copied,
            "failed": failed,
            "skipped": skipped,
            "total": len(assets),
        }
    finally:
        sync_lock.release()
