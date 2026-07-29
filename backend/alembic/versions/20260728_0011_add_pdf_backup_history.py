"""add PDF backup history

Revision ID: 20260728_0011
Revises: 20260728_0010
Create Date: 2026-07-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260728_0011"
down_revision = "20260728_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pdf_backup_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("file_asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("act_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("destination", sa.String(), nullable=False),
        sa.Column("backup_path", sa.String(), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pdf_backup_records_file_asset_id", "pdf_backup_records", ["file_asset_id"])
    op.create_index("ix_pdf_backup_records_act_id", "pdf_backup_records", ["act_id"])
    op.create_index("ix_pdf_backup_records_status", "pdf_backup_records", ["status"])
    op.create_index("ix_pdf_backup_records_created_at", "pdf_backup_records", ["created_at"])


def downgrade() -> None:
    op.drop_table("pdf_backup_records")
