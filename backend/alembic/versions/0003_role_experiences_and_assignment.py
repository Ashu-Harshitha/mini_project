"""role_experiences_and_assignment

Revision ID: 0003_role_experiences_and_assignment
Revises: 0002_user_auth_profile
Create Date: 2026-10-17 19:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0003_role_experiences_and_assignment'
down_revision: Union[str, None] = '0002_user_auth_profile'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    existing_tables = set(insp.get_table_names())
    
    # 1. Update users table
    user_cols = {c['name'] for c in insp.get_columns('users')}
    with op.batch_alter_table('users') as batch_op:
        if 'available' not in user_cols:
            batch_op.add_column(sa.Column('available', sa.Boolean(), nullable=False, server_default=sa.true()))
        if 'max_open_cases' not in user_cols:
            batch_op.add_column(sa.Column('max_open_cases', sa.Integer(), nullable=False, server_default='5'))
        if 'last_assigned_at' not in user_cols:
            batch_op.add_column(sa.Column('last_assigned_at', sa.DateTime(), nullable=True))

    # 2. Update cases table
    case_cols = {c['name'] for c in insp.get_columns('cases')}
    with op.batch_alter_table('cases') as batch_op:
        if 'description' not in case_cols:
            batch_op.add_column(sa.Column('description', sa.Text(), nullable=True))
        if 'description_lang' not in case_cols:
            batch_op.add_column(sa.Column('description_lang', sa.String(length=10), nullable=True, server_default='en'))
        if 'assigned_agronomist_id' not in case_cols:
            batch_op.add_column(sa.Column('assigned_agronomist_id', sa.Integer(), nullable=True))
        if 'assigned_at' not in case_cols:
            batch_op.add_column(sa.Column('assigned_at', sa.DateTime(), nullable=True))
        if 'reassign_count' not in case_cols:
            batch_op.add_column(sa.Column('reassign_count', sa.Integer(), nullable=False, server_default='0'))
        if 'farmer_summary' not in case_cols:
            batch_op.add_column(sa.Column('farmer_summary', sa.Text(), nullable=True))
        if 'final_suggestion' not in case_cols:
            batch_op.add_column(sa.Column('final_suggestion', sa.Text(), nullable=True))
        if 'decision_note' not in case_cols:
            batch_op.add_column(sa.Column('decision_note', sa.Text(), nullable=True))
        if 'assigned_agronomist_id' not in case_cols:
            batch_op.create_foreign_key('fk_cases_assigned_agronomist', 'users', ['assigned_agronomist_id'], ['id'], ondelete='SET NULL')

    # 3. Update outcome_feedback table
    feedback_cols = {c['name'] for c in insp.get_columns('outcome_feedback')}
    with op.batch_alter_table('outcome_feedback') as batch_op:
        if 'agronomist_id' not in feedback_cols:
            batch_op.add_column(sa.Column('agronomist_id', sa.Integer(), nullable=True))
            batch_op.create_foreign_key('fk_outcome_feedback_agronomist', 'users', ['agronomist_id'], ['id'], ondelete='SET NULL')
        if 'rating' not in feedback_cols:
            batch_op.add_column(sa.Column('rating', sa.Integer(), nullable=False, server_default='5'))
        if 'comment' not in feedback_cols:
            batch_op.add_column(sa.Column('comment', sa.Text(), nullable=True))
        if 'comment_lang' not in feedback_cols:
            batch_op.add_column(sa.Column('comment_lang', sa.String(length=10), nullable=True, server_default='en'))
        if 'audio_path' not in feedback_cols:
            batch_op.add_column(sa.Column('audio_path', sa.String(length=500), nullable=True))
        if 'actual_diagnosis' in feedback_cols:
            batch_op.alter_column('actual_diagnosis', nullable=True)

    # 4. Create assignments table if not exists
    if 'assignments' not in existing_tables:
        op.create_table(
            'assignments',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('case_id', sa.Integer(), sa.ForeignKey('cases.id', ondelete='CASCADE'), nullable=False),
            sa.Column('from_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('to_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('reason', sa.String(length=50), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    # 5. Create messages table if not exists
    if 'messages' not in existing_tables:
        op.create_table(
            'messages',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('case_id', sa.Integer(), sa.ForeignKey('cases.id', ondelete='CASCADE'), nullable=False),
            sa.Column('sender_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('sender_role', sa.String(length=50), nullable=False),
            sa.Column('kind', sa.String(length=50), nullable=False, server_default='text'),
            sa.Column('original_lang', sa.String(length=10), nullable=False, server_default='en'),
            sa.Column('original_text', sa.Text(), nullable=True),
            sa.Column('audio_path', sa.String(length=500), nullable=True),
            sa.Column('transcript_status', sa.String(length=50), nullable=False, server_default='none'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    # 6. Create message_translations table if not exists
    if 'message_translations' not in existing_tables:
        op.create_table(
            'message_translations',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('message_id', sa.Integer(), sa.ForeignKey('messages.id', ondelete='CASCADE'), nullable=False),
            sa.Column('lang', sa.String(length=10), nullable=False),
            sa.Column('text', sa.Text(), nullable=False),
            sa.UniqueConstraint('message_id', 'lang', name='uq_message_translation_lang'),
        )


def downgrade() -> None:
    pass
