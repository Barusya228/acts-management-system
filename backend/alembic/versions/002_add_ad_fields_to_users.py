"""Add AD sync fields to users table

Revision ID: 002
Revises: 001
Create Date: 2025-01-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('ad_guid', sa.String(), nullable=True))
    op.create_index('ix_users_ad_guid', 'users', ['ad_guid'], unique=True)
    op.add_column('users', sa.Column('department', sa.String(), nullable=True))
    op.add_column('users', sa.Column('position', sa.String(), nullable=True))
    op.add_column('users', sa.Column('last_synced_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_index('ix_users_ad_guid', table_name='users')
    op.drop_column('users', 'last_synced_at')
    op.drop_column('users', 'position')
    op.drop_column('users', 'department')
    op.drop_column('users', 'ad_guid')
