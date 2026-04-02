"""add return signature file kinds

Revision ID: 20260402_0005
Revises: 20260402_0004
Create Date: 2026-04-02 11:45:00
"""

from alembic import op


revision = "20260402_0005"
down_revision = "20260402_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE fileassetkind ADD VALUE IF NOT EXISTS 'RETURN_SIGNATURE_PARTY1'")
    op.execute("ALTER TYPE fileassetkind ADD VALUE IF NOT EXISTS 'RETURN_SIGNATURE_PARTY2'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be safely removed in-place.
    pass
