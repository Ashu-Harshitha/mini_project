"""rag_chunk_ids_and_citations

Revision ID: 0006_rag_chunk_ids_and_citations
Revises: 0005_sensor_pdf_and_location_weather
Create Date: 2026-10-19 19:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0006_rag_chunk_ids_and_citations'
down_revision: Union[str, None] = '0005_sensor_pdf_and_location_weather'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    
    # 1. Add chunk_ids to recommendations
    if 'recommendations' in insp.get_table_names():
        columns = [c['name'] for c in insp.get_columns('recommendations')]
        if 'chunk_ids' not in columns:
            op.add_column('recommendations', sa.Column('chunk_ids', sa.JSON(), nullable=True, server_default='[]'))

    # 2. Add filename to rag_documents
    if 'rag_documents' in insp.get_table_names():
        doc_cols = [c['name'] for c in insp.get_columns('rag_documents')]
        if 'filename' not in doc_cols:
            op.add_column('rag_documents', sa.Column('filename', sa.String(length=255), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    
    if 'recommendations' in insp.get_table_names():
        columns = [c['name'] for c in insp.get_columns('recommendations')]
        if 'chunk_ids' in columns:
            op.drop_column('recommendations', 'chunk_ids')

    if 'rag_documents' in insp.get_table_names():
        doc_cols = [c['name'] for c in insp.get_columns('rag_documents')]
        if 'filename' in doc_cols:
            op.drop_column('rag_documents', 'filename')
