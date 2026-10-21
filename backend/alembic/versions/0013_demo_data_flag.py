"""demo_data_flag

Revision ID: 0013_demo_data_flag
Revises: 0012_outbreak_detection
Create Date: 2026-10-21 19:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0013_demo_data_flag'
down_revision: Union[str, None] = '0012_outbreak_detection'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TARGET_TABLES = [
    'users',
    'farms',
    'cases',
    'eval_runs',
    'weather_alerts',
    'outbreaks',
    'notifications',
]


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    for tbl in TARGET_TABLES:
        if tbl in existing_tables:
            existing_cols = {c['name'] for c in insp.get_columns(tbl)}
            if 'is_demo' not in existing_cols:
                with op.batch_alter_table(tbl) as batch_op:
                    batch_op.add_column(
                        sa.Column('is_demo', sa.Boolean(), nullable=False, server_default=sa.text('0'))
                    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    # Do not drop from weather_alerts since it was defined in 0010
    tables_to_drop = [t for t in TARGET_TABLES if t != 'weather_alerts']
    for tbl in tables_to_drop:
        if tbl in existing_tables:
            existing_cols = {c['name'] for c in insp.get_columns(tbl)}
            if 'is_demo' in existing_cols:
                with op.batch_alter_table(tbl) as batch_op:
                    batch_op.drop_column('is_demo')
