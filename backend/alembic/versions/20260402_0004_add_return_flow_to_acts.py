"""add return flow to acts

Revision ID: 20260402_0004
Revises: 20260402_0003
Create Date: 2026-04-02 11:15:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260402_0004"
down_revision = "20260402_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE actstatus RENAME TO actstatus_old")
    op.execute(
        "CREATE TYPE actstatus AS ENUM ('DRAFT', 'SIGNED_PARTY1', 'SIGNED_PARTY2', 'COMPLETED', 'RETURN_INITIATED', 'RETURN_SIGNED_PARTY1', 'RETURN_SIGNED_PARTY2', 'RETURNED')"
    )
    op.execute("ALTER TABLE acts ALTER COLUMN status TYPE text USING status::text")
    op.execute("ALTER TABLE acts ALTER COLUMN status TYPE actstatus USING status::text::actstatus")
    op.execute("DROP TYPE actstatus_old")

    op.add_column("acts", sa.Column("return_date", sa.Date(), nullable=True))
    op.add_column("acts", sa.Column("return_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("acts", "return_note")
    op.drop_column("acts", "return_date")

    op.execute("ALTER TYPE actstatus RENAME TO actstatus_old")
    op.execute(
        "CREATE TYPE actstatus AS ENUM ('DRAFT', 'SIGNED_PARTY1', 'SIGNED_PARTY2', 'COMPLETED')"
    )
    op.execute("ALTER TABLE acts ALTER COLUMN status TYPE text USING status::text")
    op.execute(
        "UPDATE acts SET status='COMPLETED' WHERE status IN ('RETURN_INITIATED', 'RETURN_SIGNED_PARTY1', 'RETURN_SIGNED_PARTY2', 'RETURNED')"
    )
    op.execute("ALTER TABLE acts ALTER COLUMN status TYPE actstatus USING status::text::actstatus")
    op.execute("DROP TYPE actstatus_old")
