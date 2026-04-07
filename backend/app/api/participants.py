from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_guest_or_admin_user, get_current_admin_user
from app.db.models import Participant, ParticipantKind, User
from app.schemas.schemas import ParticipantCreate, ParticipantUpdate, ParticipantResponse


router = APIRouter()


class BulkParticipantCreate(BaseModel):
    full_name: str
    kind: str = "EMPLOYEE"


@router.get("", response_model=list[ParticipantResponse])
async def list_participants(
    kind: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_guest_or_admin_user),
):
    query = db.query(Participant)

    if kind:
        query = query.filter(Participant.kind == kind)
    if is_active is not None:
        query = query.filter(Participant.is_active == is_active)

    return query.order_by(Participant.full_name.asc()).all()


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

    participant_data = payload.model_dump()
    participant_data["kind"] = kind
    participant = Participant(**participant_data)
    db.add(participant)
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

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(participant, field, value)

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

    db.delete(participant)
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
        
        # Check if participant already exists
        existing = db.query(Participant).filter(
            Participant.full_name == item.full_name,
            Participant.kind == kind
        ).first()
        
        if existing:
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
