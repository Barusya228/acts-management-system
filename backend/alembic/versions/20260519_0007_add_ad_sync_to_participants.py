"""add ad sync fields to participants

Revision ID: 20260519_0007
Revises: 20260414_0006
Create Date: 2026-05-19 12:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = '20260519_0007'
down_revision = '20260414_0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('participants', sa.Column('ad_guid', sa.String(), nullable=True))
    op.create_index('ix_participants_ad_guid', 'participants', ['ad_guid'], unique=True)
    op.add_column('participants', sa.Column('last_synced_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_index('ix_participants_ad_guid', table_name='participants')
    op.drop_column('participants', 'last_synced_at')
    op.drop_column('participants', 'ad_guid')
