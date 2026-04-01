from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_admin_user
from app.db.models import Template, User
from app.schemas.schemas import TemplateCreate, TemplateUpdate, TemplateResponse

router = APIRouter()

@router.get("", response_model=list[TemplateResponse])
async def list_templates(
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Template)
    
    if is_active is not None:
        query = query.filter(Template.is_active == is_active)
    
    templates = query.all()
    return templates

@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    template_data: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    # Check if code already exists
    existing = db.query(Template).filter(Template.code == template_data.code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template with this code already exists"
        )
    
    template = Template(**template_data.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    
    return template

@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    template = db.query(Template).filter(Template.id == template_id).first()
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    return template

@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    template_data: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    template = db.query(Template).filter(Template.id == template_id).first()
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    update_data = template_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)
    
    db.commit()
    db.refresh(template)
    
    return template
