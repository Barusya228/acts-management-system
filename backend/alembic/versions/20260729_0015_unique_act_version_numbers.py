"""make act version numbers unique per act

Revision ID: 20260729_0015
Revises: 20260729_0014
Create Date: 2026-07-29
"""

from alembic import op


revision = "20260729_0015"
down_revision = "20260729_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_act_versions_act_id_version_number",
        "act_versions",
        ["act_id", "version_number"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_act_versions_act_id_version_number",
        "act_versions",
        type_="unique",
    )
