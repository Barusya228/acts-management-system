"""Initial migration

Revision ID: 001
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('email', sa.String(), nullable=False, unique=True, index=True),
        sa.Column('full_name', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=False),
        sa.Column('role', sa.Enum('ADMIN', 'STAFF', name='userrole'), nullable=False, server_default='STAFF'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()'))
    )

    # Templates table
    op.create_table(
        'templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('code', sa.String(), nullable=False, index=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String()),
        sa.Column('schema_json', postgresql.JSONB(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()'))
    )

    # Acts table
    op.create_table(
        'acts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('template_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('templates.id'), nullable=False),
        sa.Column('party1_name', sa.String(), nullable=False),
        sa.Column('party2_name', sa.String(), nullable=False),
        sa.Column('issue_date', sa.DateTime(), nullable=False),
        sa.Column('item_name', sa.String(), nullable=False),
        sa.Column('receiver_email', sa.String(), nullable=False),
        sa.Column('status', sa.Enum('DRAFT', 'SIGNED_PARTY1', 'SIGNED_PARTY2', 'COMPLETED', name='actstatus'), nullable=False, server_default='DRAFT'),
        sa.Column('current_version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()'))
    )

    # File assets table
    op.create_table(
        'file_assets',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('act_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('acts.id'), nullable=True),
        sa.Column('kind', sa.Enum('PDF', 'SIGNATURE_PARTY1', 'SIGNATURE_PARTY2', name='filekind'), nullable=False),
        sa.Column('storage_path', sa.String(), nullable=False),
        sa.Column('mime_type', sa.String(), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('sha256', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()'))
    )

    # Act versions table
    op.create_table(
        'act_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('act_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('acts.id'), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('data_json', postgresql.JSONB(), nullable=False),
        sa.Column('pdf_file_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('file_assets.id'), nullable=True),
        sa.Column('change_note', sa.String(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()'))
    )

    # Audit log table
    op.create_table(
        'audit_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('entity_type', sa.String(), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('metadata_json', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()'))
    )


def downgrade() -> None:
    op.drop_table('audit_log')
    op.drop_table('act_versions')
    op.drop_table('file_assets')
    op.drop_table('acts')
    op.drop_table('templates')
    op.drop_table('users')
    sa.Enum(name='actstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='filekind').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='userrole').drop(op.get_bind(), checkfirst=True)

