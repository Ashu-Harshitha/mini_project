"""notifications_channels_and_outcome_loop

Revision ID: 0008_notifications_channels_and_outcome_loop
Revises: 0007_farmer_guidance_reports
Create Date: 2026-10-20 17:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0008_notifications_channels_and_outcome_loop'
down_revision: Union[str, None] = '0007_farmer_guidance_reports'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    # 1. users: add channel_prefs
    user_cols = [c['name'] for c in insp.get_columns('users')]
    with op.batch_alter_table('users', schema=None) as batch_op:
        if 'channel_prefs' not in user_cols:
            batch_op.add_column(
                sa.Column(
                    'channel_prefs',
                    sa.JSON(),
                    nullable=True,
                    server_default='{"email":true,"whatsapp":false,"sms":false}',
                )
            )

    # 2. notifications: add channel, status, error, attempts if missing
    notif_cols = [c['name'] for c in insp.get_columns('notifications')]
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        if 'channel' not in notif_cols:
            batch_op.add_column(
                sa.Column('channel', sa.String(length=50), nullable=False, server_default='in_app')
            )
        if 'status' not in notif_cols:
            batch_op.add_column(
                sa.Column('status', sa.String(length=50), nullable=False, server_default='sent')
            )
        if 'error' not in notif_cols:
            batch_op.add_column(
                sa.Column('error', sa.Text(), nullable=True)
            )
        if 'attempts' not in notif_cols:
            batch_op.add_column(
                sa.Column('attempts', sa.Integer(), nullable=False, server_default='1')
            )

    # 3. outcome_feedback: add followed_advice, outcome, outcome_comment, outcome_reported_at
    if 'outcome_feedback' in insp.get_table_names():
        feedback_cols = [c['name'] for c in insp.get_columns('outcome_feedback')]
        with op.batch_alter_table('outcome_feedback', schema=None) as batch_op:
            if 'followed_advice' not in feedback_cols:
                batch_op.add_column(
                    sa.Column('followed_advice', sa.Boolean(), nullable=True)
                )
            if 'outcome' not in feedback_cols:
                batch_op.add_column(
                    sa.Column('outcome', sa.String(length=50), nullable=True)
                )
            if 'outcome_comment' not in feedback_cols:
                batch_op.add_column(
                    sa.Column('outcome_comment', sa.Text(), nullable=True)
                )
            if 'outcome_reported_at' not in feedback_cols:
                batch_op.add_column(
                    sa.Column('outcome_reported_at', sa.DateTime(), nullable=True)
                )

    # 4. cases: add feedback_reminders_sent, delivered_at if missing
    case_cols = [c['name'] for c in insp.get_columns('cases')]
    with op.batch_alter_table('cases', schema=None) as batch_op:
        if 'feedback_reminders_sent' not in case_cols:
            batch_op.add_column(
                sa.Column('feedback_reminders_sent', sa.Integer(), nullable=False, server_default='0')
            )
        if 'delivered_at' not in case_cols:
            batch_op.add_column(
                sa.Column('delivered_at', sa.DateTime(), nullable=True)
            )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    case_cols = [c['name'] for c in insp.get_columns('cases')]
    with op.batch_alter_table('cases', schema=None) as batch_op:
        if 'delivered_at' in case_cols:
            batch_op.drop_column('delivered_at')
        if 'feedback_reminders_sent' in case_cols:
            batch_op.drop_column('feedback_reminders_sent')

    if 'outcome_feedback' in insp.get_table_names():
        feedback_cols = [c['name'] for c in insp.get_columns('outcome_feedback')]
        with op.batch_alter_table('outcome_feedback', schema=None) as batch_op:
            if 'outcome_reported_at' in feedback_cols:
                batch_op.drop_column('outcome_reported_at')
            if 'outcome_comment' in feedback_cols:
                batch_op.drop_column('outcome_comment')
            if 'outcome' in feedback_cols:
                batch_op.drop_column('outcome')
            if 'followed_advice' in feedback_cols:
                batch_op.drop_column('followed_advice')

    notif_cols = [c['name'] for c in insp.get_columns('notifications')]
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        if 'attempts' in notif_cols:
            batch_op.drop_column('attempts')
        if 'error' in notif_cols:
            batch_op.drop_column('error')
        if 'status' in notif_cols:
            batch_op.drop_column('status')
        if 'channel' in notif_cols:
            batch_op.drop_column('channel')

    user_cols = [c['name'] for c in insp.get_columns('users')]
    with op.batch_alter_table('users', schema=None) as batch_op:
        if 'channel_prefs' in user_cols:
            batch_op.drop_column('channel_prefs')
