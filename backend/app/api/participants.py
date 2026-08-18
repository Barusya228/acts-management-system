from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_guest_or_admin_user, get_current_admin_user
from app.db.models import Participant, ParticipantEmploymentStatus, ParticipantKind, User
from app.services.audit_service import record_audit
from app.schemas.schemas import ParticipantCreate, ParticipantUpdate, ParticipantResponse


router = APIRouter()


def _merge_participant_kind(left: ParticipantKind, right: ParticipantKind) -> ParticipantKind:
    if left == right:
        return left
    return ParticipantKind.BOTH


class BulkParticipantCreate(BaseModel):
    full_name: str
    kind: str = "EMPLOYEE"


@router.get("", response_model=list[ParticipantResponse])
async def list_participants(
    request: Request,
    kind: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    employment_status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    query = db.query(Participant)

    if kind:
        try:
            requested_kind = ParticipantKind(kind)
        except ValueError:
            raise HTTPException(status_code=422, detail="Некорректный тип участника")

        if requested_kind == ParticipantKind.IT_MANAGER:
            query = query.filter(Participant.kind.in_([ParticipantKind.IT_MANAGER, ParticipantKind.BOTH]))
        elif requested_kind == ParticipantKind.EMPLOYEE:
            query = query.filter(Participant.kind.in_([ParticipantKind.EMPLOYEE, ParticipantKind.BOTH]))
        else:
            query = query.filter(Participant.kind == requested_kind)
    if is_active is not None:
        query = query.filter(Participant.is_active == is_active)
        if is_active:
            query = query.filter(Participant.employment_status == ParticipantEmploymentStatus.ACTIVE)
    if employment_status:
        try:
            requested_status = ParticipantEmploymentStatus(employment_status)
        except ValueError:
            raise HTTPException(status_code=422, detail="Некорректный статус участника")
        query = query.filter(Participant.employment_status == requested_status)

    participants = query.order_by(Participant.full_name.asc()).all()

    # Киоск получает только поля церемонии подписания:
    # без AD GUID и служебных дат синхронизации.
    if getattr(request.state, "kiosk_device", None) is not None:
        for participant in participants:
            participant.ad_guid = None
            participant.last_synced_at = None
    return participants


@router.post("", response_model=ParticipantResponse, status_code=status.HTTP_201_CREATED)
async def create_participant(
    payload: ParticipantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    try:
        kind = ParticipantKind(payload.kind)
    except ValueError:
        raise HTTPException(status_code=422, detail="Некорректный тип участника")

    existing = None
    normalized_email = payload.email.lower() if payload.email else None
    if normalized_email:
        existing = db.query(Participant).filter(
            or_(Participant.email == normalized_email, Participant.full_name == payload.full_name)
        ).first()
    if not existing:
        existing = db.query(Participant).filter(Participant.full_name == payload.full_name).first()

    if existing:
        existing.full_name = payload.full_name
        existing.email = normalized_email or existing.email
        existing.department = payload.department or existing.department
        existing.title = payload.title or existing.title
        existing.sticker_emoji = payload.sticker_emoji or existing.sticker_emoji
        existing.kind = _merge_participant_kind(existing.kind, kind)
        existing.is_active = True
        record_audit(db, current_user, "PARTICIPANT", existing.id, "PARTICIPANT_UPDATED")
        db.commit()
        db.refresh(existing)
        return existing

    participant_data = payload.model_dump()
    participant_data["kind"] = kind
    participant_data["email"] = normalized_email
    participant = Participant(**participant_data)
    db.add(participant)
    db.flush()
    record_audit(db, current_user, "PARTICIPANT", participant.id, "PARTICIPANT_CREATED")
    db.commit()
    db.refresh(participant)
    return participant


@router.patch("/{participant_id}", response_model=ParticipantResponse)
async def update_participant(
    participant_id: UUID,
    payload: ParticipantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Участник не найден")

    updates = payload.model_dump(exclude_unset=True)
    if (
        updates.get("is_active") is True
        and participant.employment_status == ParticipantEmploymentStatus.DEPARTED
    ):
        raise HTTPException(
            status_code=409,
            detail="Выбывшего участника нельзя активировать, пока он находится в Disabled Users",
        )
    if "kind" in updates:
        try:
            updates["kind"] = ParticipantKind(updates["kind"])
        except ValueError:
            raise HTTPException(status_code=422, detail="Некорректный тип участника")
    if "email" in updates and updates["email"]:
        updates["email"] = updates["email"].lower()

    for field, value in updates.items():
        setattr(participant, field, value)

    record_audit(db, current_user, "PARTICIPANT", participant.id, "PARTICIPANT_UPDATED", {
        "fields": list(updates.keys()),
    })
    db.commit()
    db.refresh(participant)
    return participant


@router.delete("/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Участник не найден")

    participant.is_active = False
    record_audit(db, current_user, "PARTICIPANT", participant.id, "PARTICIPANT_DEACTIVATED")
    db.commit()
    return None


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_participants(
    participants: List[BulkParticipantCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    created_count = 0
    skipped_count = 0
    
    for item in participants:
        try:
            kind = ParticipantKind(item.kind)
        except ValueError:
            skipped_count += 1
            continue
        
        existing = db.query(Participant).filter(Participant.full_name == item.full_name).first()
        
        if existing:
            existing.kind = _merge_participant_kind(existing.kind, kind)
            existing.is_active = True
            skipped_count += 1
            continue
        
        participant = Participant(
            full_name=item.full_name,
            kind=kind,
            email=None,
            department=None,
            title=None,
            sticker_emoji=None,
            is_active=True
        )
        db.add(participant)
        created_count += 1
    
    db.commit()
    
    return {
        "created": created_count,
        "skipped": skipped_count,
        "total": len(participants)
    }
