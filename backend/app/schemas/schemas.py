from pydantic import BaseModel, EmailStr, Field, UUID4
from typing import Literal, Optional
from datetime import datetime, date

# User schemas
class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    full_name: str

class UserCreate(UserBase):
    password: str
    role: str = "STAFF"

class UserResponse(BaseModel):
    id: UUID4
    username: str
    email: Optional[str] = None
    full_name: str
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
    username: str
    password: str

# Template schemas
class TemplateBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    schema_json: dict
    pdf_version: int = 2

class TemplateCreate(TemplateBase):
    pass

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    schema_json: Optional[dict] = None
    pdf_version: Optional[int] = None
    is_active: Optional[bool] = None

class TemplateResponse(TemplateBase):
    id: UUID4
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class ParticipantBase(BaseModel):
    full_name: str
    email: Optional[EmailStr] = None
    department: Optional[str] = None
    title: Optional[str] = None
    sticker_emoji: Optional[str] = None
    kind: str


class ParticipantCreate(ParticipantBase):
    pass


class ParticipantUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    department: Optional[str] = None
    title: Optional[str] = None
    sticker_emoji: Optional[str] = None
    kind: Optional[str] = None
    is_active: Optional[bool] = None


class ParticipantResponse(ParticipantBase):
    id: UUID4
    ad_guid: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    employment_status: str
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
    return_date: Optional[date] = None
    return_note: Optional[str] = None

class ActCreate(ActBase):
    party1_participant_id: UUID4
    inventory_device_id: UUID4


class ActUpdate(BaseModel):
    item_name: Optional[str] = None
    item_serial: Optional[str] = None
    extra_data_json: Optional[dict] = None

class ActResponse(ActBase):
    id: UUID4
    inventory_device_id: Optional[UUID4] = None
    status: str
    issue_completion_email_sent: bool
    return_completion_email_sent: bool
    current_version: int
    created_by: UUID4
    created_at: datetime
    updated_at: datetime
    template_code: Optional[str] = None
    advisory_group: Optional[str] = None
    student_count: Optional[int] = None
    
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
    participant_id: Optional[UUID4] = None


class ReturnStartRequest(BaseModel):
    return_date: date
    return_note: Optional[str] = None


class ManualFinalEmailRequest(BaseModel):
    kind: Literal["ISSUE_COMPLETED", "RETURN_COMPLETED"]
    recipient_emails: list[EmailStr] = Field(min_length=1)
    custom_message: Optional[str] = Field(default=None, max_length=2000)


class IpadStudentCreate(BaseModel):
    student_name: str
    ipad_device_id: UUID4
    note: Optional[str] = None


class IpadAdvisoryActCreate(BaseModel):
    template_id: UUID4
    advisory_group: str
    academic_year: str
    issue_date: date
    issuer_participant_id: UUID4
    responsible_participant_ids: list[UUID4]
    students: list[IpadStudentCreate]


class IpadStudentDepartureRequest(BaseModel):
    departure_date: date
    reason: str
    ipad_returned: bool
    return_condition: Optional[str] = None
    note: Optional[str] = None


class IpadReplacementRequest(BaseModel):
    replacement_date: date
    reason: str
    old_condition: str
    ipad_device_id: UUID4
    note: Optional[str] = None


class IpadAppendixReplacementCreate(IpadReplacementRequest):
    responsible_participant_id: UUID4


class IpadAppendixDepartureCreate(IpadStudentDepartureRequest):
    responsible_participant_id: UUID4
    device_result_status: Literal["AVAILABLE", "MAINTENANCE", "RETIRED", "RETURN_PENDING"]


class IpadAppendixStudentAddCreate(BaseModel):
    responsible_participant_id: UUID4
    added_at: date
    student_name: str
    ipad_device_id: UUID4
    reason: str
    note: Optional[str] = None


class IpadAppendixLateReturnCreate(BaseModel):
    responsible_participant_id: UUID4
    returned_at: date
    device_result_status: Literal["AVAILABLE", "MAINTENANCE", "RETIRED"]
    condition: str
    note: Optional[str] = None


class IpadYearEndReturnItem(BaseModel):
    assignment_id: UUID4
    device_result_status: Literal["AVAILABLE", "MAINTENANCE", "RETIRED"]
    condition: str


class IpadAppendixYearEndReturnCreate(BaseModel):
    responsible_participant_id: UUID4
    returned_at: date
    items: list[IpadYearEndReturnItem]
    note: Optional[str] = None


class IpadAppendixSignatureRequest(BaseModel):
    participant_id: UUID4
    signature_data: str


class IpadDeviceCreate(BaseModel):
    device_name: str = "iPad"
    model: Optional[str] = None
    tag: str
    serial_number: str
    status: Literal["AVAILABLE", "MAINTENANCE", "RETIRED"] = "AVAILABLE"
    notes: Optional[str] = None


class IpadDeviceUpdate(BaseModel):
    device_name: Optional[str] = None
    model: Optional[str] = None
    tag: Optional[str] = None
    serial_number: Optional[str] = None
    status: Optional[Literal["AVAILABLE", "MAINTENANCE", "RETIRED"]] = None
    notes: Optional[str] = None


class IpadBulkRow(BaseModel):
    tag: str
    serial_number: str


class IpadDeviceBulkCreate(BaseModel):
    device_name: str = "iPad"
    model: Optional[str] = None
    status: Literal["AVAILABLE", "MAINTENANCE", "RETIRED"] = "AVAILABLE"
    devices: list[IpadBulkRow]

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


# Inventory schemas
class InventoryCategoryCreate(BaseModel):
    name: str
    code: Optional[str] = None
    icon: str = "📦"


class InventoryCategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None


class InventoryCategoryResponse(BaseModel):
    id: UUID4
    code: str
    name: str
    icon: str
    is_active: bool
    is_system: bool
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryDeviceCreate(BaseModel):
    inventory_number: str
    barcode: str
    name: str
    model: Optional[str] = None
    category: str
    serial_number: str
    status: Literal["available", "maintenance", "retired"] = "available"
    location: Optional[str] = None
    notes: Optional[str] = None


class InventoryBulkItem(BaseModel):
    inventory_number: str
    barcode: str


class InventoryBulkCreate(BaseModel):
    name: str
    model: Optional[str] = None
    category: str
    status: Literal["available", "maintenance", "retired"] = "available"
    devices: list[InventoryBulkItem]


class InventoryDeviceUpdate(BaseModel):
    inventory_number: Optional[str] = None
    barcode: Optional[str] = None
    name: Optional[str] = None
    model: Optional[str] = None
    category: Optional[str] = None
    serial_number: Optional[str] = None
    status: Optional[Literal["available", "reserved", "issued", "maintenance", "retired"]] = None
    location: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None


class InventoryDeviceResponse(BaseModel):
    id: UUID4
    inventory_number: str
    barcode: Optional[str] = None
    name: str
    model: Optional[str] = None
    category: str
    serial_number: str
    status: str
    location: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InventoryListResponse(BaseModel):
    items: list[InventoryDeviceResponse]
    total: int
    page: int
    page_size: int
