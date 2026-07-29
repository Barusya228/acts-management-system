"""add inventory categories

Revision ID: 20260728_0013
Revises: 20260728_0012
Create Date: 2026-07-28
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260728_0013"
down_revision = "20260728_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    categories = op.create_table(
        "inventory_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("icon", sa.String(), nullable=False, server_default="📦"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_categories_code", "inventory_categories", ["code"], unique=True)
    default_categories = [
        {"id": uuid.uuid4(), "code": "notebook", "name": "Ноутбук", "icon": "💻", "is_active": True, "is_system": True},
        {"id": uuid.uuid4(), "code": "monitor", "name": "Монитор", "icon": "🖥️", "is_active": True, "is_system": True},
        {"id": uuid.uuid4(), "code": "tablet", "name": "Планшет", "icon": "📱", "is_active": True, "is_system": True},
        {"id": uuid.uuid4(), "code": "phone", "name": "Телефон", "icon": "📱", "is_active": True, "is_system": True},
        {"id": uuid.uuid4(), "code": "printer", "name": "Принтер", "icon": "🖨️", "is_active": True, "is_system": True},
        {"id": uuid.uuid4(), "code": "keyboard", "name": "Клавиатура", "icon": "⌨️", "is_active": True, "is_system": True},
        {"id": uuid.uuid4(), "code": "mouse", "name": "Мышь", "icon": "🖱️", "is_active": True, "is_system": True},
        {"id": uuid.uuid4(), "code": "extension", "name": "Удлинитель", "icon": "🔌", "is_active": True, "is_system": True},
        {"id": uuid.uuid4(), "code": "other", "name": "Другое", "icon": "📦", "is_active": True, "is_system": True},
    ]
    op.bulk_insert(categories, default_categories)

    default_codes = {category["code"] for category in default_categories}
    existing_codes = op.get_bind().execute(
        sa.text("SELECT DISTINCT category FROM inventory_devices WHERE category IS NOT NULL AND category <> ''")
    ).scalars().all()
    custom_categories = [
        {
            "id": uuid.uuid4(),
            "code": code,
            "name": code.replace("-", " ").replace("_", " ").title(),
            "icon": "📦",
            "is_active": True,
            "is_system": False,
        }
        for code in existing_codes
        if code not in default_codes
    ]
    if custom_categories:
        op.bulk_insert(categories, custom_categories)


def downgrade() -> None:
    op.drop_table("inventory_categories")
