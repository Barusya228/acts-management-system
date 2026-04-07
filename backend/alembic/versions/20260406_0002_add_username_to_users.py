"""add username to users

Revision ID: 20260406_0002
Revises: 20260402_0008
Create Date: 2026-04-06 06:45:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260406_0002"
down_revision = "20260402_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем колонку username (временно nullable)
    op.add_column('users', sa.Column('username', sa.String(), nullable=True))
    
    # Заполняем username из email (берем часть до @)
    op.execute("""
        UPDATE users 
        SET username = SPLIT_PART(email, '@', 1)
        WHERE username IS NULL
    """)
    
    # Делаем username NOT NULL и уникальным
    op.alter_column('users', 'username', nullable=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
    
    # Делаем email nullable и убираем unique constraint
    op.drop_index('ix_users_email', table_name='users')
    op.alter_column('users', 'email', nullable=True)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)


def downgrade() -> None:
    # Возвращаем email обратно в NOT NULL
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.alter_column('users', 'email', nullable=False)
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    
    # Удаляем username
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_column('users', 'username')
