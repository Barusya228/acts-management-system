"""add inventory devices table"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '20260701_0008'
down_revision: Union[str, None] = '20260519_0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'inventory_devices',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('inventory_number', sa.String(), nullable=False),
        sa.Column('barcode', sa.String(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('model', sa.String(), nullable=True),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('serial_number', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='available'),
        sa.Column('location', sa.String(), nullable=True),
        sa.Column('assigned_to', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    )
    op.create_unique_constraint('uq_inventory_devices_inventory_number', 'inventory_devices', ['inventory_number'])
    op.create_unique_constraint('uq_inventory_devices_barcode', 'inventory_devices', ['barcode'])
    op.create_unique_constraint('uq_inventory_devices_serial_number', 'inventory_devices', ['serial_number'])
    op.create_index('ix_inventory_devices_category', 'inventory_devices', ['category'])
    op.create_index('ix_inventory_devices_status', 'inventory_devices', ['status'])


def downgrade() -> None:
    op.drop_table('inventory_devices')
