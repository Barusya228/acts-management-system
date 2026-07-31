import uuid
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Integer, Date, Text, Enum as SQLEnum, JSON, UniqueConstraint, Index, text
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


class ParticipantEmploymentStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    DEPARTED = "DEPARTED"

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


class DeviceStatus(str, enum.Enum):
    AVAILABLE = "available"
    RESERVED = "reserved"
    ISSUED = "issued"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"


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
    employment_status = Column(
        SQLEnum(ParticipantEmploymentStatus),
        nullable=False,
        default=ParticipantEmploymentStatus.ACTIVE,
    )
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
    inventory_device_id = Column(UUID(as_uuid=True), ForeignKey("inventory_devices.id"), nullable=True)
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
    device_assignments = relationship("ActDeviceAssignment", back_populates="act", cascade="all, delete-orphan")
    accessories = relationship("ActAccessory", back_populates="act", cascade="all, delete-orphan")
    ipad_profile = relationship("IpadAdvisoryAct", back_populates="act", uselist=False, cascade="all, delete-orphan")
    ipad_assignments = relationship("IpadStudentAssignment", back_populates="act", cascade="all, delete-orphan")

class ActVersion(Base):
    __tablename__ = "act_versions"
    __table_args__ = (
        UniqueConstraint(
            "act_id",
            "version_number",
            name="uq_act_versions_act_id_version_number",
        ),
    )
    
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


class PdfBackupRecord(Base):
    __tablename__ = "pdf_backup_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_asset_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    act_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    destination = Column(String, nullable=False)
    backup_path = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    sha256 = Column(String, nullable=True)
    status = Column(String, nullable=False, index=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class EmailOutbox(Base):
    __tablename__ = "email_outbox"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    act_id = Column(UUID(as_uuid=True), ForeignKey("acts.id", ondelete="SET NULL"), nullable=True, index=True)
    kind = Column(String, nullable=False, index=True)
    recipient_email = Column(String, nullable=False)
    recipient_name = Column(String, nullable=True)
    subject = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    attachment_storage_path = Column(String, nullable=True)
    dedupe_key = Column(String, unique=True, nullable=False, index=True)
    status = Column(String, nullable=False, default="PENDING", index=True)
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    locked_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    sent_at = Column(DateTime, nullable=True)

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


class InventoryDevice(Base):
    __tablename__ = "inventory_devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inventory_number = Column(String, unique=True, nullable=False)
    barcode = Column(String, unique=True, nullable=True)
    name = Column(String, nullable=False)
    model = Column(String, nullable=True)
    category = Column(String, nullable=False)
    serial_number = Column(String, unique=True, nullable=False)
    status = Column(
        SQLEnum(
            DeviceStatus,
            values_callable=lambda enum_class: [item.value for item in enum_class],
            native_enum=False,
        ),
        nullable=False,
        default=DeviceStatus.AVAILABLE,
    )
    location = Column(String, nullable=True)
    assigned_to = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    assignments = relationship("ActDeviceAssignment", back_populates="device")


class ActDeviceAssignment(Base):
    __tablename__ = "act_device_assignments"
    __table_args__ = (
        UniqueConstraint("act_id", "device_id", name="uq_act_device_assignments_act_device"),
        Index(
            "uq_act_device_assignments_active_device",
            "device_id",
            unique=True,
            postgresql_where=text("status IN ('RESERVED', 'ISSUED')"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    act_id = Column(UUID(as_uuid=True), ForeignKey("acts.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(UUID(as_uuid=True), ForeignKey("inventory_devices.id"), nullable=False, index=True)
    assignment_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="RESERVED", index=True)
    recipient_name = Column(String, nullable=False)
    reserved_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    issued_at = Column(DateTime, nullable=True)
    returned_at = Column(DateTime, nullable=True)

    act = relationship("Act", back_populates="device_assignments")
    device = relationship("InventoryDevice", back_populates="assignments")


class ActAccessory(Base):
    __tablename__ = "act_accessories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    act_id = Column(UUID(as_uuid=True), ForeignKey("acts.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    model = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)
    note = Column(Text, nullable=True)
    requires_return = Column(Boolean, nullable=False, default=True)
    status = Column(String, nullable=False, default="RESERVED", index=True)
    recipient_name = Column(String, nullable=False, index=True)
    reserved_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    issued_at = Column(DateTime, nullable=True)
    returned_at = Column(DateTime, nullable=True)

    act = relationship("Act", back_populates="accessories")


class IpadAdvisoryAct(Base):
    __tablename__ = "ipad_advisory_acts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    act_id = Column(UUID(as_uuid=True), ForeignKey("acts.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    advisory_group = Column(String, nullable=False, index=True)
    academic_year = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    act = relationship("Act", back_populates="ipad_profile")


class IpadStudentAssignment(Base):
    __tablename__ = "ipad_student_assignments"
    __table_args__ = (
        Index(
            "uq_ipad_student_assignments_active_tag",
            "ipad_tag",
            unique=True,
            postgresql_where=text("status IN ('RESERVED', 'ISSUED', 'RETURN_PENDING')"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    act_id = Column(UUID(as_uuid=True), ForeignKey("acts.id", ondelete="CASCADE"), nullable=False, index=True)
    student_name = Column(String, nullable=False, index=True)
    student_status = Column(String, nullable=False, default="ACTIVE", index=True)
    ipad_name = Column(String, nullable=False, default="iPad")
    ipad_model = Column(String, nullable=True)
    ipad_tag = Column(String, nullable=False, index=True)
    serial_number = Column(String, nullable=True)
    imei = Column(String, nullable=True)
    note = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="RESERVED", index=True)
    assigned_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    returned_at = Column(DateTime, nullable=True)

    act = relationship("Act", back_populates="ipad_assignments")
    events = relationship("IpadAssignmentEvent", back_populates="assignment", cascade="all, delete-orphan")


class IpadAssignmentEvent(Base):
    __tablename__ = "ipad_assignment_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id = Column(UUID(as_uuid=True), ForeignKey("ipad_student_assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    data_json = Column(JSON, nullable=False)
    note = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    assignment = relationship("IpadStudentAssignment", back_populates="events")


class InventoryCategory(Base):
    __tablename__ = "inventory_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=False, default="📦")
    is_active = Column(Boolean, nullable=False, default=True)
    is_system = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
