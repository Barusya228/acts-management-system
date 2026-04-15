"""remove external backup fields from file assets

Revision ID: 20260414_0006
Revises: 20260414_0005
Create Date: 2026-04-14 13:35:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260414_0006"
down_revision = "20260414_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("file_assets", "external_uploaded_at")
    op.drop_column("file_assets", "external_web_url")
    op.drop_column("file_assets", "external_file_id")
    op.drop_column("file_assets", "external_provider")


def downgrade() -> None:
    op.add_column("file_assets", sa.Column("external_provider", sa.String(), nullable=True))
    op.add_column("file_assets", sa.Column("external_file_id", sa.String(), nullable=True))
    op.add_column("file_assets", sa.Column("external_web_url", sa.String(), nullable=True))
    op.add_column("file_assets", sa.Column("external_uploaded_at", sa.DateTime(), nullable=True))
