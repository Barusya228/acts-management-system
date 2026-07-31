"""add reusable small equipment catalog

Revision ID: 20260730_0022
Revises: 20260730_0021
Create Date: 2026-07-30
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260730_0022"
down_revision = "20260730_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "small_equipment_catalog",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", "model", name="uq_small_equipment_catalog_name_model"),
    )
    op.create_index("ix_small_equipment_catalog_name", "small_equipment_catalog", ["name"])
    op.create_index("ix_small_equipment_catalog_is_active", "small_equipment_catalog", ["is_active"])
    op.add_column("act_accessories", sa.Column("catalog_item_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_act_accessories_catalog_item", "act_accessories", "small_equipment_catalog", ["catalog_item_id"], ["id"])
    op.create_index("ix_act_accessories_catalog_item_id", "act_accessories", ["catalog_item_id"])

    connection = op.get_bind()
    rows = connection.execute(sa.text("""
        SELECT DISTINCT name, COALESCE(model, '') AS model FROM act_accessories
    """)).mappings().all()
    for row in rows:
        item_id = uuid.uuid4()
        connection.execute(sa.text("""
            INSERT INTO small_equipment_catalog (id, name, model, is_active, created_at, updated_at)
            VALUES (:id, :name, :model, true, now(), now())
            ON CONFLICT (name, model) DO NOTHING
        """), {"id": item_id, "name": row["name"], "model": row["model"]})
    connection.execute(sa.text("""
        UPDATE act_accessories AS item
        SET catalog_item_id = catalog.id,
            requires_return = true
        FROM small_equipment_catalog AS catalog
        WHERE item.name = catalog.name AND COALESCE(item.model, '') = catalog.model
    """))


def downgrade() -> None:
    op.drop_index("ix_act_accessories_catalog_item_id", table_name="act_accessories")
    op.drop_constraint("fk_act_accessories_catalog_item", "act_accessories", type_="foreignkey")
    op.drop_column("act_accessories", "catalog_item_id")
    op.drop_table("small_equipment_catalog")
