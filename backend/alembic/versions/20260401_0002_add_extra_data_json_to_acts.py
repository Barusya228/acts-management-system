"""add extra_data_json to acts

Revision ID: 20260401_0002
Revises: 20260401_0001
Create Date: 2026-04-01 17:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260401_0002"
down_revision = "20260401_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "acts",
        sa.Column("extra_data_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("acts", "extra_data_json")
