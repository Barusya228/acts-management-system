from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from app.db.models.template import Template
from app.schemas.template import TemplateCreate, TemplateUpdate
from fastapi import HTTPException, status


def get_templates(db: Session, is_active: Optional[bool] = None) -> List[Template]:
    """Get all templates"""
    query = db.query(Template)
    if is_active is not None:
        query = query.filter(Template.is_active == is_active)
    return query.all()


def get_template_by_id(db: Session, template_id: UUID) -> Template:
    """Get template by ID"""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    return template


def create_template(db: Session, template_data: TemplateCreate) -> Template:
    """Create new template"""
    template = Template(**template_data.dict())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def update_template(
    db: Session,
    template_id: UUID,
    update_data: TemplateUpdate
) -> Template:
    """Update template"""
    template = get_template_by_id(db, template_id)
    update_dict = update_data.dict(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(template, field, value)
    db.commit()
    db.refresh(template)
    return template

