"""add PDF backup success constraint

Revision ID: 20260728_0012
Revises: 20260728_0011
Create Date: 2026-07-28
"""

from alembic import op
import sqlalchemy as sa


revision = "20260728_0012"
down_revision = "20260728_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE pdf_backup_records AS duplicate
        SET status = 'STALE'
        WHERE duplicate.status = 'SUCCESS'
          AND EXISTS (
            SELECT 1
            FROM pdf_backup_records AS newer
            WHERE newer.file_asset_id = duplicate.file_asset_id
              AND newer.status = 'SUCCESS'
              AND (
                newer.created_at > duplicate.created_at
                OR (newer.created_at = duplicate.created_at AND newer.id::text > duplicate.id::text)
              )
          )
        """
    )
    op.create_index(
        "uq_pdf_backup_records_success_file_asset",
        "pdf_backup_records",
        ["file_asset_id"],
        unique=True,
        postgresql_where=sa.text("status = 'SUCCESS'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_pdf_backup_records_success_file_asset",
        table_name="pdf_backup_records",
    )
