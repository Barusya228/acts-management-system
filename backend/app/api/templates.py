from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_admin_user
from app.db.models import Template, User
from app.schemas.schemas import TemplateCreate, TemplateUpdate, TemplateResponse

router = APIRouter()


ALLOWED_FIELD_TYPES = {
    "string",
    "text",
    "email",
    "date",
    "boolean",
    "bool",
    "integer",
    "int",
    "number",
    "float",
}

ALLOWED_PDF_VERSIONS = {1, 2}


def _validate_template_schema(schema_json: dict) -> dict:
    if not isinstance(schema_json, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="schema_json должен быть объектом"
        )

    fields = schema_json.get("fields")
    if not isinstance(fields, list) or len(fields) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="schema_json.fields должен быть непустым массивом"
        )

    seen_names = set()
    normalized_fields = []
    for index, field in enumerate(fields):
        if not isinstance(field, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле #{index + 1} должно быть объектом"
            )

        name = str(field.get("name", "")).strip()
        label = str(field.get("label", "")).strip()
        field_type = str(field.get("type", "string")).strip().lower()
        required = bool(field.get("required", False))

        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле #{index + 1}: name обязателен"
            )

        if not label:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле '{name}': label обязателен"
            )

        if field_type not in ALLOWED_FIELD_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле '{name}': неподдерживаемый type '{field_type}'"
            )

        if name in seen_names:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Поле '{name}' дублируется в шаблоне"
            )

        seen_names.add(name)
        normalized_fields.append(
            {
                "name": name,
                "label": label,
                "type": field_type,
                "required": required,
            }
        )

    return {"fields": normalized_fields}


def _validate_pdf_version(pdf_version: int) -> int:
    if pdf_version not in ALLOWED_PDF_VERSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"pdf_version должен быть одним из: {', '.join(map(str, sorted(ALLOWED_PDF_VERSIONS)))}"
        )
    return pdf_version

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

    normalized_schema = _validate_template_schema(template_data.schema_json)
    payload = template_data.model_dump()
    payload["schema_json"] = normalized_schema
    payload["pdf_version"] = _validate_pdf_version(payload.get("pdf_version", 2))
    
    template = Template(**payload)
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
    if "schema_json" in update_data:
        update_data["schema_json"] = _validate_template_schema(update_data["schema_json"])
    if "pdf_version" in update_data:
        update_data["pdf_version"] = _validate_pdf_version(update_data["pdf_version"])
    for field, value in update_data.items():
        setattr(template, field, value)
    
    db.commit()
    db.refresh(template)
    
    return template
