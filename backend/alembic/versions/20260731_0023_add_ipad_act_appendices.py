"""add signed ipad act appendices

Revision ID: 20260731_0023
Revises: 20260730_0022
Create Date: 2026-07-31
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260731_0023"
down_revision = "20260730_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ipad_act_appendices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("act_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("appendix_number", sa.Integer(), nullable=False),
        sa.Column("operation_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="WAITING_RESPONSIBLE"),
        sa.Column("responsible_participant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("issuer_participant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("responsible_signed_at", sa.DateTime(), nullable=True),
        sa.Column("responsible_signature_path", sa.String(), nullable=True),
        sa.Column("issuer_signed_at", sa.DateTime(), nullable=True),
        sa.Column("issuer_signature_path", sa.String(), nullable=True),
        sa.Column("pdf_storage_path", sa.String(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["act_id"], ["acts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["responsible_participant_id"], ["participants.id"]),
        sa.ForeignKeyConstraint(["issuer_participant_id"], ["participants.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("act_id", "appendix_number", name="uq_ipad_appendices_act_number"),
    )
    op.create_index("ix_ipad_act_appendices_act_id", "ipad_act_appendices", ["act_id"])
    op.create_index("ix_ipad_act_appendices_operation_type", "ipad_act_appendices", ["operation_type"])
    op.create_index("ix_ipad_act_appendices_status", "ipad_act_appendices", ["status"])


def downgrade() -> None:
    op.drop_table("ipad_act_appendices")
