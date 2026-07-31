"""allow duplicate ipad tags

Revision ID: 20260730_0021
Revises: 20260730_0020
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa


revision = "20260730_0021"
down_revision = "20260730_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(
        "uq_ipad_student_assignments_active_tag",
        table_name="ipad_student_assignments",
    )
    op.drop_index("ix_ipad_devices_tag", table_name="ipad_devices")
    op.drop_constraint("ipad_devices_tag_key", "ipad_devices", type_="unique")
    op.create_index("ix_ipad_devices_tag", "ipad_devices", ["tag"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ipad_devices_tag", table_name="ipad_devices")
    op.create_unique_constraint("ipad_devices_tag_key", "ipad_devices", ["tag"])
    op.create_index("ix_ipad_devices_tag", "ipad_devices", ["tag"], unique=True)
    op.create_index(
        "uq_ipad_student_assignments_active_tag",
        "ipad_student_assignments",
        ["ipad_tag"],
        unique=True,
        postgresql_where=sa.text("status IN ('RESERVED', 'ISSUED', 'RETURN_PENDING')"),
    )
