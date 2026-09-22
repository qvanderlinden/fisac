"""visa statement closing day on accounts

Revision ID: 0003_visa_closing_day
Revises: 0002_no_visa_payment_date
Create Date: 2026-09-22 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '0003_visa_closing_day'
down_revision: Union[str, None] = '0002_no_visa_payment_date'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Day of the month the Visa statement closes: an invoice dated after it
    # lands on the next statement and is therefore paid one cycle later. Left
    # NULL for existing accounts, which the projection reads as "closes on the
    # payment day" - i.e. the behavior they had before this column, so no
    # backfill is needed.
    op.add_column(
        'accounts',
        sa.Column('visa_closing_day', sa.SmallInteger(), nullable=True),
        schema='fisac',
    )
    op.create_check_constraint(
        'ck_accounts_visa_closing_day_range',
        'accounts',
        'visa_closing_day IS NULL OR (visa_closing_day >= 1 AND visa_closing_day <= 31)',
        schema='fisac',
    )


def downgrade() -> None:
    op.drop_constraint(
        'ck_accounts_visa_closing_day_range', 'accounts', schema='fisac', type_='check'
    )
    op.drop_column('accounts', 'visa_closing_day', schema='fisac')
