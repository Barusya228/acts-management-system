from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.core.db.base import Base
import enum


class FileKind(str, enum.Enum):
    PDF = "PDF"
    SIGNATURE_PARTY1 = "SIGNATURE_PARTY1"
    SIGNATURE_PARTY2 = "SIGNATURE_PARTY2"


class FileAsset(Base):
    __tablename__ = "file_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    act_id = Column(UUID(as_uuid=True), ForeignKey("acts.id"), nullable=True)
    kind = Column(SQLEnum(FileKind), nullable=False)
    storage_path = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    sha256 = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    act = relationship("Act", back_populates="file_assets")

