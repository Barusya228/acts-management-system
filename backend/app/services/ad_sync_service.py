from datetime import datetime
from typing import Optional
from uuid import UUID

from ldap3 import Server, Connection, ALL, SUBTREE
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Participant, ParticipantEmploymentStatus, ParticipantKind


def _normalize_guid(raw_guid) -> Optional[str]:
    if not raw_guid:
        return None
    if isinstance(raw_guid, bytes):
        raw_guid = str(UUID(bytes=raw_guid))
    guid = str(raw_guid).strip().strip("{}").lower()
    try:
        UUID(guid)
        return guid
    except (ValueError, AttributeError):
        return None


def _get_attr_value(entry, attr_name: str) -> Optional[str]:
    val = getattr(entry, attr_name, None)
    if isinstance(val, dict):
        return None
    if val and hasattr(val, "value"):
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


def _is_departed_dn(dn: str) -> bool:
    if not dn:
        return False
    parts = [part.strip().lower() for part in dn.split(",")]
    expected_path = ["ou=disabled users", "ou=users", "ou=corporate"]
    return any(parts[index:index + len(expected_path)] == expected_path for index in range(len(parts)))


def _detect_kind(department: Optional[str]) -> ParticipantKind:
    if department == "IT":
        return ParticipantKind.IT_MANAGER
    return ParticipantKind.EMPLOYEE


def _extract_title(dn: str) -> Optional[str]:
    if not dn:
        return None
    parts = dn.split(",")
    for part in parts:
        part = part.strip()
        if part.lower().startswith("ou="):
            return part[3:]
    return None


def _upsert_participant(db: Session, record: dict) -> Optional[Participant]:
    ad_guid = record.get("ad_guid")
    email = record.get("email")
    full_name = record.get("full_name")
    department = record.get("department")
    title = record.get("title")
    kind = record.get("kind")
    employment_status = record.get("employment_status", ParticipantEmploymentStatus.ACTIVE)

    if not ad_guid or not full_name:
        return None

    existing = db.query(Participant).filter(Participant.ad_guid == ad_guid).first()

    if existing:
        existing.full_name = full_name
        existing.email = email or existing.email
        existing.department = department or existing.department
        existing.title = title or existing.title
        existing.kind = kind or existing.kind
        existing.employment_status = employment_status
        existing.last_synced_at = datetime.utcnow()
        db.flush()
        return existing
    else:
        participant = Participant(
            full_name=full_name,
            email=email,
            department=department,
            title=title,
            kind=kind or ParticipantKind.EMPLOYEE,
            employment_status=employment_status,
            is_active=True,
            ad_guid=ad_guid,
            last_synced_at=datetime.utcnow(),
        )
        db.add(participant)
        db.flush()
        return participant


def sync_ad_users(db: Session) -> dict:
    if not settings.AD_ENABLED:
        return {"status": "disabled", "reason": "AD_ENABLED is False"}

    if not all([settings.AD_SERVER, settings.AD_USER, settings.AD_PASSWORD, settings.AD_SEARCH_BASE]):
        return {"status": "error", "reason": "AD connection settings are incomplete"}

    imported = 0
    updated = 0
    skipped = 0
    errors = 0
    departed = 0
    reactivated = 0

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
            ")"
        )
        attributes = [
            "objectGUID",
            "givenName",
            "sn",
            "mail",
            "distinguishedName",
            "userAccountControl",
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

                dn = _get_attr_value(entry, "distinguishedName") or ""
                is_departed = _is_departed_dn(dn)
                account_control = _get_attr_value(entry, "userAccountControl")
                account_disabled = bool(int(account_control or 0) & 2)
                department = None if is_departed else _detect_department(dn)
                if not is_departed and (department is None or account_disabled):
                    skipped += 1
                    continue

                title = None if is_departed else _extract_title(dn)
                full_name = f"{first_name} {last_name}"

                existing = db.query(Participant).filter(Participant.ad_guid == ad_guid).first()
                is_new = existing is None
                previous_status = existing.employment_status if existing else None
                kind = existing.kind if is_departed and existing else _detect_kind(department)
                employment_status = (
                    ParticipantEmploymentStatus.DEPARTED
                    if is_departed
                    else ParticipantEmploymentStatus.ACTIVE
                )

                record = {
                    "ad_guid": ad_guid,
                    "email": email,
                    "full_name": full_name,
                    "department": department,
                    "title": title,
                    "kind": kind,
                    "employment_status": employment_status,
                }

                participant = _upsert_participant(db, record)
                if participant:
                    if is_new:
                        imported += 1
                        if is_departed:
                            departed += 1
                    else:
                        updated += 1
                        if previous_status == ParticipantEmploymentStatus.ACTIVE and is_departed:
                            departed += 1
                        elif previous_status == ParticipantEmploymentStatus.DEPARTED and not is_departed:
                            reactivated += 1
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
        "departed": departed,
        "reactivated": reactivated,
    }


def prune_ad_participants(db: Session) -> dict:
    participants = db.query(Participant).filter(Participant.ad_guid.isnot(None)).all()
    for participant in participants:
        participant.is_active = False
    db.commit()
    return {"status": "success", "deactivated": len(participants)}

