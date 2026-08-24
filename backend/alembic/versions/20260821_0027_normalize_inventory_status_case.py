"""normalize legacy inventory device status casing

Revision ID: 20260821_0027
Revises: 20260811_0026
Create Date: 2026-08-21
"""

from alembic import op


revision = "20260821_0027"
down_revision = "20260811_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Early versions stored enum names (AVAILABLE); the current model stores
    # enum values (available). Normalize in place so no inventory is lost.
    op.execute(
        """
        UPDATE inventory_devices
        SET status = lower(status)
        WHERE status IN (
            'AVAILABLE', 'RESERVED', 'ISSUED',
            'PAPER_ISSUED', 'MAINTENANCE', 'RETIRED'
        )
        """
    )


def downgrade() -> None:
    # Data normalization is intentionally not reversed.
    pass
