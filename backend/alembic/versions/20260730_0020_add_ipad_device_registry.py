"""add ipad device registry

Revision ID: 20260730_0020
Revises: 20260730_0019
Create Date: 2026-07-30
"""

import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260730_0020"
down_revision = "20260730_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ipad_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_name", sa.String(), nullable=False, server_default="iPad"),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("tag", sa.String(), nullable=False),
        sa.Column("serial_number", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="AVAILABLE"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tag"),
        sa.UniqueConstraint("serial_number"),
    )
    op.create_index("ix_ipad_devices_model", "ipad_devices", ["model"])
    op.create_index("ix_ipad_devices_tag", "ipad_devices", ["tag"], unique=True)
    op.create_index("ix_ipad_devices_serial_number", "ipad_devices", ["serial_number"], unique=True)
    op.create_index("ix_ipad_devices_status", "ipad_devices", ["status"])
    op.add_column("ipad_student_assignments", sa.Column("ipad_device_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_ipad_student_assignments_device", "ipad_student_assignments", "ipad_devices", ["ipad_device_id"], ["id"])
    op.create_index("ix_ipad_student_assignments_ipad_device_id", "ipad_student_assignments", ["ipad_device_id"])

    connection = op.get_bind()
    rows = connection.execute(sa.text("""
        SELECT DISTINCT ON (ipad_tag) ipad_tag, ipad_name, ipad_model, serial_number, status
        FROM ipad_student_assignments
        WHERE ipad_tag IS NOT NULL AND ipad_tag <> ''
        ORDER BY ipad_tag, assigned_at DESC
    """)).mappings().all()
    for row in rows:
        device_id = uuid.uuid4()
        serial_number = row["serial_number"] or row["ipad_tag"]
        device_status = {
            "RESERVED": "RESERVED",
            "ISSUED": "ISSUED",
            "RETURN_PENDING": "RETURN_PENDING",
            "RETURNED": "AVAILABLE",
        }.get(row["status"], "AVAILABLE")
        connection.execute(sa.text("""
            INSERT INTO ipad_devices (id, device_name, model, tag, serial_number, status, created_at, updated_at)
            VALUES (:id, :device_name, :model, :tag, :serial_number, :status, now(), now())
        """), {
            "id": device_id,
            "device_name": row["ipad_name"] or "iPad",
            "model": row["ipad_model"],
            "tag": row["ipad_tag"],
            "serial_number": serial_number,
            "status": device_status,
        })
        connection.execute(sa.text("""
            UPDATE ipad_student_assignments SET ipad_device_id = :device_id WHERE ipad_tag = :tag
        """), {"device_id": device_id, "tag": row["ipad_tag"]})


def downgrade() -> None:
    op.drop_index("ix_ipad_student_assignments_ipad_device_id", table_name="ipad_student_assignments")
    op.drop_constraint("fk_ipad_student_assignments_device", "ipad_student_assignments", type_="foreignkey")
    op.drop_column("ipad_student_assignments", "ipad_device_id")
    op.drop_table("ipad_devices")
