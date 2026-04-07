"""add pdf version to templates

Revision ID: 20260402_0008
Revises: 20260402_0007
Create Date: 2026-04-02 17:20:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_0008"
down_revision = "20260402_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "templates",
        sa.Column("pdf_version", sa.Integer(), nullable=False, server_default=sa.text("2")),
    )


def downgrade() -> None:
    op.drop_column("templates", "pdf_version")
