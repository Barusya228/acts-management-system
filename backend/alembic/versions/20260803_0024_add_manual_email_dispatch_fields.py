"""add manual email dispatch fields

Revision ID: 20260803_0024
Revises: 20260731_0023
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260803_0024"
down_revision = "20260731_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("email_outbox", sa.Column("dispatch_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("email_outbox", sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("email_outbox", sa.Column("document_version", sa.Integer(), nullable=True))
    op.add_column("email_outbox", sa.Column("custom_message", sa.Text(), nullable=True))
    op.create_foreign_key("fk_email_outbox_requested_by", "email_outbox", "users", ["requested_by"], ["id"])
    op.create_index("ix_email_outbox_dispatch_id", "email_outbox", ["dispatch_id"])
    op.create_index("ix_email_outbox_requested_by", "email_outbox", ["requested_by"])
    op.execute(
        "UPDATE email_outbox SET status = 'CANCELLED', locked_at = NULL "
        "WHERE dispatch_id IS NULL AND status IN ('PENDING', 'PROCESSING') "
        "AND kind IN ('ACT_CREATED', 'ISSUE_COMPLETED', 'RETURN_COMPLETED')"
    )


def downgrade() -> None:
    op.drop_index("ix_email_outbox_requested_by", table_name="email_outbox")
    op.drop_index("ix_email_outbox_dispatch_id", table_name="email_outbox")
    op.drop_constraint("fk_email_outbox_requested_by", "email_outbox", type_="foreignkey")
    op.drop_column("email_outbox", "custom_message")
    op.drop_column("email_outbox", "document_version")
    op.drop_column("email_outbox", "requested_by")
    op.drop_column("email_outbox", "dispatch_id")
