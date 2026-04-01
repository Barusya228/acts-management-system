from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.core.database import get_db
from app.core.deps import get_current_user
from app.db.models import Act, ActVersion, Template, User, ActStatus
from app.schemas.schemas import ActCreate, ActUpdate, ActResponse, ActListResponse, SignatureRequest, ActVersionResponse

router = APIRouter()

@router.get("", response_model=ActListResponse)
async def list_acts(
    party1: Optional[str] = Query(None),
    party2: Optional[str] = Query(None),
    item_name: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Act)
    
    if party1:
        query = query.filter(Act.party1_name.ilike(f"%{party1}%"))
    if party2:
        query = query.filter(Act.party2_name.ilike(f"%{party2}%"))
    if item_name:
        query = query.filter(Act.item_name.ilike(f"%{item_name}%"))
    if email:
        query = query.filter(Act.receiver_email.ilike(f"%{email}%"))
    
    total = query.count()
    acts = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "items": acts,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.post("", response_model=ActResponse, status_code=status.HTTP_201_CREATED)
async def create_act(
    act_data: ActCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify template exists
    template = db.query(Template).filter(Template.id == act_data.template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    act = Act(
        **act_data.model_dump(),
        created_by=current_user.id,
        status=ActStatus.DRAFT,
        current_version=1
    )
    
    db.add(act)
    db.commit()
    db.refresh(act)
    
    # Create initial version
    version = ActVersion(
        act_id=act.id,
        version_number=1,
        data_json=act_data.model_dump(),
        created_by=current_user.id
    )
    db.add(version)
    db.commit()
    
    return act

@router.get("/{act_id}", response_model=ActResponse)
async def get_act(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    return act

@router.patch("/{act_id}", response_model=ActResponse)
async def update_act(
    act_id: UUID,
    act_data: ActUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    # Update act fields
    update_data = act_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(act, field, value)
    
    # Increment version
    act.current_version += 1
    act.updated_at = datetime.utcnow()
    
    # Create new version
    version = ActVersion(
        act_id=act.id,
        version_number=act.current_version,
        data_json=update_data,
        created_by=current_user.id
    )
    db.add(version)
    
    db.commit()
    db.refresh(act)
    
    return act

@router.delete("/{act_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_act(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    db.delete(act)
    db.commit()
    
    return None

@router.post("/{act_id}/sign/party1", response_model=ActResponse)
async def sign_party1(
    act_id: UUID,
    signature: SignatureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    if act.status != ActStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Act already signed by party1"
        )
    
    act.status = ActStatus.SIGNED_PARTY1
    act.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(act)
    
    return act

@router.post("/{act_id}/sign/party2", response_model=ActResponse)
async def sign_party2(
    act_id: UUID,
    signature: SignatureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    if act.status == ActStatus.DRAFT:
        act.status = ActStatus.SIGNED_PARTY2
    elif act.status == ActStatus.SIGNED_PARTY1:
        act.status = ActStatus.COMPLETED
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid act status for party2 signature"
        )
    
    act.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(act)
    
    return act

@router.get("/{act_id}/versions", response_model=list[ActVersionResponse])
async def get_act_versions(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    act = db.query(Act).filter(Act.id == act_id).first()
    
    if not act:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Act not found"
        )
    
    versions = db.query(ActVersion).filter(ActVersion.act_id == act_id).order_by(ActVersion.version_number.desc()).all()
    
    return versions
