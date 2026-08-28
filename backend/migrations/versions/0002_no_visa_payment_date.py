"""visa flows never store a payment_date

Revision ID: 0002_no_visa_payment_date
Revises: 0001_init
Create Date: 2026-08-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '0002_no_visa_payment_date'
down_revision: Union[str, None] = '0001_init'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # A Visa flow's actual payment date is derived by the projection from the
    # account's visa_payment_day, never stored on the flow - null out any
    # existing rows before adding the constraint that enforces it.
    op.execute("UPDATE fisac.flows SET payment_date = NULL WHERE payment_method = 'visa'")
    op.create_check_constraint(
        'ck_flows_no_visa_payment_date',
        'flows',
        "payment_method != 'visa' OR payment_date IS NULL",
        schema='fisac',
    )


def downgrade() -> None:
    op.drop_constraint('ck_flows_no_visa_payment_date', 'flows', schema='fisac', type_='check')
