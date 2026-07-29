"""add email outbox and audit indexes

Revision ID: 20260729_0017
Revises: 20260729_0016
Create Date: 2026-07-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260729_0017"
down_revision = "20260729_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])
    op.create_index("ix_audit_log_entity_created", "audit_log", ["entity_type", "entity_id", "created_at"])
    op.create_index("ix_audit_log_user_created", "audit_log", ["user_id", "created_at"])
    op.create_table(
        "email_outbox",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("act_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("recipient_email", sa.String(), nullable=False),
        sa.Column("recipient_name", sa.String(), nullable=True),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("attachment_storage_path", sa.String(), nullable=True),
        sa.Column("dedupe_key", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="PENDING"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("locked_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["act_id"], ["acts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_outbox_act_id", "email_outbox", ["act_id"])
    op.create_index("ix_email_outbox_kind", "email_outbox", ["kind"])
    op.create_index("ix_email_outbox_dedupe_key", "email_outbox", ["dedupe_key"], unique=True)
    op.create_index("ix_email_outbox_status", "email_outbox", ["status"])
    op.create_index("ix_email_outbox_next_attempt_at", "email_outbox", ["next_attempt_at"])
    op.create_index("ix_email_outbox_due", "email_outbox", ["status", "next_attempt_at"])


def downgrade() -> None:
    op.drop_table("email_outbox")
    op.drop_index("ix_audit_log_user_created", table_name="audit_log")
    op.drop_index("ix_audit_log_entity_created", table_name="audit_log")
    op.drop_index("ix_audit_log_created_at", table_name="audit_log")
