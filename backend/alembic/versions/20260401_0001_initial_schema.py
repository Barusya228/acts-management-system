"""initial schema

Revision ID: 20260401_0001
Revises:
Create Date: 2026-04-01 15:06:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260401_0001"
down_revision = None
branch_labels = None
depends_on = None


user_role_enum = postgresql.ENUM("ADMIN", "STAFF", name="userrole", create_type=False)
act_status_enum = postgresql.ENUM(
    "DRAFT",
    "SIGNED_PARTY1",
    "SIGNED_PARTY2",
    "COMPLETED",
    name="actstatus",
    create_type=False,
)
file_asset_kind_enum = postgresql.ENUM(
    "PDF",
    "SIGNATURE_PARTY1",
    "SIGNATURE_PARTY2",
    name="fileassetkind",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    user_role_enum.create(bind, checkfirst=True)
    act_status_enum.create(bind, checkfirst=True)
    file_asset_kind_enum.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", user_role_enum, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("schema_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_templates_code"), "templates", ["code"], unique=True)

    op.create_table(
        "acts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("party1_name", sa.String(), nullable=False),
        sa.Column("party2_name", sa.String(), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("item_name", sa.String(), nullable=False),
        sa.Column("item_serial", sa.String(), nullable=True),
        sa.Column("receiver_email", sa.String(), nullable=False),
        sa.Column("status", act_status_enum, nullable=False),
        sa.Column("current_version", sa.Integer(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["template_id"], ["templates.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "file_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("act_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("kind", file_asset_kind_enum, nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["act_id"], ["acts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "act_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("act_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("data_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("pdf_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("change_note", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["act_id"], ["acts.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["pdf_file_id"], ["file_assets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("act_versions")
    op.drop_table("file_assets")
    op.drop_table("acts")
    op.drop_index(op.f("ix_templates_code"), table_name="templates")
    op.drop_table("templates")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    bind = op.get_bind()
    file_asset_kind_enum.drop(bind, checkfirst=True)
    act_status_enum.drop(bind, checkfirst=True)
    user_role_enum.drop(bind, checkfirst=True)
