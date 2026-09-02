"""add custom inventory statuses and ipad operation options

Revision ID: 20260831_0028
Revises: 20260821_0027
Create Date: 2026-08-31
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260831_0028"
down_revision = "20260821_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventory_statuses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_statuses_code", "inventory_statuses", ["code"], unique=True)

    op.create_table(
        "ipad_operation_options",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("option_type", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("option_type", "name", name="uq_ipad_operation_options_type_name"),
    )
    op.create_index("ix_ipad_operation_options_code", "ipad_operation_options", ["code"], unique=True)
    op.create_index("ix_ipad_operation_options_option_type", "ipad_operation_options", ["option_type"], unique=False)


def downgrade() -> None:
    op.drop_table("ipad_operation_options")
    op.drop_table("inventory_statuses")
