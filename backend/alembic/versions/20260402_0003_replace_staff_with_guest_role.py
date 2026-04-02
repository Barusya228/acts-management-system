"""replace STAFF role with GUEST

Revision ID: 20260402_0003
Revises: 20260401_0002
Create Date: 2026-04-02 10:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_0003"
down_revision = "20260401_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE text USING role::text")
    op.execute("CREATE TYPE userrole AS ENUM ('ADMIN', 'GUEST')")
    op.execute("UPDATE users SET role='GUEST' WHERE role='STAFF'")
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::text::userrole"
    )
    op.execute("DROP TYPE userrole_old")


def downgrade() -> None:
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE text USING role::text")
    op.execute("CREATE TYPE userrole AS ENUM ('ADMIN', 'STAFF')")
    op.execute("UPDATE users SET role='STAFF' WHERE role='GUEST'")
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::text::userrole"
    )
    op.execute("DROP TYPE userrole_old")
