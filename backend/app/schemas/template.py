from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from uuid import UUID


class TemplateBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    schema_json: Dict[str, Any]


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    schema_json: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class TemplateResponse(TemplateBase):
    id: UUID
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

