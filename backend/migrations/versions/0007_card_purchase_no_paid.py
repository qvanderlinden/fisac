"""a card purchase has no paid status

purchases.paid becomes nullable: a purchase paid with a card keeps NULL, its
status coming from the date the card was used. The server default stays false
for the other purchases.

Revision ID: 0007_card_purchase_no_paid
Revises: 0006_tranche_b
Create Date: 2026-10-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '0007_card_purchase_no_paid'
down_revision: Union[str, None] = '0006_tranche_b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('purchases', 'paid', nullable=True, schema='fisac')
    op.execute(
        "UPDATE fisac.purchases SET paid = NULL WHERE payment_method_id IN "
        "(SELECT id FROM fisac.payment_methods WHERE type = 'card')"
    )


def downgrade() -> None:
    # A card purchase was paid once the card was used.
    op.execute(
        "UPDATE fisac.purchases SET paid = (payment_date <= CURRENT_DATE) WHERE paid IS NULL"
    )
    op.alter_column('purchases', 'paid', nullable=False, schema='fisac')
