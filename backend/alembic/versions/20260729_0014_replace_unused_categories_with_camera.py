"""replace unused inventory categories with camera

Revision ID: 20260729_0014
Revises: 20260728_0013
Create Date: 2026-07-29
"""

import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260729_0014"
down_revision = "20260728_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    camera_exists = bind.execute(
        sa.text("SELECT 1 FROM inventory_categories WHERE code = 'camera'")
    ).scalar()
    if camera_exists:
        bind.execute(sa.text("""
            UPDATE inventory_categories
            SET name = 'Камера', icon = '📷', is_active = true, is_system = true
            WHERE code = 'camera'
        """))
    else:
        bind.execute(
            sa.text("""
                INSERT INTO inventory_categories (id, code, name, icon, is_active, is_system, created_at)
                VALUES (:id, 'camera', 'Камера', '📷', true, true, now())
            """),
            {"id": uuid.uuid4()},
        )

    bind.execute(sa.text("""
        UPDATE inventory_devices
        SET category = 'camera'
        WHERE category IN ('monitor', 'phone', 'printer')
    """))
    bind.execute(sa.text("""
        DELETE FROM inventory_categories
        WHERE code IN ('monitor', 'phone', 'printer')
    """))


def downgrade() -> None:
    bind = op.get_bind()
    defaults = [
        ("monitor", "Монитор", "🖥️"),
        ("phone", "Телефон", "📱"),
        ("printer", "Принтер", "🖨️"),
    ]
    for code, name, icon in defaults:
        exists = bind.execute(
            sa.text("SELECT 1 FROM inventory_categories WHERE code = :code"),
            {"code": code},
        ).scalar()
        if not exists:
            bind.execute(
                sa.text("""
                    INSERT INTO inventory_categories (id, code, name, icon, is_active, is_system, created_at)
                    VALUES (:id, :code, :name, :icon, true, true, now())
                """),
                {"id": uuid.uuid4(), "code": code, "name": name, "icon": icon},
            )
