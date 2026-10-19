"""gemini_integration_and_rag_eval

Revision ID: 0004_gemini_integration_and_rag_eval
Revises: 0003_role_experiences_and_assignment
Create Date: 2026-10-18 20:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0004_gemini_integration_and_rag_eval'
down_revision: Union[str, None] = '0003_role_experiences_and_assignment'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())

    # 1. Update cases table
    case_cols = {c['name'] for c in insp.get_columns('cases')}
    with op.batch_alter_table('cases') as batch_op:
        if 'issue_label' not in case_cols:
            batch_op.add_column(sa.Column('issue_label', sa.Text(), nullable=True))
        if 'issue_category' not in case_cols:
            batch_op.add_column(sa.Column('issue_category', sa.String(length=50), nullable=True))
        if 'ai_degraded' not in case_cols:
            batch_op.add_column(sa.Column('ai_degraded', sa.Boolean(), nullable=False, server_default=sa.false()))

    # 2. Update recommendations table
    rec_cols = {c['name'] for c in insp.get_columns('recommendations')}
    with op.batch_alter_table('recommendations') as batch_op:
        if 'category' not in rec_cols:
            batch_op.add_column(sa.Column('category', sa.String(length=50), nullable=False, server_default='Crop'))
        if 'why' not in rec_cols:
            batch_op.add_column(sa.Column('why', sa.Text(), nullable=True))

    # 3. Update soil_results table
    if 'soil_results' in existing_tables:
        soil_cols = {c['name'] for c in insp.get_columns('soil_results')}
        with op.batch_alter_table('soil_results') as batch_op:
            if 'n_ppm' not in soil_cols:
                batch_op.add_column(sa.Column('n_ppm', sa.Float(), nullable=True))
            if 'p_ppm' not in soil_cols:
                batch_op.add_column(sa.Column('p_ppm', sa.Float(), nullable=True))
            if 'k_ppm' not in soil_cols:
                batch_op.add_column(sa.Column('k_ppm', sa.Float(), nullable=True))
            if 'ph' not in soil_cols:
                batch_op.add_column(sa.Column('ph', sa.Float(), nullable=True))
            if 'sample_date' not in soil_cols:
                batch_op.add_column(sa.Column('sample_date', sa.String(length=50), nullable=True))
            if 'needs_confirmation' not in soil_cols:
                batch_op.add_column(sa.Column('needs_confirmation', sa.Boolean(), nullable=False, server_default=sa.false()))

    # 4. Update prompt_templates table
    if 'prompt_templates' in existing_tables:
        pt_cols = {c['name'] for c in insp.get_columns('prompt_templates')}
        pt_indices = {i['name'] for i in insp.get_indexes('prompt_templates')}
        with op.batch_alter_table('prompt_templates') as batch_op:
            if 'version' not in pt_cols:
                batch_op.add_column(sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
            if 'is_active' not in pt_cols:
                batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))
            if 'ix_prompt_templates_step' in pt_indices:
                batch_op.drop_index('ix_prompt_templates_step')
                batch_op.create_index('ix_prompt_templates_step', ['step'], unique=False)

    # 5. Create llm_calls table if not exists
    if 'llm_calls' not in existing_tables:
        op.create_table(
            'llm_calls',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('case_id', sa.Integer(), sa.ForeignKey('cases.id', ondelete='SET NULL'), nullable=True, index=True),
            sa.Column('step', sa.String(length=50), nullable=False, index=True),
            sa.Column('prompt_version', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('model', sa.String(length=100), nullable=False),
            sa.Column('tokens_in', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('tokens_out', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('latency_ms', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('output_json', sa.JSON(), nullable=False),
            sa.Column('cache_key', sa.String(length=64), unique=True, index=True, nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    # 6. Create rag_documents table if not exists
    if 'rag_documents' not in existing_tables:
        op.create_table(
            'rag_documents',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('source_type', sa.String(length=100), nullable=True),
            sa.Column('year', sa.Integer(), nullable=True),
            sa.Column('authors', sa.String(length=255), nullable=True),
            sa.Column('publisher', sa.String(length=255), nullable=True),
            sa.Column('file_path', sa.String(length=500), nullable=True),
            sa.Column('chunk_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    # 7. Create eval_cases table if not exists
    if 'eval_cases' not in existing_tables:
        op.create_table(
            'eval_cases',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('case_id', sa.Integer(), sa.ForeignKey('cases.id', ondelete='SET NULL'), nullable=True),
            sa.Column('crop', sa.String(length=100), nullable=True),
            sa.Column('ground_truth_category', sa.String(length=100), nullable=True),
            sa.Column('ground_truth_label', sa.String(length=255), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('image_path', sa.String(length=500), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    # 8. Create eval_runs table if not exists
    if 'eval_runs' not in existing_tables:
        op.create_table(
            'eval_runs',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('run_name', sa.String(length=255), nullable=True),
            sa.Column('model', sa.String(length=100), nullable=False),
            sa.Column('prompt_version', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('total_cases', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('accuracy', sa.Float(), nullable=False, server_default='0.0'),
            sa.Column('metrics', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    pass
