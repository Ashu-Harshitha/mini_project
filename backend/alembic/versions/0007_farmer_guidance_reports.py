"""farmer_guidance_reports

Revision ID: 0007_farmer_guidance_reports
Revises: 0006_rag_chunk_ids_and_citations
Create Date: 2026-10-20 14:00:00.000000

"""
import json
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0007_farmer_guidance_reports'
down_revision: Union[str, None] = '0006_rag_chunk_ids_and_citations'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    tables = insp.get_table_names()

    if 'reports' not in tables:
        op.create_table(
            'reports',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('case_id', sa.Integer(), sa.ForeignKey('cases.id', ondelete='CASCADE'), nullable=False),
            sa.Column('language', sa.String(length=10), nullable=False, server_default='en'),
            sa.Column('body_json', sa.JSON(), nullable=False),
            sa.Column('machine_translated', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('audio_path', sa.String(length=500), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('case_id', 'language', name='uq_reports_case_id_language')
        )
        op.create_index(op.f('ix_reports_id'), 'reports', ['id'], unique=False)
    else:
        cols = [c['name'] for c in insp.get_columns('reports')]

        with op.batch_alter_table('reports', schema=None) as batch_op:
            if 'language' not in cols:
                batch_op.add_column(sa.Column('language', sa.String(length=10), nullable=True, server_default='en'))
            if 'body_json' not in cols:
                batch_op.add_column(sa.Column('body_json', sa.JSON(), nullable=True))
            if 'machine_translated' not in cols:
                batch_op.add_column(sa.Column('machine_translated', sa.Boolean(), nullable=False, server_default=sa.text('0')))
            if 'audio_path' not in cols:
                batch_op.add_column(sa.Column('audio_path', sa.String(length=500), nullable=True))

        # Backfill existing rows
        connection = op.get_bind()
        reports_table = sa.table(
            'reports',
            sa.column('id', sa.Integer),
            sa.column('case_id', sa.Integer),
            sa.column('language', sa.String),
            sa.column('body_json', sa.JSON),
            sa.column('machine_translated', sa.Boolean),
            sa.column('lang', sa.String),
            sa.column('headline', sa.String),
            sa.column('description', sa.Text),
            sa.column('steps', sa.JSON),
            sa.column('warnings', sa.JSON),
            sa.column('created_at', sa.DateTime),
        )

        rows = connection.execute(sa.select(
            reports_table.c.id,
            reports_table.c.case_id,
            reports_table.c.lang,
            reports_table.c.headline,
            reports_table.c.description,
            reports_table.c.steps,
            reports_table.c.warnings,
            reports_table.c.created_at,
        )).fetchall()

        for r in rows:
            lang_val = r.lang or 'en'
            steps_val = r.steps if isinstance(r.steps, list) else []
            formatted_steps = []
            for s in steps_val:
                if isinstance(s, dict):
                    formatted_steps.append({
                        "title": s.get("title") or s.get("instruction") or "Field management step",
                        "detail": s.get("instruction") or s.get("title") or "Follow standard instructions.",
                    })
                elif isinstance(s, str):
                    formatted_steps.append({"title": s, "detail": "Apply as instructed."})

            warnings_val = r.warnings if isinstance(r.warnings, list) else []
            body = {
                "what_is_happening": r.description or r.headline or "Guidance report",
                "next_steps": formatted_steps,
                "warnings": warnings_val,
                "reviewed_by": "Agronomist",
                "reviewed_at": (r.created_at.isoformat() if r.created_at else "2026-10-20T12:00:00Z"),
            }
            connection.execute(
                reports_table.update()
                .where(reports_table.c.id == r.id)
                .values(
                    language=lang_val,
                    body_json=body,
                    machine_translated=False,
                )
            )

        # Apply unique constraint and non-null constraints
        with op.batch_alter_table('reports', schema=None) as batch_op:
            batch_op.alter_column('language', nullable=False, server_default='en')
            batch_op.alter_column('body_json', nullable=False)
            # Add unique constraint if not already present
            existing_uqs = [u['name'] for u in insp.get_unique_constraints('reports')]
            if 'uq_reports_case_id_language' not in existing_uqs:
                batch_op.create_unique_constraint('uq_reports_case_id_language', ['case_id', 'language'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if 'reports' in insp.get_table_names():
        with op.batch_alter_table('reports', schema=None) as batch_op:
            existing_uqs = [u['name'] for u in insp.get_unique_constraints('reports')]
            if 'uq_reports_case_id_language' in existing_uqs:
                batch_op.drop_constraint('uq_reports_case_id_language', type_='unique')
            cols = [c['name'] for c in insp.get_columns('reports')]
            if 'audio_path' in cols:
                batch_op.drop_column('audio_path')
            if 'machine_translated' in cols:
                batch_op.drop_column('machine_translated')
            if 'body_json' in cols:
                batch_op.drop_column('body_json')
            if 'language' in cols:
                batch_op.drop_column('language')
