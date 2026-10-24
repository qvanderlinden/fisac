"""tranche ISOC: the company's incorporation date

company.incorporated_on (date, nullable) tells whether a small company is in
its first three fiscal years, which exempts it from the increase for
insufficient advance payments. purchase_lines.isoc_scheme_id already exists and
stays nullable (NULL is read as the "100 %" scheme).

Revision ID: 0008_tranche_isoc
Revises: 0007_card_purchase_no_paid
Create Date: 2026-10-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '0008_tranche_isoc'
down_revision: Union[str, None] = '0007_card_purchase_no_paid'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('company', sa.Column('incorporated_on', sa.Date(), nullable=True), schema='fisac')


def downgrade() -> None:
    op.drop_column('company', 'incorporated_on', schema='fisac')
