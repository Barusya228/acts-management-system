"""add act email delivery flags

Revision ID: 20260409_0003
Revises: 20260406_0002
Create Date: 2026-04-09 12:20:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260409_0003"
down_revision = "20260406_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "acts",
        sa.Column("issue_completion_email_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "acts",
        sa.Column("return_completion_email_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.alter_column("acts", "issue_completion_email_sent", server_default=None)
    op.alter_column("acts", "return_completion_email_sent", server_default=None)


def downgrade() -> None:
    op.drop_column("acts", "return_completion_email_sent")
    op.drop_column("acts", "issue_completion_email_sent")
