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
    # Day of the month the account's Visa charges are paid (1-31). A Visa flow
    # never stores its own payment_date (see ck_flows_no_visa_payment_date) -
    # this is what the projection uses instead to compute the flow's effective
    # payment date, together with visa_closing_day below.
    visa_payment_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # Day of the month the Visa statement closes (1-31). An invoice dated after
    # it lands on the *next* statement instead: with closing 25 / payment 5, an
    # invoice on Mar 26 closes Apr 25 and is paid May 5, while one on Mar 25
    # closes that same day and is paid Apr 5. NULL means "closes on the payment
    # day", which is exactly the behavior from before this column existed.
    visa_closing_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "visa_payment_day IS NULL OR (visa_payment_day >= 1 AND visa_payment_day <= 31)",
            name="ck_accounts_visa_payment_day_range",
        ),
        CheckConstraint(
            "visa_closing_day IS NULL OR (visa_closing_day >= 1 AND visa_closing_day <= 31)",
            name="ck_accounts_visa_closing_day_range",
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


class LedgerAccount(Base):
    """A general ledger account - one entry of the chart of accounts.

    Named LedgerAccount, not Account: Account is already this codebase's
    bank-account/entity concept (is_company, vat_applicable, Visa days).
    """

    __tablename__ = "ledger_accounts"
    __table_args__ = (
        UniqueConstraint("account_id", "code", name="uq_ledger_accounts_account_code"),
        CheckConstraint("code ~ '^[0-9]+$'", name="ck_ledger_accounts_code_digits"),
        # pcmn_class is a denormalization of the code's first digit, kept so
        # reports can filter and group without parsing the code. These two
        # checks keep it from drifting and confine codes to the real PCMN
        # classes - together they reject a code starting with 0, 8 or 9.
        CheckConstraint(
            "pcmn_class = CAST(LEFT(code, 1) AS SMALLINT)",
            name="ck_ledger_accounts_class_matches_code",
        ),
        CheckConstraint(
            "pcmn_class >= 1 AND pcmn_class <= 7",
            name="ck_ledger_accounts_class_range",
        ),
        # The chart's natural order is the code, so there is no sort_key and no
        # /move endpoint here - unlike every other table. Listing is ORDER BY
        # code, which is self-maintaining. This composite index serves both the
        # ordering and the per-Account lookup.
        Index("ix_ledger_accounts_account_code", "account_id", "code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # The chart is per Account, mirroring Category - a company Account and a
    # personal Account do not share one.
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    # PCMN code, digits only, hierarchical by prefix: 61 > 610 > 6100.
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Belgian PCMN class, always the code's first digit: 1 equity/long-term
    # debt, 2 fixed assets, 3 inventory, 4 receivables/payables, 5 cash,
    # 6 charges, 7 produits. Only 6 and 7 are reachable from flow lines today;
    # 1-5 are definable so the chart is complete.
    pcmn_class: Mapped[int] = mapped_column(SmallInteger, nullable=False)


class Flow(Base):
    __tablename__ = "flows"
    __table_args__ = (
        # A flow with no payment method makes no payment, so it carries no
        # payment_date and never reaches the cashflow projection.
        CheckConstraint(
            "payment_method IS NOT NULL OR payment_date IS NULL",
            name="ck_flows_no_method_no_payment_date",
        ),
        # A Visa flow's actual payment date is derived by the projection from
        # invoice_date and the account's visa_closing_day/visa_payment_day -
        # never stored on the flow itself.
        # The native enum's Postgres labels are the Python member *names*
        # (VISA), not their .value ('visa') - matches how the initial
        # migration declared the enum's labels.
        CheckConstraint(
            "payment_method != 'VISA' OR payment_date IS NULL",
            name="ck_flows_no_visa_payment_date",
        ),
        CheckConstraint("ratio >= 0 AND ratio <= 1", name="ck_flows_ratio_range"),
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
    # payment_date means no dated payment -> excluded from the projection,
    # except for a Visa flow (see ck_flows_no_visa_payment_date), whose
    # effective payment date the projection derives from invoice_date +
    # Account.visa_closing_day/visa_payment_day instead.
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
    # Share (0-1) of this flow recognised in its invoice year; 1 for the normal
    # case. A service whose coverage runs past the fiscal year end - an annual
    # car insurance with a May anniversary - carries the share falling inside
    # the invoice's year, so a May 2026 invoice covering May 2026 to April 2027
    # is 0.66667. It sits on the flow rather than the line because the coverage
    # period is a property of the invoice, so every line is scaled alike.
    # A single scalar is only ever correct for one fiscal year: the remainder
    # is dropped, not deferred. See the spec's "flows.ratio" section.
    ratio: Mapped[Decimal] = mapped_column(
        Numeric(6, 5), nullable=False, server_default="1"
    )


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
    # Which ledger account this line books to. Booking is per line, not per
    # flow: Flow carries no amount, so only the line level can split one
    # invoice across ledger accounts. Nullable so lines can be booked
    # gradually and existing rows migrate with no backfill; the annual
    # accounts report buckets unbooked lines explicitly rather than dropping
    # them. SET NULL mirrors Flow.category_id - deleting a ledger account
    # unbooks its lines instead of destroying them.
    ledger_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledger_accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )
