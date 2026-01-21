from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.core.db.base import Base


class ActVersion(Base):
    __tablename__ = "act_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    act_id = Column(UUID(as_uuid=True), ForeignKey("acts.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    data_json = Column(JSON, nullable=False)
    pdf_file_id = Column(UUID(as_uuid=True), ForeignKey("file_assets.id"), nullable=True)
    change_note = Column(String, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    act = relationship("Act", back_populates="versions")
    creator = relationship("User", foreign_keys=[created_by])
    pdf_file = relationship("FileAsset", foreign_keys=[pdf_file_id])

