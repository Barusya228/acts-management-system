"""add transactional act device assignments

Revision ID: 20260729_0016
Revises: 20260729_0015
Create Date: 2026-07-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid


revision = "20260729_0016"
down_revision = "20260729_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "acts",
        sa.Column("inventory_device_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_acts_inventory_device_id",
        "acts",
        "inventory_devices",
        ["inventory_device_id"],
        ["id"],
    )
    op.create_index("ix_acts_inventory_device_id", "acts", ["inventory_device_id"])

    op.create_table(
        "act_device_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("act_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assignment_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("recipient_name", sa.String(), nullable=False),
        sa.Column("reserved_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("issued_at", sa.DateTime(), nullable=True),
        sa.Column("returned_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["act_id"], ["acts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["device_id"], ["inventory_devices.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("act_id", "device_id", name="uq_act_device_assignments_act_device"),
    )
    op.create_index("ix_act_device_assignments_act_id", "act_device_assignments", ["act_id"])
    op.create_index("ix_act_device_assignments_device_id", "act_device_assignments", ["device_id"])
    op.create_index("ix_act_device_assignments_status", "act_device_assignments", ["status"])

    connection = op.get_bind()
    connection.execute(sa.text("""
        UPDATE acts AS act
        SET inventory_device_id = device.id
        FROM inventory_devices AS device
        WHERE act.item_serial = device.serial_number
    """))
    acts = connection.execute(sa.text("""
        SELECT id, inventory_device_id, status, party2_name, created_at, extra_data_json
        FROM acts
        ORDER BY created_at, id
    """)).mappings().all()
    devices = connection.execute(sa.text("""
        SELECT id, serial_number FROM inventory_devices
    """)).mappings().all()
    devices_by_serial = {row["serial_number"]: row["id"] for row in devices}
    active_statuses = {
        "DRAFT": "RESERVED",
        "SIGNED_PARTY1": "RESERVED",
        "SIGNED_PARTY2": "RESERVED",
        "COMPLETED": "ISSUED",
        "RETURN_INITIATED": "ISSUED",
        "RETURN_SIGNED_PARTY1": "ISSUED",
        "RETURN_SIGNED_PARTY2": "ISSUED",
    }
    assignments = []
    active_by_device = {}
    for act in acts:
        requested = []
        if act["inventory_device_id"]:
            requested.append((act["inventory_device_id"], "MAIN"))
        extra_data = act["extra_data_json"] if isinstance(act["extra_data_json"], dict) else {}
        equipment = extra_data.get("equipment_list") if isinstance(extra_data, dict) else None
        if isinstance(equipment, list):
            for item in equipment:
                if not isinstance(item, dict):
                    continue
                device_id = devices_by_serial.get(str(item.get("serial", "")).strip())
                if device_id:
                    requested.append((device_id, "ADDITIONAL"))

        seen = set()
        assignment_status = active_statuses.get(str(act["status"]), "RETURNED")
        for device_id, assignment_type in requested:
            if device_id in seen:
                continue
            seen.add(device_id)
            if assignment_status in {"RESERVED", "ISSUED"}:
                active_by_device.setdefault(device_id, []).append(act["id"])
            assignments.append({
                "id": uuid.uuid4(),
                "act_id": act["id"],
                "device_id": device_id,
                "assignment_type": assignment_type,
                "status": assignment_status,
                "recipient_name": act["party2_name"],
                "reserved_at": act["created_at"],
            })

    conflicts = {device_id: act_ids for device_id, act_ids in active_by_device.items() if len(act_ids) > 1}
    if conflicts:
        details = "; ".join(
            f"device {device_id}: {', '.join(str(act_id) for act_id in act_ids)}"
            for device_id, act_ids in conflicts.items()
        )
        raise RuntimeError(f"Active inventory assignment conflicts must be resolved: {details}")

    if assignments:
        assignment_table = sa.table(
            "act_device_assignments",
            sa.column("id", postgresql.UUID(as_uuid=True)),
            sa.column("act_id", postgresql.UUID(as_uuid=True)),
            sa.column("device_id", postgresql.UUID(as_uuid=True)),
            sa.column("assignment_type", sa.String()),
            sa.column("status", sa.String()),
            sa.column("recipient_name", sa.String()),
            sa.column("reserved_at", sa.DateTime()),
        )
        op.bulk_insert(assignment_table, assignments)
        connection.execute(sa.text("""
            UPDATE inventory_devices AS device
            SET status = CASE assignment.status
                    WHEN 'RESERVED' THEN 'reserved'
                    ELSE 'issued'
                END,
                assigned_to = assignment.recipient_name
            FROM act_device_assignments AS assignment
            WHERE assignment.device_id = device.id
              AND assignment.status IN ('RESERVED', 'ISSUED')
        """))

    op.create_index(
        "uq_act_device_assignments_active_device",
        "act_device_assignments",
        ["device_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('RESERVED', 'ISSUED')"),
    )


def downgrade() -> None:
    op.drop_table("act_device_assignments")
    op.drop_index("ix_acts_inventory_device_id", table_name="acts")
    op.drop_constraint("fk_acts_inventory_device_id", "acts", type_="foreignkey")
    op.drop_column("acts", "inventory_device_id")
