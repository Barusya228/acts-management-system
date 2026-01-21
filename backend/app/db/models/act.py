from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.core.db.base import Base
import enum


class ActStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SIGNED_PARTY1 = "SIGNED_PARTY1"
    SIGNED_PARTY2 = "SIGNED_PARTY2"
    COMPLETED = "COMPLETED"


class Act(Base):
    __tablename__ = "acts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("templates.id"), nullable=False)
    party1_name = Column(String, nullable=False)
    party2_name = Column(String, nullable=False)
    issue_date = Column(DateTime, nullable=False)
    item_name = Column(String, nullable=False)
    receiver_email = Column(String, nullable=False)
    status = Column(SQLEnum(ActStatus), default=ActStatus.DRAFT, nullable=False)
    current_version = Column(Integer, default=1, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    template = relationship("Template", backref="acts")
    creator = relationship("User", foreign_keys=[created_by])
    versions = relationship("ActVersion", back_populates="act", order_by="ActVersion.version_number")
    file_assets = relationship("FileAsset", back_populates="act")

