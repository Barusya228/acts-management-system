from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from app.core.db.session import get_db
from app.core.dependencies import get_current_user
from app.db.models.user import User
from app.schemas.act import (
    ActCreate,
    ActUpdate,
    ActResponse,
    ActListResponse,
    ActVersionResponse,
    SignatureRequest
)
from app.services.act_service import (
    create_act,
    get_acts,
    get_act_by_id,
    update_act,
    add_signature,
    get_act_versions
)
import os

router = APIRouter()


@router.post("", response_model=ActResponse, status_code=status.HTTP_201_CREATED)
def create_act_endpoint(
    act_data: ActCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create new act"""
    return create_act(db, act_data, current_user.id, background_tasks)


@router.get("", response_model=ActListResponse)
def list_acts(
    template_code: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    party1: Optional[str] = Query(None),
    party2: Optional[str] = Query(None),
    item_name: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get acts with filters and pagination"""
    acts, total = get_acts(
        db,
        template_code=template_code,
        date_from=date_from,
        date_to=date_to,
        party1=party1,
        party2=party2,
        item_name=item_name,
        email=email,
        sort_by=sort_by,
        sort_dir=sort_dir,
        page=page,
        page_size=page_size
    )
    return ActListResponse(
        items=acts,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{act_id}", response_model=ActResponse)
def get_act(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get act by ID"""
    return get_act_by_id(db, act_id)


@router.patch("/{act_id}", response_model=ActResponse)
def update_act_endpoint(
    act_id: UUID,
    update_data: ActUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update act and create new version"""
    return update_act(db, act_id, update_data, current_user.id)


@router.post("/{act_id}/sign/party1", response_model=ActResponse)
def sign_party1(
    act_id: UUID,
    signature: SignatureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add signature for party1"""
    return add_signature(db, act_id, "party1", signature.signature_base64, current_user.id)


@router.post("/{act_id}/sign/party2", response_model=ActResponse)
def sign_party2(
    act_id: UUID,
    signature: SignatureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add signature for party2"""
    return add_signature(db, act_id, "party2", signature.signature_base64, current_user.id)


@router.get("/{act_id}/versions", response_model=List[ActVersionResponse])
def get_versions(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all versions of an act"""
    return get_act_versions(db, act_id)


@router.get("/{act_id}/download/pdf")
def download_pdf(
    act_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Download PDF of act"""
    act = get_act_by_id(db, act_id)
    
    # Get latest PDF
    from app.db.models.file_asset import FileAsset, FileKind
    pdf_file = db.query(FileAsset).filter(
        FileAsset.act_id == act_id,
        FileAsset.kind == FileKind.PDF
    ).order_by(FileAsset.created_at.desc()).first()
    
    if not pdf_file or not os.path.exists(pdf_file.storage_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF file not found"
        )
    
    return FileResponse(
        pdf_file.storage_path,
        media_type="application/pdf",
        filename=f"act_{act_id}.pdf"
    )

