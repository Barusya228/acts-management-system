import uuid
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Integer, Date, Text, Enum as SQLEnum, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    GUEST = "GUEST"


class ParticipantKind(str, enum.Enum):
    IT_MANAGER = "IT_MANAGER"
    EMPLOYEE = "EMPLOYEE"
    BOTH = "BOTH"

class ActStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SIGNED_PARTY1 = "SIGNED_PARTY1"
    SIGNED_PARTY2 = "SIGNED_PARTY2"
    COMPLETED = "COMPLETED"
    RETURN_INITIATED = "RETURN_INITIATED"
    RETURN_SIGNED_PARTY1 = "RETURN_SIGNED_PARTY1"
    RETURN_SIGNED_PARTY2 = "RETURN_SIGNED_PARTY2"
    RETURNED = "RETURNED"

class FileAssetKind(str, enum.Enum):
    PDF = "PDF"
    SIGNATURE_PARTY1 = "SIGNATURE_PARTY1"
    SIGNATURE_PARTY2 = "SIGNATURE_PARTY2"
    RETURN_SIGNATURE_PARTY1 = "RETURN_SIGNATURE_PARTY1"
    RETURN_SIGNATURE_PARTY2 = "RETURN_SIGNATURE_PARTY2"

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=True, index=True)
    full_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.GUEST)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    created_acts = relationship("Act", back_populates="creator", foreign_keys="Act.created_by")
    act_versions = relationship("ActVersion", back_populates="creator")
    audit_logs = relationship("AuditLog", back_populates="user")


class Participant(Base):
    __tablename__ = "participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True, index=True)
    department = Column(String, nullable=True)
    title = Column(String, nullable=True)
    sticker_emoji = Column(String, nullable=True)
    kind = Column(SQLEnum(ParticipantKind), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    ad_guid = Column(String, unique=True, nullable=True)
    last_synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class Template(Base):
    __tablename__ = "templates"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    schema_json = Column(JSON, nullable=False)
    pdf_version = Column(Integer, nullable=False, default=2)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    acts = relationship("Act", back_populates="template")

class Act(Base):
    __tablename__ = "acts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("templates.id"), nullable=False)
    party1_name = Column(String, nullable=False)
    party2_name = Column(String, nullable=False)
    issue_date = Column(Date, nullable=False)
    item_name = Column(String, nullable=False)
    item_serial = Column(String, nullable=True)
    receiver_email = Column(String, nullable=False)
    extra_data_json = Column(JSON, nullable=True)
    return_date = Column(Date, nullable=True)
    return_note = Column(Text, nullable=True)
    status = Column(SQLEnum(ActStatus), nullable=False, default=ActStatus.DRAFT)
    issue_completion_email_sent = Column(Boolean, nullable=False, default=False)
    return_completion_email_sent = Column(Boolean, nullable=False, default=False)
    current_version = Column(Integer, nullable=False, default=1)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    template = relationship("Template", back_populates="acts")
    creator = relationship("User", back_populates="created_acts", foreign_keys=[created_by])
    versions = relationship("ActVersion", back_populates="act", cascade="all, delete-orphan")
    file_assets = relationship("FileAsset", back_populates="act", cascade="all, delete-orphan")

class ActVersion(Base):
    __tablename__ = "act_versions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    act_id = Column(UUID(as_uuid=True), ForeignKey("acts.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    data_json = Column(JSON, nullable=False)
    pdf_file_id = Column(UUID(as_uuid=True), ForeignKey("file_assets.id"), nullable=True)
    change_note = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    act = relationship("Act", back_populates="versions")
    creator = relationship("User", back_populates="act_versions")
    pdf_file = relationship("FileAsset", foreign_keys=[pdf_file_id])

class FileAsset(Base):
    __tablename__ = "file_assets"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    act_id = Column(UUID(as_uuid=True), ForeignKey("acts.id"), nullable=True)
    kind = Column(SQLEnum(FileAssetKind), nullable=False)
    storage_path = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    act = relationship("Act", back_populates="file_assets", foreign_keys=[act_id])

class AuditLog(Base):
    __tablename__ = "audit_log"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    entity_type = Column(String, nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    action = Column(String, nullable=False)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="audit_logs")
