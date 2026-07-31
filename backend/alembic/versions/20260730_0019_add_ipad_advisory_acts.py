"""add dedicated ipad advisory acts

Revision ID: 20260730_0019
Revises: 20260730_0018
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260730_0019"
down_revision = "20260730_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ipad_advisory_acts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("act_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("advisory_group", sa.String(), nullable=False),
        sa.Column("academic_year", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["act_id"], ["acts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("act_id"),
    )
    op.create_index("ix_ipad_advisory_acts_act_id", "ipad_advisory_acts", ["act_id"], unique=True)
    op.create_index("ix_ipad_advisory_acts_advisory_group", "ipad_advisory_acts", ["advisory_group"])
    op.create_index("ix_ipad_advisory_acts_academic_year", "ipad_advisory_acts", ["academic_year"])
    op.create_table(
        "ipad_student_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("act_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("student_name", sa.String(), nullable=False),
        sa.Column("student_status", sa.String(), nullable=False, server_default="ACTIVE"),
        sa.Column("ipad_name", sa.String(), nullable=False, server_default="iPad"),
        sa.Column("ipad_model", sa.String(), nullable=True),
        sa.Column("ipad_tag", sa.String(), nullable=False),
        sa.Column("serial_number", sa.String(), nullable=True),
        sa.Column("imei", sa.String(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="RESERVED"),
        sa.Column("assigned_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("returned_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["act_id"], ["acts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ipad_student_assignments_act_id", "ipad_student_assignments", ["act_id"])
    op.create_index("ix_ipad_student_assignments_student_name", "ipad_student_assignments", ["student_name"])
    op.create_index("ix_ipad_student_assignments_student_status", "ipad_student_assignments", ["student_status"])
    op.create_index("ix_ipad_student_assignments_ipad_tag", "ipad_student_assignments", ["ipad_tag"])
    op.create_index("ix_ipad_student_assignments_status", "ipad_student_assignments", ["status"])
    op.create_index("uq_ipad_student_assignments_active_tag", "ipad_student_assignments", ["ipad_tag"], unique=True, postgresql_where=sa.text("status IN ('RESERVED', 'ISSUED', 'RETURN_PENDING')"))
    op.create_table(
        "ipad_assignment_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assignment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("data_json", sa.JSON(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["assignment_id"], ["ipad_student_assignments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ipad_assignment_events_assignment_id", "ipad_assignment_events", ["assignment_id"])
    op.create_index("ix_ipad_assignment_events_event_type", "ipad_assignment_events", ["event_type"])


def downgrade() -> None:
    op.drop_table("ipad_assignment_events")
    op.drop_table("ipad_student_assignments")
    op.drop_table("ipad_advisory_acts")
