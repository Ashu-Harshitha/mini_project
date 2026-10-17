"""user_auth_profile

Revision ID: 0002_user_auth_profile
Revises: 0001_initial_schema
Create Date: 2026-10-17 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002_user_auth_profile'
down_revision: Union[str, None] = '0001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('username', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('phone', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('language', sa.String(length=10), nullable=False, server_default='en'))
        batch_op.add_column(sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(sa.Column('created_by', sa.Integer(), nullable=True))
        batch_op.alter_column('email', nullable=True)
        batch_op.create_foreign_key('fk_users_created_by', 'users', ['created_by'], ['id'], ondelete='SET NULL')

    # Ensure existing rows have unique usernames before adding unique constraint
    op.execute(
        "UPDATE users SET username = CASE "
        "WHEN role = 'admin' THEN 'admin' "
        "WHEN email LIKE 'james.donovan%' THEN 'farmer' "
        "WHEN email LIKE 'schen%' THEN 'agronomist' "
        "ELSE 'user_' || id END "
        "WHERE username IS NULL"
    )

    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('username', nullable=False)
        batch_op.create_index('ix_users_username', ['username'], unique=True)

    op.create_index(
        'uq_users_single_admin',
        'users',
        ['role'],
        unique=True,
        postgresql_where=sa.text("role = 'admin'"),
        sqlite_where=sa.text("role = 'admin'"),
    )


def downgrade() -> None:
    op.drop_index('uq_users_single_admin', table_name='users')
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_constraint('fk_users_created_by', type_='foreignkey')
        batch_op.drop_index('ix_users_username')
        batch_op.alter_column('email', nullable=False)
        batch_op.drop_column('created_by')
        batch_op.drop_column('active')
        batch_op.drop_column('language')
        batch_op.drop_column('phone')
        batch_op.drop_column('username')
