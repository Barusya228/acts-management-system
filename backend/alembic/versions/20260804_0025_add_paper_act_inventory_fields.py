"""add paper act inventory fields

Revision ID: 20260804_0025
Revises: 20260803_0024
Create Date: 2026-08-04
"""

from alembic import op
import sqlalchemy as sa


revision = "20260804_0025"
down_revision = "20260803_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inventory_devices", sa.Column("paper_act_number", sa.String(), nullable=True))
    op.add_column("inventory_devices", sa.Column("paper_issue_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory_devices", "paper_issue_date")
    op.drop_column("inventory_devices", "paper_act_number")
