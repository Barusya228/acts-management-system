"""add kiosk devices for trusted signing tablets

Revision ID: 20260811_0026
Revises: 20260804_0025
Create Date: 2026-08-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260811_0026"
down_revision = "20260804_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "kiosk_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="PENDING"),
        sa.Column("enrollment_code", sa.String(), nullable=True),
        sa.Column("enrollment_expires_at", sa.DateTime(), nullable=True),
        sa.Column("enrolled_at", sa.DateTime(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_kiosk_devices_status", "kiosk_devices", ["status"])
    op.create_index("ix_kiosk_devices_enrollment_code", "kiosk_devices", ["enrollment_code"])


def downgrade() -> None:
    op.drop_table("kiosk_devices")
