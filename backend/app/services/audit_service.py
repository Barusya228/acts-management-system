from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import AuditLog, User


def record_audit(
    db: Session,
    user: User | None,
    entity_type: str,
    entity_id: UUID,
    action: str,
    metadata: dict | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user.id if user else None,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        metadata_json=metadata or {},
    )
    db.add(entry)
    return entry
