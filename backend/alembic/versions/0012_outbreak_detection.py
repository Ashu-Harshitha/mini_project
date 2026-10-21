"""outbreak_detection

Revision ID: 0012_outbreak_detection
Revises: 0011_admin_analytics_indexes
Create Date: 2026-10-21 19:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0012_outbreak_detection'
down_revision: Union[str, None] = '0011_admin_analytics_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    # 1. outbreaks table
    if 'outbreaks' not in existing_tables:
        op.create_table(
            'outbreaks',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('issue_category', sa.String(length=50), nullable=False),
            sa.Column('crop', sa.String(length=100), nullable=False),
            sa.Column('center_lat', sa.Float(), nullable=False),
            sa.Column('center_lng', sa.Float(), nullable=False),
            sa.Column('radius_km', sa.Float(), nullable=False, server_default='25.0'),
            sa.Column('farm_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('case_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('severity', sa.String(length=20), nullable=False, server_default='watch'),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='open'),
            sa.Column('first_seen', sa.DateTime(), nullable=False),
            sa.Column('last_seen', sa.DateTime(), nullable=False),
            sa.Column('resolved_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_outbreaks_id', 'outbreaks', ['id'], unique=False)
        op.create_index('ix_outbreaks_status', 'outbreaks', ['status'], unique=False)
        op.create_index('ix_outbreaks_category_crop', 'outbreaks', ['issue_category', 'crop'], unique=False)

    # 2. outbreak_cases association table
    if 'outbreak_cases' not in existing_tables:
        op.create_table(
            'outbreak_cases',
            sa.Column('outbreak_id', sa.Integer(), nullable=False),
            sa.Column('case_id', sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['outbreak_id'], ['outbreaks.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('outbreak_id', 'case_id'),
        )
        op.create_index('ix_outbreak_cases_case_id', 'outbreak_cases', ['case_id'], unique=False)

    # 3. outbreak_notified table
    if 'outbreak_notified' not in existing_tables:
        op.create_table(
            'outbreak_notified',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('outbreak_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('notified_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['outbreak_id'], ['outbreaks.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('outbreak_id', 'user_id', name='uq_outbreak_notified_user'),
        )
        op.create_index('ix_outbreak_notified_id', 'outbreak_notified', ['id'], unique=False)
        op.create_index('ix_outbreak_notified_user_id', 'outbreak_notified', ['user_id'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    if 'outbreak_notified' in existing_tables:
        op.drop_table('outbreak_notified')

    if 'outbreak_cases' in existing_tables:
        op.drop_table('outbreak_cases')

    if 'outbreaks' in existing_tables:
        op.drop_table('outbreaks')
