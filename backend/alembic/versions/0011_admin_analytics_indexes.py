"""admin_analytics_indexes

Revision ID: 0011_admin_analytics_indexes
Revises: 0010_weather_and_sensor_alerts
Create Date: 2026-10-21 18:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0011_admin_analytics_indexes'
down_revision: Union[str, None] = '0010_weather_and_sensor_alerts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    # 1. Update reviews table if columns missing and add index on decided_at
    if 'reviews' in existing_tables:
        review_cols = {c['name'] for c in insp.get_columns('reviews')}
        with op.batch_alter_table('reviews') as batch_op:
            if 'decided_at' not in review_cols:
                batch_op.add_column(sa.Column('decided_at', sa.DateTime(), nullable=True))
            if 'decision' not in review_cols:
                batch_op.add_column(sa.Column('decision', sa.String(50), nullable=True))

        # Backfill decided_at from created_at and decision from status
        try:
            op.execute("UPDATE reviews SET decided_at = created_at WHERE decided_at IS NULL")
            op.execute("UPDATE reviews SET decision = status WHERE decision IS NULL")
        except Exception:
            pass

        # Index on reviews.decided_at
        review_indexes = {ix['name'] for ix in insp.get_indexes('reviews')}
        if 'ix_reviews_decided_at' not in review_indexes:
            with op.batch_alter_table('reviews') as batch_op:
                batch_op.create_index('ix_reviews_decided_at', ['decided_at'], unique=False)

    # 2. Indexes on cases: created_at, status, assigned_agronomist_id
    if 'cases' in existing_tables:
        case_indexes = {ix['name'] for ix in insp.get_indexes('cases')}
        with op.batch_alter_table('cases') as batch_op:
            if 'ix_cases_created_at' not in case_indexes:
                batch_op.create_index('ix_cases_created_at', ['created_at'], unique=False)
            if 'ix_cases_status' not in case_indexes:
                batch_op.create_index('ix_cases_status', ['status'], unique=False)
            if 'ix_cases_assigned_agronomist_id' not in case_indexes:
                batch_op.create_index('ix_cases_assigned_agronomist_id', ['assigned_agronomist_id'], unique=False)

    # 3. Index on messages: created_at
    if 'messages' in existing_tables:
        message_indexes = {ix['name'] for ix in insp.get_indexes('messages')}
        if 'ix_messages_created_at' not in message_indexes:
            with op.batch_alter_table('messages') as batch_op:
                batch_op.create_index('ix_messages_created_at', ['created_at'], unique=False)

    # 4. Index on sensor_reports: created_at
    if 'sensor_reports' in existing_tables:
        sensor_indexes = {ix['name'] for ix in insp.get_indexes('sensor_reports')}
        if 'ix_sensor_reports_created_at' not in sensor_indexes:
            with op.batch_alter_table('sensor_reports') as batch_op:
                batch_op.create_index('ix_sensor_reports_created_at', ['created_at'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    if 'sensor_reports' in existing_tables:
        with op.batch_alter_table('sensor_reports') as batch_op:
            try:
                batch_op.drop_index('ix_sensor_reports_created_at')
            except Exception:
                pass

    if 'messages' in existing_tables:
        with op.batch_alter_table('messages') as batch_op:
            try:
                batch_op.drop_index('ix_messages_created_at')
            except Exception:
                pass

    if 'cases' in existing_tables:
        with op.batch_alter_table('cases') as batch_op:
            try:
                batch_op.drop_index('ix_cases_assigned_agronomist_id')
            except Exception:
                pass
            try:
                batch_op.drop_index('ix_cases_created_at')
            except Exception:
                pass

    if 'reviews' in existing_tables:
        with op.batch_alter_table('reviews') as batch_op:
            try:
                batch_op.drop_index('ix_reviews_decided_at')
            except Exception:
                pass
