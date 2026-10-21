"""eval_suite_and_system_settings

Revision ID: 0009_eval_suite_and_system_settings
Revises: 0008_notifications_channels_and_outcome_loop
Create Date: 2026-10-21 16:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0009_eval_suite_and_system_settings'
down_revision: Union[str, None] = '0008_notifications_channels_and_outcome_loop'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    # 1. Update eval_runs table with status, started_at, finished_at
    if 'eval_runs' in existing_tables:
        eval_run_cols = {c['name'] for c in insp.get_columns('eval_runs')}
        with op.batch_alter_table('eval_runs') as batch_op:
            if 'status' not in eval_run_cols:
                batch_op.add_column(sa.Column('status', sa.String(length=50), nullable=False, server_default='completed'))
            if 'started_at' not in eval_run_cols:
                batch_op.add_column(sa.Column('started_at', sa.DateTime(), nullable=True))
            if 'finished_at' not in eval_run_cols:
                batch_op.add_column(sa.Column('finished_at', sa.DateTime(), nullable=True))

    # 2. Update eval_cases table with case_identifier, case_type, expected_keywords, sensor_scenario, is_unsafe, extra_data
    if 'eval_cases' in existing_tables:
        eval_case_cols = {c['name'] for c in insp.get_columns('eval_cases')}
        with op.batch_alter_table('eval_cases') as batch_op:
            if 'case_identifier' not in eval_case_cols:
                batch_op.add_column(sa.Column('case_identifier', sa.String(length=100), nullable=True))
            if 'case_type' not in eval_case_cols:
                batch_op.add_column(sa.Column('case_type', sa.String(length=50), nullable=False, server_default='image'))
            if 'expected_keywords' not in eval_case_cols:
                batch_op.add_column(sa.Column('expected_keywords', sa.JSON(), nullable=True))
            if 'sensor_scenario' not in eval_case_cols:
                batch_op.add_column(sa.Column('sensor_scenario', sa.String(length=50), nullable=True))
            if 'is_unsafe' not in eval_case_cols:
                batch_op.add_column(sa.Column('is_unsafe', sa.Boolean(), nullable=False, server_default=sa.false()))
            if 'extra_data' not in eval_case_cols:
                batch_op.add_column(sa.Column('extra_data', sa.JSON(), nullable=True))

    # 3. Create eval_case_results table if not exists
    if 'eval_case_results' not in existing_tables:
        op.create_table(
            'eval_case_results',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('eval_run_id', sa.Integer(), sa.ForeignKey('eval_runs.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('case_id', sa.String(length=100), nullable=False, index=True),
            sa.Column('case_type', sa.String(length=50), nullable=False, server_default='image'),
            sa.Column('passed', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('model_output', sa.JSON(), nullable=True),
            sa.Column('ground_truth', sa.JSON(), nullable=True),
            sa.Column('failure_reason', sa.Text(), nullable=True),
            sa.Column('metrics', sa.JSON(), nullable=True),
            sa.Column('latency_ms', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('tokens_in', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('tokens_out', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    # 4. Create system_settings table if not exists
    if 'system_settings' not in existing_tables:
        op.create_table(
            'system_settings',
            sa.Column('key', sa.String(length=100), primary_key=True, index=True),
            sa.Column('value', sa.JSON(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    if 'system_settings' in existing_tables:
        op.drop_table('system_settings')

    if 'eval_case_results' in existing_tables:
        op.drop_table('eval_case_results')

    if 'eval_cases' in existing_tables:
        with op.batch_alter_table('eval_cases') as batch_op:
            eval_case_cols = {c['name'] for c in insp.get_columns('eval_cases')}
            for col in ['extra_data', 'is_unsafe', 'sensor_scenario', 'expected_keywords', 'case_type', 'case_identifier']:
                if col in eval_case_cols:
                    batch_op.drop_column(col)

    if 'eval_runs' in existing_tables:
        with op.batch_alter_table('eval_runs') as batch_op:
            eval_run_cols = {c['name'] for c in insp.get_columns('eval_runs')}
            for col in ['finished_at', 'started_at', 'status']:
                if col in eval_run_cols:
                    batch_op.drop_column(col)
