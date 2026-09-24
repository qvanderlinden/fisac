"""ledger accounts and per-line booking

Revision ID: 0004_ledger_accounts
Revises: 0003_visa_closing_day
Create Date: 2026-09-24 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '0004_ledger_accounts'
down_revision: Union[str, None] = '0003_visa_closing_day'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The chart of accounts, one per Account (mirrors categories). pcmn_class
    # is a denormalization of the code's first digit kept so reports can group
    # without parsing it; the two checks keep the two in step and confine
    # codes to the real PCMN classes 1-7. No sort_key: the chart's natural
    # order is the code.
    op.create_table(
        'ledger_accounts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('pcmn_class', sa.SmallInteger(), nullable=False),
        sa.CheckConstraint("code ~ '^[0-9]+$'", name='ck_ledger_accounts_code_digits'),
        # Textual comparison (no SMALLINT cast) so a non-digit code fails as a
        # CheckViolation (23514) instead of a DataError (22P02) from a failed
        # cast - see models.py for why this ordering matters.
        sa.CheckConstraint(
            "pcmn_class::text = left(code, 1)",
            name='ck_ledger_accounts_class_matches_code',
        ),
        sa.CheckConstraint(
            'pcmn_class >= 1 AND pcmn_class <= 7',
            name='ck_ledger_accounts_class_range',
        ),
        sa.ForeignKeyConstraint(['account_id'], ['fisac.accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        # This unique constraint's implicit index also serves the chart's
        # natural ORDER BY code within an Account - no separate index is
        # created for that.
        sa.UniqueConstraint('account_id', 'code', name='uq_ledger_accounts_account_code'),
        schema='fisac',
    )
    # Booking is per line: Flow carries no amount, so only the line level can
    # split one invoice across ledger accounts. Nullable, so existing lines
    # migrate with no backfill. SET NULL mirrors flows.category_id - deleting
    # a ledger account unbooks its lines rather than destroying them.
    op.add_column(
        'flow_lines',
        sa.Column('ledger_account_id', sa.Integer(), nullable=True),
        schema='fisac',
    )
    op.create_index(
        op.f('ix_fisac_flow_lines_ledger_account_id'),
        'flow_lines',
        ['ledger_account_id'],
        unique=False,
        schema='fisac',
    )
    # Name left to Postgres (flow_lines_ledger_account_id_fkey), matching the
    # unnamed foreign keys migration 0001 created - this MetaData carries no
    # naming convention.
    op.create_foreign_key(
        None,
        'flow_lines',
        'ledger_accounts',
        ['ledger_account_id'],
        ['id'],
        source_schema='fisac',
        referent_schema='fisac',
        ondelete='SET NULL',
    )
    # Share (0-1) of the flow recognised in its invoice year, for services
    # whose coverage runs past the fiscal year end. NOT NULL, but the server
    # default backfills existing rows with 1 - the no-proration behaviour they
    # had before this column - so no data migration is needed.
    op.add_column(
        'flows',
        sa.Column(
            'ratio', sa.Numeric(precision=6, scale=5), server_default='1', nullable=False
        ),
        schema='fisac',
    )
    op.create_check_constraint(
        'ck_flows_ratio_range', 'flows', 'ratio >= 0 AND ratio <= 1', schema='fisac'
    )


def downgrade() -> None:
    op.drop_constraint('ck_flows_ratio_range', 'flows', schema='fisac', type_='check')
    op.drop_column('flows', 'ratio', schema='fisac')
    # Dropping the column drops its foreign key with it, so the constraint
    # needs no separate drop.
    op.drop_index(
        op.f('ix_fisac_flow_lines_ledger_account_id'),
        table_name='flow_lines',
        schema='fisac',
    )
    op.drop_column('flow_lines', 'ledger_account_id', schema='fisac')
    op.drop_table('ledger_accounts', schema='fisac')
