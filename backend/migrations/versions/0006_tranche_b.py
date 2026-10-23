"""tranche B: categories as labels with a direction, simpler pieces

Categories lose their kind, role, settlement and default schemes for a
direction (sales or purchases); the seeded categories with no place in the
simplified model go when no line uses them. Sales get a kind like purchases
(the purchase_kind type becomes piece_kind), the payment date of a sale or
purchase is always given, a purchase line's ISOC scheme becomes optional and a
fixed asset is always the one of a purchase line. See
docs/superpowers/specs/2026-10-23-tranche-b-pieces-design.md.

Revision ID: 0006_tranche_b
Revises: 0005_compta_simplifiee
Create Date: 2026-10-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '0006_tranche_b'
down_revision: Union[str, None] = '0005_compta_simplifiee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Seeded by 0005, with no place in the simplified model.
_DROPPED_CATEGORIES = [
    'TVA',
    'Transfert interne',
    'Reprise d’ouverture',
    'Compte courant du gérant',
    'Impôt des sociétés',
    'Rémunération du gérant',
    'Cotisations sociales du gérant',
    'Précompte professionnel',
    'Immobilisation · au registre',
]


def _categories() -> None:
    direction = sa.Enum('sales', 'purchases', name='category_direction', schema='fisac')
    direction.create(op.get_bind())
    op.add_column(
        'categories',
        sa.Column('direction', sa.Enum('sales', 'purchases', name='category_direction', schema='fisac', create_type=False), nullable=True),
        schema='fisac',
    )
    op.execute("UPDATE fisac.categories SET direction = CASE WHEN kind = 'revenue' THEN 'sales' ELSE 'purchases' END::fisac.category_direction")
    op.alter_column('categories', 'direction', nullable=False, schema='fisac')
    op.execute(
        sa.text(
            'DELETE FROM fisac.categories c WHERE c.label = ANY(:labels)'
            ' AND NOT EXISTS (SELECT 1 FROM fisac.sale_lines WHERE category_id = c.id)'
            ' AND NOT EXISTS (SELECT 1 FROM fisac.purchase_lines WHERE category_id = c.id)'
            ' AND NOT EXISTS (SELECT 1 FROM fisac.misc_entries WHERE category_id = c.id)'
        ).bindparams(labels=_DROPPED_CATEGORIES)
    )
    op.drop_index('uq_categories_role', table_name='categories', schema='fisac')
    op.drop_constraint('ck_categories_role_kind', 'categories', schema='fisac')
    op.drop_constraint('ck_categories_settlement_outside', 'categories', schema='fisac')
    # The foreign keys of the two default schemes go with their columns.
    for column in ('kind', 'role', 'settlement', 'default_vat_scheme_id', 'default_isoc_scheme_id'):
        op.drop_column('categories', column, schema='fisac')
    for name in ('category_kind', 'category_role', 'category_settlement'):
        op.execute(f'DROP TYPE fisac.{name}')


def _pieces() -> None:
    op.execute('ALTER TYPE fisac.purchase_kind RENAME TO piece_kind')
    op.add_column(
        'sales',
        sa.Column('kind', sa.Enum('invoice', 'credit_note', name='piece_kind', schema='fisac', create_type=False), server_default='invoice', nullable=False),
        schema='fisac',
    )
    for table in ('sales', 'purchases'):
        op.execute(f'UPDATE fisac.{table} SET payment_date = document_date WHERE payment_date IS NULL')
        op.alter_column(table, 'payment_date', nullable=False, schema='fisac')
        op.drop_constraint(f'ck_{table}_paid_has_date', table, schema='fisac')
    op.alter_column('purchase_lines', 'isoc_scheme_id', nullable=True, schema='fisac')


def _fixed_assets() -> None:
    # Their depreciation rows cascade.
    op.execute('DELETE FROM fisac.fixed_assets WHERE purchase_line_id IS NULL')
    op.drop_constraint('ck_fixed_assets_acquisition_value_positive', 'fixed_assets', schema='fisac')
    op.drop_column('fixed_assets', 'acquisition_date', schema='fisac')
    op.drop_column('fixed_assets', 'acquisition_value', schema='fisac')
    op.alter_column('fixed_assets', 'purchase_line_id', nullable=False, schema='fisac')
    op.drop_constraint('fixed_assets_purchase_line_id_fkey', 'fixed_assets', type_='foreignkey', schema='fisac')
    op.create_foreign_key(
        'fixed_assets_purchase_line_id_fkey', 'fixed_assets', 'purchase_lines',
        ['purchase_line_id'], ['id'],
        source_schema='fisac', referent_schema='fisac', ondelete='RESTRICT',
    )


def upgrade() -> None:
    _categories()
    _pieces()
    _fixed_assets()


def downgrade() -> None:
    raise NotImplementedError('0006_tranche_b cannot be downgraded: restore a backup instead')
