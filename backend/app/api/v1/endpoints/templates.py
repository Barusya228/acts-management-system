from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from app.core.db.session import get_db
from app.core.dependencies import get_current_admin_user
from app.db.models.user import User
from app.schemas.template import TemplateCreate, TemplateUpdate, TemplateResponse
from app.services.template_service import (
    get_templates,
    get_template_by_id,
    create_template,
    update_template
)

router = APIRouter()


@router.get("", response_model=List[TemplateResponse])
def list_templates(
    is_active: bool = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Get all templates (admin only)"""
    return get_templates(db, is_active=is_active)


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template_endpoint(
    template_data: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Create template (admin only)"""
    return create_template(db, template_data)


@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Get template by ID (admin only)"""
    return get_template_by_id(db, template_id)


@router.patch("/{template_id}", response_model=TemplateResponse)
def update_template_endpoint(
    template_id: UUID,
    update_data: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """Update template (admin only)"""
    return update_template(db, template_id, update_data)

