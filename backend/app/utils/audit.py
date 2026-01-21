from sqlalchemy.orm import Session
from uuid import UUID
from app.db.models.audit_log import AuditLog
from typing import Optional, Dict, Any


def log_action(
    db: Session,
    user_id: Optional[UUID],
    entity_type: str,
    entity_id: UUID,
    action: str,
    metadata: Optional[Dict[str, Any]] = None
):
    """Log action to audit log"""
    audit_entry = AuditLog(
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        metadata_json=metadata
    )
    db.add(audit_entry)
    db.commit()

