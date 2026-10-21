"""weather_and_sensor_alerts

Revision ID: 0010_weather_and_sensor_alerts
Revises: 0009_eval_suite_and_system_settings
Create Date: 2026-10-21 17:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0010_weather_and_sensor_alerts'
down_revision: Union[str, None] = '0009_eval_suite_and_system_settings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    # 1. Create weather_alerts table
    if 'weather_alerts' not in existing_tables:
        op.create_table(
            'weather_alerts',
            sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
            sa.Column('farm_id', sa.Integer(), sa.ForeignKey('farms.id', ondelete='CASCADE'), nullable=False),
            sa.Column('field_id', sa.Integer(), sa.ForeignKey('fields.id', ondelete='SET NULL'), nullable=True),
            sa.Column('source', sa.String(length=20), nullable=False),
            sa.Column('rule', sa.String(length=50), nullable=False),
            sa.Column('severity', sa.String(length=20), nullable=False),
            sa.Column('start_date', sa.Date(), nullable=False),
            sa.Column('params', sa.JSON(), nullable=True),
            sa.Column('dedupe_key', sa.String(length=100), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('notified_at', sa.DateTime(), nullable=True),
            sa.Column('read_at', sa.DateTime(), nullable=True),
            sa.Column('is_demo', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.UniqueConstraint('dedupe_key', name='uq_weather_alerts_dedupe_key'),
            sa.UniqueConstraint('farm_id', 'rule', 'start_date', name='uq_weather_alerts_farm_rule_date'),
        )
        op.create_index('ix_weather_alerts_farm_created', 'weather_alerts', ['farm_id', 'created_at'], unique=False)
        op.create_index('ix_weather_alerts_read_at', 'weather_alerts', ['read_at'], unique=False)

    # 2. Add last_weather_check_at to farms table if not exists
    if 'farms' in existing_tables:
        farm_cols = {c['name'] for c in insp.get_columns('farms')}
        if 'last_weather_check_at' not in farm_cols:
            with op.batch_alter_table('farms') as batch_op:
                batch_op.add_column(sa.Column('last_weather_check_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    if 'weather_alerts' in existing_tables:
        op.drop_table('weather_alerts')

    if 'farms' in existing_tables:
        farm_cols = {c['name'] for c in insp.get_columns('farms')}
        if 'last_weather_check_at' in farm_cols:
            with op.batch_alter_table('farms') as batch_op:
                batch_op.drop_column('last_weather_check_at')
