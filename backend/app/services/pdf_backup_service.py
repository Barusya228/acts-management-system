import hashlib
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.db.models import Act, ActVersion, FileAsset, PdfBackupRecord
from app.utils.storage import resolve_storage_path


BACKUP_STATUS_SUCCESS = "SUCCESS"
BACKUP_STATUS_FAILED = "FAILED"
BACKUP_STATUS_STALE = "STALE"
BACKUP_TARGET_MARKER = ".acts-pdf-backup-target"


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_backup_record_valid(record: PdfBackupRecord) -> bool:
    if not record.backup_path or not record.sha256 or record.size_bytes is None:
        return False
    try:
        backup_path = Path(settings.PDF_BACKUP_PATH) / record.backup_path
        return (
            backup_path.is_file()
            and backup_path.stat().st_size == record.size_bytes
            and _file_sha256(backup_path) == record.sha256
        )
    except OSError:
        return False


def backup_pdf_asset(
    db: Session,
    act: Act,
    version: ActVersion,
    file_asset: FileAsset,
) -> PdfBackupRecord | None:
    if not settings.PDF_BACKUP_ENABLED:
        return None

    existing = db.query(PdfBackupRecord).filter(
        PdfBackupRecord.file_asset_id == file_asset.id,
        PdfBackupRecord.status == BACKUP_STATUS_SUCCESS,
    ).first()
    if existing and is_backup_record_valid(existing):
        return existing
    if existing:
        existing.status = BACKUP_STATUS_STALE
        db.flush()

    record = PdfBackupRecord(
        file_asset_id=file_asset.id,
        act_id=act.id,
        version_number=version.version_number,
        destination=settings.PDF_BACKUP_LABEL,
        status=BACKUP_STATUS_FAILED,
    )

    try:
        source_path = resolve_storage_path(file_asset.storage_path)
        if not source_path.is_file():
            raise FileNotFoundError(f"Исходный PDF не найден: {file_asset.storage_path}")

        now = datetime.utcnow()
        backup_root = Path(settings.PDF_BACKUP_PATH)
        if not backup_root.is_dir() or not (backup_root / BACKUP_TARGET_MARKER).is_file():
            raise OSError(f"Хранилище backup не подключено: отсутствует {BACKUP_TARGET_MARKER}")
        relative_path = Path(
            f"{now.year:04d}",
            f"{now.month:02d}",
            str(act.id),
            f"act_{act.id}_v{version.version_number}_{file_asset.id}.pdf",
        )
        destination_path = backup_root / relative_path
        destination_path.parent.mkdir(parents=True, exist_ok=True)

        temporary_path = destination_path.with_name(
            f".{destination_path.name}.{uuid.uuid4().hex}.tmp"
        )
        try:
            shutil.copy2(source_path, temporary_path)
            copied_sha256 = _file_sha256(temporary_path)
            expected_sha256 = file_asset.sha256 or _file_sha256(source_path)
            if copied_sha256 != expected_sha256:
                raise OSError("Контрольная сумма резервной копии не совпадает")
            os.replace(temporary_path, destination_path)
        finally:
            temporary_path.unlink(missing_ok=True)

        record.backup_path = relative_path.as_posix()
        record.size_bytes = destination_path.stat().st_size
        record.sha256 = copied_sha256
        record.status = BACKUP_STATUS_SUCCESS
    except Exception as exc:
        record.error_message = str(exc)[:2000]

    db.add(record)
    db.flush()
    return record


def backup_pdf_after_commit(
    db: Session,
    act: Act,
    version: ActVersion,
    file_asset: FileAsset,
) -> PdfBackupRecord | None:
    try:
        record = backup_pdf_asset(db, act, version, file_asset)
        db.commit()
        return record
    except Exception:
        db.rollback()
        return None


def backup_pdf_by_ids(act_id, version_id, file_asset_id) -> None:
    db = SessionLocal()
    try:
        act = db.query(Act).filter(Act.id == act_id).first()
        version = db.query(ActVersion).filter(ActVersion.id == version_id).first()
        file_asset = db.query(FileAsset).filter(FileAsset.id == file_asset_id).first()
        if not act or not version or not file_asset:
            return
        backup_pdf_asset(db, act, version, file_asset)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
