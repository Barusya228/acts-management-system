"""add sticker emoji to participants

Revision ID: 20260402_0007
Revises: 20260402_0006
Create Date: 2026-04-02 13:10:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_0007"
down_revision = "20260402_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("sticker_emoji", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "sticker_emoji")
