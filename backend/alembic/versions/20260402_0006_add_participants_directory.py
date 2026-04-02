"""add participants directory

Revision ID: 20260402_0006
Revises: 20260402_0005
Create Date: 2026-04-02 12:40:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260402_0006"
down_revision = "20260402_0005"
branch_labels = None
depends_on = None


participant_kind_enum = postgresql.ENUM("IT_MANAGER", "EMPLOYEE", name="participantkind", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    participant_kind_enum.create(bind, checkfirst=True)

    op.create_table(
        "participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("department", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("kind", participant_kind_enum, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )
    op.create_index(op.f("ix_participants_email"), "participants", ["email"], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_participants_email"), table_name="participants")
    op.drop_table("participants")
    bind = op.get_bind()
    participant_kind_enum.drop(bind, checkfirst=True)
