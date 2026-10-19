"""sensor_pdf_and_location_weather

Revision ID: 0005_sensor_pdf_and_location_weather
Revises: 0004_gemini_integration_and_rag_eval
Create Date: 2026-10-19 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0005_sensor_pdf_and_location_weather'
down_revision: Union[str, None] = '0004_gemini_integration_and_rag_eval'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    # 1. Update fields table
    if 'fields' in existing_tables:
        field_cols = {c['name'] for c in insp.get_columns('fields')}
        with op.batch_alter_table('fields') as batch_op:
            if 'lat' not in field_cols:
                batch_op.add_column(sa.Column('lat', sa.Float(), nullable=True))
            if 'lng' not in field_cols:
                batch_op.add_column(sa.Column('lng', sa.Float(), nullable=True))
            if 'accuracy_m' not in field_cols:
                batch_op.add_column(sa.Column('accuracy_m', sa.Float(), nullable=True))
            if 'location_source' not in field_cols:
                batch_op.add_column(sa.Column('location_source', sa.String(length=50), nullable=True))
            if 'location_updated_at' not in field_cols:
                batch_op.add_column(sa.Column('location_updated_at', sa.DateTime(), nullable=True))
            if 'timezone' not in field_cols:
                batch_op.add_column(sa.Column('timezone', sa.String(length=100), nullable=True))

    # 2. Update cases table
    if 'cases' in existing_tables:
        case_cols = {c['name'] for c in insp.get_columns('cases')}
        with op.batch_alter_table('cases') as batch_op:
            if 'sensor_summary' not in case_cols:
                batch_op.add_column(sa.Column('sensor_summary', sa.JSON(), nullable=True))
            if 'location_snapshot' not in case_cols:
                batch_op.add_column(sa.Column('location_snapshot', sa.JSON(), nullable=True))
            if 'weather_source' not in case_cols:
                batch_op.add_column(sa.Column('weather_source', sa.String(length=50), nullable=True, server_default='none'))

    # 3. Update weather_snapshots table
    if 'weather_snapshots' in existing_tables:
        ws_cols = {c['name'] for c in insp.get_columns('weather_snapshots')}
        with op.batch_alter_table('weather_snapshots') as batch_op:
            if 'lat' not in ws_cols:
                batch_op.add_column(sa.Column('lat', sa.Float(), nullable=True))
            if 'lng' not in ws_cols:
                batch_op.add_column(sa.Column('lng', sa.Float(), nullable=True))
            if 'fetched_at' not in ws_cols:
                batch_op.add_column(sa.Column('fetched_at', sa.DateTime(), nullable=True))
            if 'source' not in ws_cols:
                batch_op.add_column(sa.Column('source', sa.String(length=50), nullable=True, server_default='open-meteo'))

    # 4. Create sensor_reports table
    if 'sensor_reports' not in existing_tables:
        op.create_table(
            'sensor_reports',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('case_id', sa.Integer(), sa.ForeignKey('cases.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('field_id', sa.Integer(), sa.ForeignKey('fields.id', ondelete='CASCADE'), nullable=True, index=True),
            sa.Column('file_path', sa.String(length=500), nullable=True),
            sa.Column('parse_method', sa.String(length=50), nullable=False),
            sa.Column('is_simulated', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('device_label', sa.String(length=100), nullable=True),
            sa.Column('period_start', sa.DateTime(), nullable=True),
            sa.Column('period_end', sa.DateTime(), nullable=True),
            sa.Column('rows_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('warnings', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    # 5. Create sensor_readings table
    if 'sensor_readings' not in existing_tables:
        op.create_table(
            'sensor_readings',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('sensor_report_id', sa.Integer(), sa.ForeignKey('sensor_reports.id', ondelete='CASCADE'), nullable=True, index=True),
            sa.Column('case_id', sa.Integer(), sa.ForeignKey('cases.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('measured_at', sa.DateTime(), nullable=False),
            sa.Column('soil_moisture_pct', sa.Float(), nullable=True),
            sa.Column('n_mgkg', sa.Float(), nullable=True),
            sa.Column('p_mgkg', sa.Float(), nullable=True),
            sa.Column('k_mgkg', sa.Float(), nullable=True),
            sa.Column('temp_c', sa.Float(), nullable=True),
            sa.Column('humidity_pct', sa.Float(), nullable=True),
            sa.Column('ph', sa.Float(), nullable=True),
            sa.Column('leaf_wetness_pct', sa.Float(), nullable=True),
        )
        op.create_index(
            'ix_sensor_readings_case_id_measured_at',
            'sensor_readings',
            ['case_id', 'measured_at'],
            unique=False,
        )


def downgrade() -> None:
    pass
