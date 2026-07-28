"""sanitize participant emails

Revision ID: 20260728_0010
Revises: 20260728_0009
Create Date: 2026-07-28
"""

from alembic import op


revision = "20260728_0010"
down_revision = "20260728_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE participants
        SET email = NULL
        WHERE email IS NOT NULL
          AND email !~* '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
        """
    )


def downgrade() -> None:
    pass
