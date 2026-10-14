"""archive ipad devices missing from registry sync

Revision ID: 20260914_0029
Revises: 20260831_0028
Create Date: 2026-09-14
"""

from alembic import op
import sqlalchemy as sa


revision = "20260914_0029"
down_revision = "20260831_0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ipad_devices",
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_ipad_devices_is_archived", "ipad_devices", ["is_archived"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ipad_devices_is_archived", table_name="ipad_devices")
    op.drop_column("ipad_devices", "is_archived")
