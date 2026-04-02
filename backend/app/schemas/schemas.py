from pydantic import BaseModel, EmailStr, UUID4
from typing import Optional
from datetime import datetime, date

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str
    role: str = "STAFF"

class UserResponse(UserBase):
    id: UUID4
    role: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Auth schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

# Template schemas
class TemplateBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    schema_json: dict

class TemplateCreate(TemplateBase):
    pass

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    schema_json: Optional[dict] = None
    is_active: Optional[bool] = None

class TemplateResponse(TemplateBase):
    id: UUID4
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Act schemas
class ActBase(BaseModel):
    template_id: UUID4
    party1_name: str
    party2_name: str
    issue_date: date
    item_name: str
    item_serial: Optional[str] = None
    receiver_email: EmailStr
    extra_data_json: Optional[dict] = None

class ActCreate(ActBase):
    pass

class ActUpdate(BaseModel):
    party1_name: Optional[str] = None
    party2_name: Optional[str] = None
    issue_date: Optional[date] = None
    item_name: Optional[str] = None
    item_serial: Optional[str] = None
    receiver_email: Optional[EmailStr] = None
    extra_data_json: Optional[dict] = None
    change_note: Optional[str] = None

class ActResponse(ActBase):
    id: UUID4
    status: str
    current_version: int
    created_by: UUID4
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ActListResponse(BaseModel):
    items: list[ActResponse]
    total: int
    page: int
    page_size: int

# Signature schemas
class SignatureRequest(BaseModel):
    signature_data: str  # Base64 encoded image

# Version schemas
class ActVersionResponse(BaseModel):
    id: UUID4
    act_id: UUID4
    version_number: int
    data_json: dict
    pdf_file_id: Optional[UUID4] = None
    change_note: Optional[str] = None
    created_by: UUID4
    created_at: datetime
    
    class Config:
        from_attributes = True
