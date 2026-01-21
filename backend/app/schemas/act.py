from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID


class ActBase(BaseModel):
    template_id: UUID
    party1_name: str
    party2_name: str
    issue_date: datetime
    item_name: str
    receiver_email: EmailStr


class ActCreate(ActBase):
    pass


class ActUpdate(BaseModel):
    party1_name: Optional[str] = None
    party2_name: Optional[str] = None
    issue_date: Optional[datetime] = None
    item_name: Optional[str] = None
    receiver_email: Optional[EmailStr] = None
    change_note: Optional[str] = None


class ActResponse(ActBase):
    id: UUID
    status: str
    current_version: int
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ActListResponse(BaseModel):
    items: List[ActResponse]
    total: int
    page: int
    page_size: int


class ActVersionResponse(BaseModel):
    id: UUID
    act_id: UUID
    version_number: int
    data_json: Dict[str, Any]
    pdf_file_id: Optional[UUID] = None
    change_note: Optional[str] = None
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class SignatureRequest(BaseModel):
    signature_base64: str  # base64 encoded PNG image

