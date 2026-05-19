import secrets
import string
from datetime import datetime
from typing import Optional
from uuid import UUID

from ldap3 import Server, Connection, ALL, SUBTREE
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_password_hash
from app.db.models.user import User, UserRole


def _generate_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def _normalize_guid(raw_guid) -> Optional[str]:
    if not raw_guid:
        return None
    if isinstance(raw_guid, bytes):
        raw_guid = str(UUID(bytes=raw_guid))
    guid = str(raw_guid).strip().strip('{}').lower()
    try:
        UUID(guid)
        return guid
    except (ValueError, AttributeError):
        return None


def _get_attr_value(entry, attr_name: str) -> Optional[str]:
    val = getattr(entry, attr_name, None)
    if isinstance(val, dict):
        return None
    if val and hasattr(val, 'value'):
        return val.value
    if isinstance(val, (list, tuple)) and len(val) > 0:
        item = val[0]
        return item if isinstance(item, str) else str(item)
    return str(val) if val else None


def _detect_department(dn: str) -> Optional[str]:
    if not dn:
        return None
    dn_lower = dn.lower()
    if "ou=it departament" in dn_lower or "ou=it department" in dn_lower:
        return "IT"
    if "ou=staff" in dn_lower:
        return "Сотрудники"
    return None


def _extract_position(dn: str) -> Optional[str]:
    if not dn:
        return None
    parts = dn.split(",")
    if len(parts) >= 1:
        first_ou = parts[0].strip()
        if first_ou.lower().startswith("ou="):
            return first_ou[3:]
    return dn


def _determine_role(department: Optional[str]) -> UserRole:
    if department == "IT":
        return UserRole.ADMIN
    return UserRole.STAFF


def _upsert_user(db: Session, record: dict) -> Optional[User]:
    ad_guid = record.get("ad_guid")
    email = record.get("email")
    full_name = record.get("full_name")
    department = record.get("department")
    position = record.get("position")

    if not ad_guid or not email or not full_name:
        return None

    existing = db.query(User).filter(User.ad_guid == ad_guid).first()

    if existing:
        existing.full_name = full_name
        existing.email = email
        existing.department = department
        existing.position = position
        existing.last_synced_at = datetime.utcnow()
        if department == "IT":
            existing.role = UserRole.ADMIN
        db.flush()
        return existing
    else:
        role = _determine_role(department)
        user = User(
            email=email,
            full_name=full_name,
            password_hash=get_password_hash(_generate_password()),
            role=role,
            is_active=True,
            ad_guid=ad_guid,
            department=department,
            position=position,
            last_synced_at=datetime.utcnow(),
        )
        db.add(user)
        db.flush()
        return user


def sync_ad_users(db: Session) -> dict:
    if not settings.AD_ENABLED:
        return {"status": "disabled", "reason": "AD_ENABLED is False"}

    if not all([settings.AD_SERVER, settings.AD_USER, settings.AD_PASSWORD, settings.AD_SEARCH_BASE]):
        return {"status": "error", "reason": "AD connection settings are incomplete"}

    imported = 0
    updated = 0
    skipped = 0
    errors = 0

    server = Server(settings.AD_SERVER, port=settings.AD_PORT, get_info=ALL)
    conn = Connection(
        server,
        user=settings.AD_USER,
        password=settings.AD_PASSWORD,
        auto_bind=True,
    )

    try:
        search_filter = (
            "(&"
            "(objectClass=user)"
            "(objectCategory=person)"
            "(!(userAccountControl:1.2.840.113556.1.4.803:=2))"
            ")"
        )
        attributes = [
            "objectGUID",
            "givenName",
            "sn",
            "mail",
            "distinguishedName",
        ]

        conn.search(
            search_base=settings.AD_SEARCH_BASE,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=attributes,
        )

        for entry in conn.entries:
            try:
                raw_guid = _get_attr_value(entry, "objectGUID")
                ad_guid = _normalize_guid(raw_guid) if raw_guid else None
                if not ad_guid:
                    skipped += 1
                    continue

                first_name = _get_attr_value(entry, "givenName")
                last_name = _get_attr_value(entry, "sn")
                if not first_name or not last_name:
                    skipped += 1
                    continue

                email = _get_attr_value(entry, "mail")
                if not email:
                    skipped += 1
                    continue

                dn = _get_attr_value(entry, "distinguishedName") or ""
                department = _detect_department(dn)
                if department is None:
                    skipped += 1
                    continue

                position = _extract_position(dn)
                full_name = f"{first_name} {last_name}"

                existing = db.query(User).filter(User.ad_guid == ad_guid).first()
                is_new = existing is None

                record = {
                    "ad_guid": ad_guid,
                    "email": email,
                    "full_name": full_name,
                    "department": department,
                    "position": position,
                }

                user = _upsert_user(db, record)
                if user:
                    if is_new:
                        imported += 1
                    else:
                        updated += 1
            except Exception:
                errors += 1
                continue

    finally:
        conn.unbind()

    db.commit()

    return {
        "status": "success",
        "imported": imported,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }
