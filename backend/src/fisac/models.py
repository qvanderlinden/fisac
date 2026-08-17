import enum
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from fisac.db import Base


class FlowKind(str, enum.Enum):
    REVENUE = "revenue"
    EXPENSE = "expense"


class PaymentMethod(str, enum.Enum):
    # English enum members; the French domain names are the display labels:
    # direct_debit = domiciliation bancaire, bank_transfer = virement.
    # A NULL payment_method (no member) means no payment is actually made -
    # this replaces the old "compte courant associés" and, per the flows
    # CheckConstraint below, implies no payment_date and no cashflow impact.
    DIRECT_DEBIT = "direct_debit"
    BANK_TRANSFER = "bank_transfer"
    VISA = "visa"


# Ordering everywhere is a "fractional index" string (see fractional_index.py),
# never a timestamp - no created_at/updated_at columns exist on any table.
# COLLATE "C" forces byte-order comparison so Postgres ORDER BY matches the
# app's lexicographic key math regardless of the database's default collation.
_SortKey = String(collation="C")


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    current_balance: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, server_default="0"
    )
    is_company: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # Only meaningful when is_company is true; normalized to false otherwise
    # (see schemas.AccountCreate/routers.accounts.update_account).
    vat_applicable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # Day of the month the account's Visa charges are paid (1-31). Used only to
    # auto-fill a Visa flow's payment_date in the create form - not otherwise
    # load-bearing.
    visa_payment_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "visa_payment_day IS NULL OR (visa_payment_day >= 1 AND visa_payment_day <= 31)",
            name="ck_accounts_visa_payment_day_range",
        ),
        Index("ix_accounts_sort_key", "sort_key"),
    )


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("account_id", "name", name="uq_categories_account_name"),
        CheckConstraint(
            "tax_deduction_rate >= 0 AND tax_deduction_rate <= 100",
            name="ck_categories_tax_deduction_rate_range",
        ),
        CheckConstraint(
            "vat_deduction_rate >= 0 AND vat_deduction_rate <= 100",
            name="ck_categories_vat_deduction_rate_range",
        ),
        Index("ix_categories_account_sort_key", "account_id", "sort_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Share (0-100) of a flow's amount deductible for income/corporate tax. E.g.
    # Belgian car expenses are ~50% deductible; the non-deductible remainder is
    # the "dépense non admise".
    tax_deduction_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default="100"
    )
    # Share (0-100) of the flow's VAT that is recoverable.
    vat_deduction_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default="100"
    )
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)


class Flow(Base):
    __tablename__ = "flows"
    __table_args__ = (
        # A flow with no payment method makes no payment, so it carries no
        # payment_date and never reaches the cashflow projection.
        CheckConstraint(
            "payment_method IS NOT NULL OR payment_date IS NULL",
            name="ck_flows_no_method_no_payment_date",
        ),
        Index("ix_flows_account_payment_date", "account_id", "payment_date"),
        Index("ix_flows_account_sort_key", "account_id", "sort_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[FlowKind] = mapped_column(
        Enum(FlowKind, name="flow_kind", native_enum=True), nullable=False, index=True
    )
    # One category per flow (carries the deductibility %). SET NULL so deleting
    # a category doesn't cascade-delete the flows that referenced it.
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # invoice_date drives fiscal reporting; payment_date drives cashflow. A NULL
    # payment_date means no dated payment -> excluded from the projection.
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, name="payment_method", native_enum=True), nullable=True
    )
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # Set when the flow was created through POST /bulk: every flow of that one
    # bulk call shares the same UUID, so a whole generated batch can be deleted
    # in one call (DELETE /batch/{batch_id}) while individual flows stay
    # deletable on their own. NULL for flows created one at a time.
    batch_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    # Reverse charge (autoliquidation): the supplier invoices net, so no VAT is
    # paid to them (gross = net for cashflow), but the buyer self-assesses the
    # notional VAT on the return - as output VAT and, per the category's
    # vat_deduction_rate, as deductible VAT. Only set on expenses.
    reverse_charge: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)


class FlowLine(Base):
    __tablename__ = "flow_lines"
    __table_args__ = (Index("ix_flow_lines_flow_sort_key", "flow_id", "sort_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    flow_id: Mapped[int] = mapped_column(
        ForeignKey("flows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Net base (excl. VAT), unsigned - the flow's kind supplies the sign. The
    # flow header stores no amount; a flow's net/VAT/gross totals are computed
    # by summing its lines.
    amount_net: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # VAT rate as a percentage, e.g. 21 for 21%.
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, server_default="0")
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)
