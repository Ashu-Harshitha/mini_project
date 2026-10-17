"""initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-10-16 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('firebase_uid', sa.String(length=128), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('role', sa.String(length=50), nullable=False, server_default='farmer'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_firebase_uid'), 'users', ['firebase_uid'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    # 2. farms
    op.create_table(
        'farms',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('operator_name', sa.String(length=255), nullable=False),
        sa.Column('location', sa.String(length=255), nullable=False),
        sa.Column('total_acreage', sa.Float(), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('primary_crops', sa.JSON(), nullable=True),
        sa.Column('irrigation_system', sa.String(length=100), nullable=True),
        sa.Column('is_organic', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_farms_id'), 'farms', ['id'], unique=False)

    # 3. fields
    op.create_table(
        'fields',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('farm_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('acreage', sa.Float(), nullable=False),
        sa.Column('soil_type', sa.String(length=100), nullable=True),
        sa.Column('current_crop', sa.String(length=100), nullable=True),
        sa.Column('crop_variety', sa.String(length=100), nullable=True),
        sa.Column('last_fertilizer', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['farm_id'], ['farms.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_fields_id'), 'fields', ['id'], unique=False)

    # 4. cases
    op.create_table(
        'cases',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_number', sa.String(length=50), nullable=False),
        sa.Column('farm_id', sa.Integer(), nullable=False),
        sa.Column('field_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('crop', sa.String(length=100), nullable=False),
        sa.Column('growth_stage', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='DRAFT'),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('uncertainty', sa.String(length=20), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['farm_id'], ['farms.id']),
        sa.ForeignKeyConstraint(['field_id'], ['fields.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_cases_case_number'), 'cases', ['case_number'], unique=True)
    op.create_index(op.f('ix_cases_id'), 'cases', ['id'], unique=False)
    op.create_index(op.f('ix_cases_status'), 'cases', ['status'], unique=False)

    # 5. case_files
    op.create_table(
        'case_files',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('file_type', sa.String(length=50), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('mime_type', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_case_files_id'), 'case_files', ['id'], unique=False)

    # 6. observations
    op.create_table(
        'observations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('uncertainty', sa.String(length=20), nullable=True),
        sa.Column('note', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_observations_id'), 'observations', ['id'], unique=False)

    # 7. soil_results
    op.create_table(
        'soil_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('n_value', sa.String(length=100), nullable=False),
        sa.Column('n_status', sa.String(length=50), nullable=True),
        sa.Column('n_citation', sa.String(length=255), nullable=True),
        sa.Column('ph_value', sa.String(length=100), nullable=True),
        sa.Column('ph_status', sa.String(length=50), nullable=True),
        sa.Column('ph_citation', sa.String(length=255), nullable=True),
        sa.Column('pk_value', sa.String(length=100), nullable=True),
        sa.Column('pk_status', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_soil_results_id'), 'soil_results', ['id'], unique=False)

    # 8. weather_snapshots
    op.create_table(
        'weather_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('temp_max_c', sa.Float(), nullable=False),
        sa.Column('temp_min_c', sa.Float(), nullable=False),
        sa.Column('rainfall_7d_mm', sa.Float(), nullable=False),
        sa.Column('humidity', sa.Float(), nullable=False),
        sa.Column('wind_kmh', sa.Float(), nullable=False),
        sa.Column('uv_index', sa.Float(), nullable=False),
        sa.Column('rainfall_status', sa.String(length=50), nullable=True),
        sa.Column('temp_status', sa.String(length=50), nullable=True),
        sa.Column('raw_data', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_weather_snapshots_id'), 'weather_snapshots', ['id'], unique=False)

    # 9. recommendations
    op.create_table(
        'recommendations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False),
        sa.Column('uncertainty', sa.String(length=20), nullable=True),
        sa.Column('evidence', sa.Text(), nullable=True),
        sa.Column('assumptions', sa.Text(), nullable=True),
        sa.Column('why_line', sa.Text(), nullable=True),
        sa.Column('citation', sa.String(length=255), nullable=True),
        sa.Column('rank', sa.Integer(), nullable=True),
        sa.Column('is_visible_to_farmer', sa.Boolean(), nullable=True),
        sa.Column('chemical_name', sa.String(length=100), nullable=True),
        sa.Column('chemical_dose', sa.Float(), nullable=True),
        sa.Column('chemical_unit', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_recommendations_id'), 'recommendations', ['id'], unique=False)

    # 10. guardrail_results
    op.create_table(
        'guardrail_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('rule_name', sa.String(length=255), nullable=False),
        sa.Column('rule_category', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_guardrail_results_id'), 'guardrail_results', ['id'], unique=False)

    # 11. reviews
    op.create_table(
        'reviews',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('reviewer_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reviewer_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reviews_id'), 'reviews', ['id'], unique=False)

    # 12. reports
    op.create_table(
        'reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('lang', sa.String(length=10), nullable=True),
        sa.Column('headline', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('steps', sa.JSON(), nullable=True),
        sa.Column('warnings', sa.JSON(), nullable=True),
        sa.Column('confidence_explanation', sa.Text(), nullable=True),
        sa.Column('audio_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reports_id'), 'reports', ['id'], unique=False)

    # 13. notifications
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('event', sa.String(length=100), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('channel', sa.String(length=50), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=True),
        sa.Column('case_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False)

    # 14. outcome_feedback
    op.create_table(
        'outcome_feedback',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('actual_diagnosis', sa.String(length=255), nullable=False),
        sa.Column('treatments_applied', sa.JSON(), nullable=True),
        sa.Column('yield_impact_rating', sa.Integer(), nullable=True),
        sa.Column('harvest_yield', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('case_id'),
    )
    op.create_index(op.f('ix_outcome_feedback_id'), 'outcome_feedback', ['id'], unique=False)

    # 15. chemical_rules
    op.create_table(
        'chemical_rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('chemical_name', sa.String(length=255), nullable=False),
        sa.Column('max_rate', sa.Float(), nullable=False),
        sa.Column('unit', sa.String(length=50), nullable=False),
        sa.Column('stage_window', sa.String(length=100), nullable=True),
        sa.Column('organic_allowed', sa.Boolean(), nullable=True),
        sa.Column('requires_agronomist', sa.Boolean(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_chemical_rules_chemical_name'), 'chemical_rules', ['chemical_name'], unique=False)
    op.create_index(op.f('ix_chemical_rules_id'), 'chemical_rules', ['id'], unique=False)

    # 16. prompt_templates
    op.create_table(
        'prompt_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('step', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('subtitle', sa.String(length=255), nullable=True),
        sa.Column('template', sa.Text(), nullable=False),
        sa.Column('variables', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_prompt_templates_id'), 'prompt_templates', ['id'], unique=False)
    op.create_index(op.f('ix_prompt_templates_step'), 'prompt_templates', ['step'], unique=True)

    # 17. audit_log
    op.create_table(
        'audit_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('from_state', sa.String(length=50), nullable=True),
        sa.Column('to_state', sa.String(length=50), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_audit_log_id'), 'audit_log', ['id'], unique=False)


def downgrade() -> None:
    op.drop_table('audit_log')
    op.drop_table('prompt_templates')
    op.drop_table('chemical_rules')
    op.drop_table('outcome_feedback')
    op.drop_table('notifications')
    op.drop_table('reports')
    op.drop_table('reviews')
    op.drop_table('guardrail_results')
    op.drop_table('recommendations')
    op.drop_table('weather_snapshots')
    op.drop_table('soil_results')
    op.drop_table('observations')
    op.drop_table('case_files')
    op.drop_table('cases')
    op.drop_table('fields')
    op.drop_table('farms')
    op.drop_table('users')
