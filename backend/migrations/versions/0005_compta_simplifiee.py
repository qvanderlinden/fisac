"""compta simplifiée data model

Replaces the personal-accounting model (accounts, flows, ledger accounts) with
the one of the "fisac - Compta simplifiée" design: one company, its fiscal
years, its configuration, its pieces (sales, purchases, divers, fixed assets),
the director's pay, the VAT returns, the ISOC prepayments and the opening
inventory. See docs/superpowers/specs/2026-10-23-compta-simplifiee-data-model.md.

The old tables are dropped with their rows: nothing of them carries over.

Revision ID: 0005_compta_simplifiee
Revises: 0004_ledger_accounts
Create Date: 2026-10-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '0005_compta_simplifiee'
down_revision: Union[str, None] = '0004_ledger_accounts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_personal_accounting() -> None:
    # Children first; their indexes and constraints go with them. The two
    # native enums are types of their own and outlive the tables. 0001
    # created them unqualified, so they sit in whichever schema the
    # search_path resolved first - fisac or public - and are dropped the same
    # unqualified way. The new types below are created in fisac explicitly.
    for table in ('flow_lines', 'flows', 'ledger_accounts', 'categories', 'accounts'):
        op.drop_table(table, schema='fisac')
    op.execute('DROP TYPE flow_kind')
    op.execute('DROP TYPE payment_method')


def _create_compta_simplifiee() -> None:
    op.create_table('company',
    sa.Column('id', sa.Integer(), server_default='1', autoincrement=False, nullable=False),
    sa.Column('name', sa.String(length=200), server_default='', nullable=False),
    sa.Column('legal_form', sa.Enum('srl', 'sa', 'sc', 'natural_person', name='legal_form', schema='fisac', inherit_schema=True), server_default='srl', nullable=False),
    sa.Column('bce_number', sa.String(length=20), nullable=True),
    sa.Column('vat_regime', sa.Enum('quarterly', 'monthly', 'franchise', 'none', name='vat_regime', schema='fisac', inherit_schema=True), server_default='quarterly', nullable=False),
    sa.Column('registered_office', sa.String(length=300), nullable=True),
    sa.Column('iban', sa.String(length=34), nullable=True),
    sa.Column('fiscal_year_start_month', sa.SmallInteger(), server_default='1', nullable=False),
    sa.Column('manager_name', sa.String(length=200), nullable=True),
    sa.Column('manager_since', sa.Date(), nullable=True),
    sa.Column('manager_paid', sa.Boolean(), server_default='true', nullable=False),
    sa.CheckConstraint('fiscal_year_start_month >= 1 AND fiscal_year_start_month <= 12', name='ck_company_fiscal_year_start_month_range'),
    sa.CheckConstraint('id = 1', name='ck_company_single_row'),
    sa.PrimaryKeyConstraint('id'),
    schema='fisac'
    )
    op.create_table('company_cars',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('model', sa.String(length=200), server_default='', nullable=False),
    sa.Column('fuel', sa.Enum('electric', 'plug_in_hybrid', 'petrol', 'diesel', name='car_fuel', schema='fisac', inherit_schema=True), nullable=False),
    sa.Column('co2_emissions', sa.SmallInteger(), server_default='0', nullable=False),
    sa.Column('catalogue_value', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('ordered_on', sa.Date(), nullable=True),
    sa.Column('registered_on', sa.Date(), nullable=True),
    sa.Column('fuel_paid_by_company', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('returned_on', sa.Date(), nullable=True),
    sa.CheckConstraint('catalogue_value >= 0', name='ck_company_cars_catalogue_value_positive'),
    sa.CheckConstraint('co2_emissions >= 0', name='ck_company_cars_co2_positive'),
    sa.PrimaryKeyConstraint('id'),
    schema='fisac'
    )
    op.create_table('depreciation_models',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('label', sa.String(length=120), nullable=False),
    sa.Column('years', sa.SmallInteger(), nullable=False),
    sa.Column('method', sa.Enum('linear', 'declining', name='depreciation_method', schema='fisac', inherit_schema=True), server_default='linear', nullable=False),
    sa.Column('first_year', sa.Enum('prorata', 'full', name='depreciation_first_year', schema='fisac', inherit_schema=True), server_default='prorata', nullable=False),
    sa.CheckConstraint('years >= 1 AND years <= 50', name='ck_depreciation_models_years_range'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('label', name='uq_depreciation_models_label'),
    schema='fisac'
    )
    op.create_table('financial_accounts',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('code', sa.String(length=8), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('kind', sa.Enum('bank', 'card', 'cash', name='financial_account_kind', schema='fisac', inherit_schema=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code', name='uq_financial_accounts_code'),
    schema='fisac'
    )
    op.create_table('fiscal_years',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('state', sa.Enum('open', 'closed', 'inventory_only', name='fiscal_year_state', schema='fisac', inherit_schema=True), server_default='open', nullable=False),
    sa.Column('isoc_small_company', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('isoc_minimum_pay', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('isoc_shares_owned', sa.Boolean(), server_default='true', nullable=False),
    sa.CheckConstraint('end_date > start_date', name='ck_fiscal_years_dates_order'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('start_date', name='uq_fiscal_years_start_date'),
    schema='fisac'
    )
    op.create_table('isoc_schemes',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('label', sa.String(length=120), nullable=False),
    sa.Column('deductible_rate', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('rubric', sa.Enum('restaurant', 'car', 'other', name='isoc_rubric', schema='fisac', inherit_schema=True), server_default='other', nullable=False),
    sa.CheckConstraint('deductible_rate >= 0 AND deductible_rate <= 100', name='ck_isoc_schemes_deductible_rate_range'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('label', name='uq_isoc_schemes_label'),
    schema='fisac'
    )
    op.create_table('partners',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('shares', sa.Integer(), server_default='0', nullable=False),
    sa.Column('contribution', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('sort_key', sa.String(collation='C'), nullable=False),
    sa.CheckConstraint('contribution >= 0', name='ck_partners_contribution_positive'),
    sa.CheckConstraint('shares >= 0', name='ck_partners_shares_positive'),
    sa.PrimaryKeyConstraint('id'),
    schema='fisac'
    )
    op.create_index('ix_partners_sort_key', 'partners', ['sort_key'], unique=False, schema='fisac')
    op.create_table('third_parties',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('iban', sa.String(length=34), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    schema='fisac'
    )
    op.create_table('vat_schemes',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('label', sa.String(length=120), nullable=False),
    sa.Column('rate', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('recoverable_rate', sa.Numeric(precision=5, scale=2), nullable=True),
    sa.Column('for_sales', sa.Boolean(), nullable=False),
    sa.Column('for_purchases', sa.Boolean(), nullable=False),
    sa.CheckConstraint('for_purchases = (recoverable_rate IS NOT NULL)', name='ck_vat_schemes_recoverable_iff_purchases'),
    sa.CheckConstraint('for_sales OR for_purchases', name='ck_vat_schemes_some_side'),
    sa.CheckConstraint('rate >= 0 AND rate <= 100', name='ck_vat_schemes_rate_range'),
    sa.CheckConstraint('recoverable_rate IS NULL OR (recoverable_rate >= 0 AND recoverable_rate <= 100)', name='ck_vat_schemes_recoverable_rate_range'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('label', name='uq_vat_schemes_label'),
    schema='fisac'
    )
    op.create_table('benefits_in_kind',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('fiscal_year_id', sa.Integer(), nullable=False),
    sa.Column('label', sa.String(length=200), server_default='', nullable=False),
    sa.Column('annual_value', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('sort_key', sa.String(collation='C'), nullable=False),
    sa.CheckConstraint('annual_value >= 0', name='ck_benefits_in_kind_annual_value_positive'),
    sa.ForeignKeyConstraint(['fiscal_year_id'], ['fisac.fiscal_years.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    schema='fisac'
    )
    op.create_index('ix_benefits_in_kind_fiscal_year_sort_key', 'benefits_in_kind', ['fiscal_year_id', 'sort_key'], unique=False, schema='fisac')
    op.create_table('categories',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('label', sa.String(length=120), nullable=False),
    sa.Column('kind', sa.Enum('revenue', 'expense', 'tax', 'fixed_asset', 'outside', name='category_kind', schema='fisac', inherit_schema=True), nullable=False),
    sa.Column('role', sa.Enum('sales', 'net_salary', 'social_contributions', 'withholding_tax', 'corporate_tax', 'card_statement', 'fixed_asset', name='category_role', schema='fisac', inherit_schema=True), nullable=True),
    sa.Column('settlement', sa.Enum('vat_return', 'opening_inventory', 'director_current_account', name='category_settlement', schema='fisac', inherit_schema=True), nullable=True),
    sa.Column('default_vat_scheme_id', sa.Integer(), nullable=True),
    sa.Column('default_isoc_scheme_id', sa.Integer(), nullable=True),
    sa.Column('archived', sa.Boolean(), server_default='false', nullable=False),
    sa.CheckConstraint("role IS NULL OR (role = 'sales' AND kind = 'revenue') OR (role IN ('net_salary', 'social_contributions', 'withholding_tax') AND kind = 'expense') OR (role = 'corporate_tax' AND kind = 'tax') OR (role = 'card_statement' AND kind = 'outside') OR (role = 'fixed_asset' AND kind = 'fixed_asset')", name='ck_categories_role_kind'),
    sa.CheckConstraint("settlement IS NULL OR kind = 'outside'", name='ck_categories_settlement_outside'),
    sa.ForeignKeyConstraint(['default_isoc_scheme_id'], ['fisac.isoc_schemes.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['default_vat_scheme_id'], ['fisac.vat_schemes.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('label', name='uq_categories_label'),
    schema='fisac'
    )
    op.create_index('uq_categories_role', 'categories', ['role'], unique=True, schema='fisac', postgresql_where=sa.text('role IS NOT NULL'))
    op.create_table('equity_lines',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('fiscal_year_id', sa.Integer(), nullable=False),
    sa.Column('label', sa.String(length=200), nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('sort_key', sa.String(collation='C'), nullable=False),
    sa.ForeignKeyConstraint(['fiscal_year_id'], ['fisac.fiscal_years.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    schema='fisac'
    )
    op.create_index('ix_equity_lines_fiscal_year_sort_key', 'equity_lines', ['fiscal_year_id', 'sort_key'], unique=False, schema='fisac')
    op.create_table('meal_voucher_plans',
    sa.Column('fiscal_year_id', sa.Integer(), nullable=False),
    sa.Column('face_value', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('personal_share', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('vouchers', sa.SmallInteger(), server_default='0', nullable=False),
    sa.CheckConstraint('face_value >= 0', name='ck_meal_voucher_plans_face_value_positive'),
    sa.CheckConstraint('personal_share >= 0 AND personal_share <= face_value', name='ck_meal_voucher_plans_personal_share_range'),
    sa.CheckConstraint('vouchers >= 0', name='ck_meal_voucher_plans_vouchers_positive'),
    sa.ForeignKeyConstraint(['fiscal_year_id'], ['fisac.fiscal_years.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('fiscal_year_id'),
    schema='fisac'
    )
    op.create_table('opening_lines',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('fiscal_year_id', sa.Integer(), nullable=False),
    sa.Column('section', sa.Enum('cash', 'receivables', 'suppliers', 'tax_and_social', 'director', name='opening_section', schema='fisac', inherit_schema=True), nullable=False),
    sa.Column('label', sa.String(length=200), nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('financial_account_id', sa.Integer(), nullable=True),
    sa.Column('note', sa.String(length=300), nullable=True),
    sa.Column('sort_key', sa.String(collation='C'), nullable=False),
    sa.CheckConstraint("financial_account_id IS NULL OR section = 'cash'", name='ck_opening_lines_account_is_cash'),
    sa.ForeignKeyConstraint(['financial_account_id'], ['fisac.financial_accounts.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['fiscal_year_id'], ['fisac.fiscal_years.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('fiscal_year_id', 'financial_account_id', name='uq_opening_lines_fiscal_year_financial_account'),
    schema='fisac'
    )
    op.create_index('ix_opening_lines_fiscal_year_sort_key', 'opening_lines', ['fiscal_year_id', 'sort_key'], unique=False, schema='fisac')
    op.create_table('payment_methods',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('type', sa.Enum('transfer', 'direct_debit', 'card', 'cash', name='payment_method_type', schema='fisac', inherit_schema=True), nullable=False),
    sa.Column('financial_account_id', sa.Integer(), nullable=False),
    sa.Column('statement_closing_day', sa.SmallInteger(), nullable=True),
    sa.Column('statement_payment_day', sa.SmallInteger(), nullable=True),
    sa.Column('settlement_account_id', sa.Integer(), nullable=True),
    sa.CheckConstraint("(type = 'card') = (statement_closing_day IS NOT NULL AND statement_payment_day IS NOT NULL AND settlement_account_id IS NOT NULL)", name='ck_payment_methods_card_statement'),
    sa.CheckConstraint('statement_closing_day IS NULL OR (statement_closing_day >= 1 AND statement_closing_day <= 31)', name='ck_payment_methods_closing_day_range'),
    sa.CheckConstraint('statement_payment_day IS NULL OR (statement_payment_day >= 1 AND statement_payment_day <= 31)', name='ck_payment_methods_payment_day_range'),
    sa.ForeignKeyConstraint(['financial_account_id'], ['fisac.financial_accounts.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['settlement_account_id'], ['fisac.financial_accounts.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    schema='fisac'
    )
    op.create_index(op.f('ix_fisac_payment_methods_financial_account_id'), 'payment_methods', ['financial_account_id'], unique=False, schema='fisac')
    op.create_table('vat_returns',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('fiscal_year_id', sa.Integer(), nullable=False),
    sa.Column('period_start', sa.Date(), nullable=False),
    sa.Column('period_end', sa.Date(), nullable=False),
    sa.Column('filed_on', sa.Date(), nullable=True),
    sa.CheckConstraint('period_end >= period_start', name='ck_vat_returns_period_order'),
    sa.ForeignKeyConstraint(['fiscal_year_id'], ['fisac.fiscal_years.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('period_start', name='uq_vat_returns_period_start'),
    schema='fisac'
    )
    op.create_index(op.f('ix_fisac_vat_returns_fiscal_year_id'), 'vat_returns', ['fiscal_year_id'], unique=False, schema='fisac')
    op.create_table('isoc_prepayments',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('fiscal_year_id', sa.Integer(), nullable=False),
    sa.Column('number', sa.SmallInteger(), nullable=False),
    sa.Column('due_date', sa.Date(), nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('payment_method_id', sa.Integer(), nullable=False),
    sa.Column('paid', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('payment_date', sa.Date(), nullable=True),
    sa.CheckConstraint('NOT paid OR payment_date IS NOT NULL', name='ck_isoc_prepayments_paid_has_date'),
    sa.CheckConstraint('amount >= 0', name='ck_isoc_prepayments_amount_positive'),
    sa.CheckConstraint('number >= 1 AND number <= 4', name='ck_isoc_prepayments_number_range'),
    sa.ForeignKeyConstraint(['fiscal_year_id'], ['fisac.fiscal_years.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['payment_method_id'], ['fisac.payment_methods.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('fiscal_year_id', 'number', name='uq_isoc_prepayments_fiscal_year_number'),
    schema='fisac'
    )
    op.create_table('misc_entries',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('fiscal_year_id', sa.Integer(), nullable=False),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.Column('label', sa.String(length=200), server_default='', nullable=False),
    sa.Column('entry_date', sa.Date(), nullable=False),
    sa.Column('payment_method_id', sa.Integer(), nullable=False),
    sa.Column('direction', sa.Enum('in', 'out', name='misc_direction', schema='fisac', inherit_schema=True), nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('category_id', sa.Integer(), nullable=False),
    sa.Column('realised', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('opening_line_id', sa.Integer(), nullable=True),
    sa.CheckConstraint('amount >= 0', name='ck_misc_entries_amount_positive'),
    sa.CheckConstraint('number >= 1', name='ck_misc_entries_number_positive'),
    sa.ForeignKeyConstraint(['category_id'], ['fisac.categories.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['fiscal_year_id'], ['fisac.fiscal_years.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['opening_line_id'], ['fisac.opening_lines.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['payment_method_id'], ['fisac.payment_methods.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('fiscal_year_id', 'number', name='uq_misc_entries_fiscal_year_number'),
    schema='fisac'
    )
    op.create_index(op.f('ix_fisac_misc_entries_category_id'), 'misc_entries', ['category_id'], unique=False, schema='fisac')
    op.create_index(op.f('ix_fisac_misc_entries_opening_line_id'), 'misc_entries', ['opening_line_id'], unique=False, schema='fisac')
    op.create_table('opening_line_items',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('opening_line_id', sa.Integer(), nullable=False),
    sa.Column('counterparty', sa.String(length=200), server_default='', nullable=False),
    sa.Column('reference', sa.String(length=200), server_default='', nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('sort_key', sa.String(collation='C'), nullable=False),
    sa.ForeignKeyConstraint(['opening_line_id'], ['fisac.opening_lines.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    schema='fisac'
    )
    op.create_index('ix_opening_line_items_line_sort_key', 'opening_line_items', ['opening_line_id', 'sort_key'], unique=False, schema='fisac')
    op.create_table('pay_schedules',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('fiscal_year_id', sa.Integer(), nullable=False),
    sa.Column('component', sa.Enum('net_salary', 'withholding_tax', 'social_contributions', name='pay_component', schema='fisac', inherit_schema=True), nullable=False),
    sa.Column('periodicity', sa.Enum('monthly', 'quarterly', name='pay_periodicity', schema='fisac', inherit_schema=True), nullable=False),
    sa.Column('payment_method_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['fiscal_year_id'], ['fisac.fiscal_years.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['payment_method_id'], ['fisac.payment_methods.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('fiscal_year_id', 'component', name='uq_pay_schedules_fiscal_year_component'),
    schema='fisac'
    )
    op.create_table('purchases',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('fiscal_year_id', sa.Integer(), nullable=False),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.Column('kind', sa.Enum('invoice', 'credit_note', name='purchase_kind', schema='fisac', inherit_schema=True), server_default='invoice', nullable=False),
    sa.Column('third_party_id', sa.Integer(), nullable=True),
    sa.Column('description', sa.String(length=200), server_default='', nullable=False),
    sa.Column('document_date', sa.Date(), nullable=False),
    sa.Column('booking_date', sa.Date(), nullable=True),
    sa.Column('payment_method_id', sa.Integer(), nullable=False),
    sa.Column('payment_date', sa.Date(), nullable=True),
    sa.Column('paid', sa.Boolean(), server_default='false', nullable=False),
    sa.CheckConstraint('NOT paid OR payment_date IS NOT NULL', name='ck_purchases_paid_has_date'),
    sa.CheckConstraint('booking_date IS NULL OR booking_date <> document_date', name='ck_purchases_booking_date_override'),
    sa.CheckConstraint('number >= 1', name='ck_purchases_number_positive'),
    sa.ForeignKeyConstraint(['fiscal_year_id'], ['fisac.fiscal_years.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['payment_method_id'], ['fisac.payment_methods.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['third_party_id'], ['fisac.third_parties.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('fiscal_year_id', 'number', name='uq_purchases_fiscal_year_number'),
    schema='fisac'
    )
    op.create_index(op.f('ix_fisac_purchases_third_party_id'), 'purchases', ['third_party_id'], unique=False, schema='fisac')
    op.create_table('sales',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('fiscal_year_id', sa.Integer(), nullable=False),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.Column('third_party_id', sa.Integer(), nullable=True),
    sa.Column('description', sa.String(length=200), server_default='', nullable=False),
    sa.Column('document_date', sa.Date(), nullable=False),
    sa.Column('booking_date', sa.Date(), nullable=True),
    sa.Column('payment_method_id', sa.Integer(), nullable=False),
    sa.Column('payment_date', sa.Date(), nullable=True),
    sa.Column('paid', sa.Boolean(), server_default='false', nullable=False),
    sa.CheckConstraint('NOT paid OR payment_date IS NOT NULL', name='ck_sales_paid_has_date'),
    sa.CheckConstraint('booking_date IS NULL OR booking_date <> document_date', name='ck_sales_booking_date_override'),
    sa.CheckConstraint('number >= 1', name='ck_sales_number_positive'),
    sa.ForeignKeyConstraint(['fiscal_year_id'], ['fisac.fiscal_years.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['payment_method_id'], ['fisac.payment_methods.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['third_party_id'], ['fisac.third_parties.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('fiscal_year_id', 'number', name='uq_sales_fiscal_year_number'),
    schema='fisac'
    )
    op.create_index(op.f('ix_fisac_sales_third_party_id'), 'sales', ['third_party_id'], unique=False, schema='fisac')
    op.create_table('pay_installments',
    sa.Column('pay_schedule_id', sa.Integer(), nullable=False),
    sa.Column('period', sa.SmallInteger(), nullable=False),
    sa.Column('payment_date', sa.Date(), nullable=True),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.CheckConstraint('amount >= 0', name='ck_pay_installments_amount_positive'),
    sa.CheckConstraint('period >= 1 AND period <= 12', name='ck_pay_installments_period_range'),
    sa.ForeignKeyConstraint(['pay_schedule_id'], ['fisac.pay_schedules.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('pay_schedule_id', 'period'),
    schema='fisac'
    )
    op.create_table('purchase_lines',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('purchase_id', sa.Integer(), nullable=False),
    sa.Column('description', sa.String(length=200), server_default='', nullable=False),
    sa.Column('unit_price', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('quantity', sa.Numeric(precision=10, scale=3), server_default='1', nullable=False),
    sa.Column('category_id', sa.Integer(), nullable=False),
    sa.Column('vat_scheme_id', sa.Integer(), nullable=False),
    sa.Column('isoc_scheme_id', sa.Integer(), nullable=False),
    sa.Column('sort_key', sa.String(collation='C'), nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['fisac.categories.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['isoc_scheme_id'], ['fisac.isoc_schemes.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['purchase_id'], ['fisac.purchases.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['vat_scheme_id'], ['fisac.vat_schemes.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    schema='fisac'
    )
    op.create_index(op.f('ix_fisac_purchase_lines_category_id'), 'purchase_lines', ['category_id'], unique=False, schema='fisac')
    op.create_index(op.f('ix_fisac_purchase_lines_isoc_scheme_id'), 'purchase_lines', ['isoc_scheme_id'], unique=False, schema='fisac')
    op.create_index(op.f('ix_fisac_purchase_lines_vat_scheme_id'), 'purchase_lines', ['vat_scheme_id'], unique=False, schema='fisac')
    op.create_index('ix_purchase_lines_purchase_sort_key', 'purchase_lines', ['purchase_id', 'sort_key'], unique=False, schema='fisac')
    op.create_table('sale_lines',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('sale_id', sa.Integer(), nullable=False),
    sa.Column('description', sa.String(length=200), server_default='', nullable=False),
    sa.Column('unit_price', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('quantity', sa.Numeric(precision=10, scale=3), server_default='1', nullable=False),
    sa.Column('category_id', sa.Integer(), nullable=False),
    sa.Column('vat_scheme_id', sa.Integer(), nullable=False),
    sa.Column('sort_key', sa.String(collation='C'), nullable=False),
    sa.ForeignKeyConstraint(['category_id'], ['fisac.categories.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['sale_id'], ['fisac.sales.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['vat_scheme_id'], ['fisac.vat_schemes.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    schema='fisac'
    )
    op.create_index(op.f('ix_fisac_sale_lines_category_id'), 'sale_lines', ['category_id'], unique=False, schema='fisac')
    op.create_index(op.f('ix_fisac_sale_lines_vat_scheme_id'), 'sale_lines', ['vat_scheme_id'], unique=False, schema='fisac')
    op.create_index('ix_sale_lines_sale_sort_key', 'sale_lines', ['sale_id', 'sort_key'], unique=False, schema='fisac')
    op.create_table('fixed_assets',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.Column('description', sa.String(length=200), server_default='', nullable=False),
    sa.Column('acquisition_date', sa.Date(), nullable=False),
    sa.Column('acquisition_value', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('depreciation_model_id', sa.Integer(), nullable=False),
    sa.Column('purchase_line_id', sa.Integer(), nullable=True),
    sa.CheckConstraint('acquisition_value >= 0', name='ck_fixed_assets_acquisition_value_positive'),
    sa.CheckConstraint('number >= 1', name='ck_fixed_assets_number_positive'),
    sa.ForeignKeyConstraint(['depreciation_model_id'], ['fisac.depreciation_models.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['purchase_line_id'], ['fisac.purchase_lines.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('number', name='uq_fixed_assets_number'),
    sa.UniqueConstraint('purchase_line_id', name='uq_fixed_assets_purchase_line'),
    schema='fisac'
    )
    op.create_index(op.f('ix_fisac_fixed_assets_depreciation_model_id'), 'fixed_assets', ['depreciation_model_id'], unique=False, schema='fisac')
    op.create_table('fixed_asset_depreciations',
    sa.Column('fixed_asset_id', sa.Integer(), nullable=False),
    sa.Column('year', sa.SmallInteger(), nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('edited', sa.Boolean(), server_default='false', nullable=False),
    sa.CheckConstraint('amount >= 0', name='ck_fixed_asset_depreciations_amount_positive'),
    sa.ForeignKeyConstraint(['fixed_asset_id'], ['fisac.fixed_assets.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('fixed_asset_id', 'year'),
    schema='fisac'
    )


# Reference data every company starts from: the Belgian VAT and ISOC schemes,
# the usual depreciation models, a bank account with its two payment methods,
# and the categories, among them the ones a screen books into by itself
# (role). All of it is editable afterwards; only the roles are fixed.
_VAT_SCHEMES = [
    # label, rate, recoverable_rate, for_sales, for_purchases
    ('Ventes 21 %', 21, None, True, False),
    ('Ventes 6 %', 6, None, True, False),
    ('Ventes 0 % · cocontractant', 0, None, True, False),
    ('Achats 21 % · récupérable', 21, 100, False, True),
    ('Achats 12 % · récupérable', 12, 100, False, True),
    ('Achats 6 % · récupérable', 6, 100, False, True),
    ('Achats 12 % · non récupérable', 12, 0, False, True),
    ('Achats 21 % · voiture 50 %', 21, 50, False, True),
    ('Exonéré 0 %', 0, 0, True, True),
    ('Investissements 21 %', 21, 100, False, True),
]

_ISOC_SCHEMES = [
    # label, deductible_rate, rubric
    ('100 %', 100, 'other'),
    ('69 % · restaurant', 69, 'restaurant'),
    ('75 % · voiture', 75, 'car'),
    ('50 % · cadeaux', 50, 'other'),
    ('0 % · rejeté', 0, 'other'),
]

_DEPRECIATION_MODELS = [
    # label, years
    ('Informatique · 3 ans', 3),
    ('Informatique · 5 ans', 5),
    ('Mobilier · 5 ans', 5),
    ('Matériel roulant · 5 ans', 5),
    ('Aménagements · 10 ans', 10),
]

_CATEGORIES = [
    # label, kind, role, settlement, default VAT scheme, default ISOC scheme
    ('Prestations de services', 'revenue', 'sales', None, 'Ventes 21 %', None),
    ('Autres recettes', 'revenue', None, None, 'Ventes 21 %', None),
    ('Rémunération du gérant', 'expense', 'net_salary', None, None, '100 %'),
    ('Cotisations sociales du gérant', 'expense', 'social_contributions', None, None, '100 %'),
    ('Précompte professionnel', 'expense', 'withholding_tax', None, None, '100 %'),
    ('Honoraires', 'expense', None, None, 'Achats 21 % · récupérable', '100 %'),
    ('Logiciels et abonnements', 'expense', None, None, 'Achats 21 % · récupérable', '100 %'),
    ('Petit matériel', 'expense', None, None, 'Achats 21 % · récupérable', '100 %'),
    ('Formation', 'expense', None, None, 'Achats 21 % · récupérable', '100 %'),
    ('Restaurant', 'expense', None, None, 'Achats 12 % · non récupérable', '69 % · restaurant'),
    ('Déplacements', 'expense', None, None, 'Achats 6 % · récupérable', '100 %'),
    ('Frais de voiture', 'expense', None, None, 'Achats 21 % · voiture 50 %', '75 % · voiture'),
    ('Frais bancaires', 'expense', None, None, 'Exonéré 0 %', '100 %'),
    ('Impôt des sociétés', 'tax', 'corporate_tax', None, None, None),
    ('TVA', 'outside', None, 'vat_return', None, None),
    ('Transfert interne', 'outside', 'card_statement', None, None, None),
    ('Reprise d’ouverture', 'outside', None, 'opening_inventory', None, None),
    ('Compte courant du gérant', 'outside', None, 'director_current_account', None, None),
    ('Immobilisation · au registre', 'fixed_asset', 'fixed_asset', None, 'Investissements 21 %', '100 %'),
]


def _seed_reference_data() -> None:
    conn = op.get_bind()
    for label, rate, recoverable, sales, purchases in _VAT_SCHEMES:
        conn.execute(
            sa.text(
                'INSERT INTO fisac.vat_schemes (label, rate, recoverable_rate, for_sales, for_purchases)'
                ' VALUES (:label, :rate, :recoverable, :sales, :purchases)'
            ),
            {'label': label, 'rate': rate, 'recoverable': recoverable, 'sales': sales, 'purchases': purchases},
        )
    for label, rate, rubric in _ISOC_SCHEMES:
        conn.execute(
            sa.text(
                'INSERT INTO fisac.isoc_schemes (label, deductible_rate, rubric)'
                ' VALUES (:label, :rate, CAST(:rubric AS fisac.isoc_rubric))'
            ),
            {'label': label, 'rate': rate, 'rubric': rubric},
        )
    for label, years in _DEPRECIATION_MODELS:
        conn.execute(
            sa.text('INSERT INTO fisac.depreciation_models (label, years) VALUES (:label, :years)'),
            {'label': label, 'years': years},
        )
    conn.execute(
        sa.text(
            "INSERT INTO fisac.financial_accounts (code, name, kind)"
            " VALUES ('BQ', 'Banque · compte courant', 'bank')"
        )
    )
    conn.execute(
        sa.text(
            "INSERT INTO fisac.payment_methods (name, type, financial_account_id)"
            " SELECT m.name, CAST(m.type AS fisac.payment_method_type), a.id"
            " FROM (VALUES ('Virement bancaire', 'transfer'), ('Domiciliation', 'direct_debit'))"
            " AS m (name, type), fisac.financial_accounts a WHERE a.code = 'BQ'"
        )
    )
    for label, kind, role, settlement, vat, isoc in _CATEGORIES:
        conn.execute(
            sa.text(
                'INSERT INTO fisac.categories'
                ' (label, kind, role, settlement, default_vat_scheme_id, default_isoc_scheme_id)'
                ' VALUES (:label, CAST(:kind AS fisac.category_kind),'
                ' CAST(:role AS fisac.category_role), CAST(:settlement AS fisac.category_settlement),'
                ' (SELECT id FROM fisac.vat_schemes WHERE label = :vat),'
                ' (SELECT id FROM fisac.isoc_schemes WHERE label = :isoc))'
            ),
            {'label': label, 'kind': kind, 'role': role, 'settlement': settlement, 'vat': vat, 'isoc': isoc},
        )


def upgrade() -> None:
    _drop_personal_accounting()
    _create_compta_simplifiee()
    _seed_reference_data()


def downgrade() -> None:
    # The personal-accounting rows were dropped by upgrade() and cannot be
    # brought back; recreating their empty tables would only pretend to.
    raise NotImplementedError('0005_compta_simplifiee cannot be downgraded: restore a backup instead')
