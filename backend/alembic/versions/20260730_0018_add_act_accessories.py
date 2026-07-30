"""add manual act accessories

Revision ID: 20260730_0018
Revises: 20260729_0017
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260730_0018"
down_revision = "20260729_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "act_accessories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("act_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("requires_return", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("status", sa.String(), nullable=False, server_default="RESERVED"),
        sa.Column("recipient_name", sa.String(), nullable=False),
        sa.Column("reserved_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("issued_at", sa.DateTime(), nullable=True),
        sa.Column("returned_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("quantity > 0", name="ck_act_accessories_quantity_positive"),
        sa.ForeignKeyConstraint(["act_id"], ["acts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_act_accessories_act_id", "act_accessories", ["act_id"])
    op.create_index("ix_act_accessories_status", "act_accessories", ["status"])
    op.create_index("ix_act_accessories_recipient_name", "act_accessories", ["recipient_name"])


def downgrade() -> None:
    op.drop_table("act_accessories")
