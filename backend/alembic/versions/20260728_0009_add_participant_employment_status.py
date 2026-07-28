"""add participant employment status

Revision ID: 20260728_0009
Revises: 20260701_0008
Create Date: 2026-07-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260728_0009"
down_revision = "20260701_0008"
branch_labels = None
depends_on = None


employment_status_enum = postgresql.ENUM(
    "ACTIVE",
    "DEPARTED",
    name="participantemploymentstatus",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    employment_status_enum.create(bind, checkfirst=True)
    op.add_column(
        "participants",
        sa.Column(
            "employment_status",
            employment_status_enum,
            nullable=False,
            server_default="ACTIVE",
        ),
    )
    op.alter_column("participants", "employment_status", server_default=None)
    op.create_index(
        "ix_participants_employment_status",
        "participants",
        ["employment_status"],
    )


def downgrade() -> None:
    op.drop_index("ix_participants_employment_status", table_name="participants")
    op.drop_column("participants", "employment_status")
    employment_status_enum.drop(op.get_bind(), checkfirst=True)
