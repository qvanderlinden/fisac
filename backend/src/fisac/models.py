"""The data model of fisac - Compta simplifiée.

One company keeps simplified books: its sales, purchases, miscellaneous
movements and fixed assets are the pieces; the director's pay, the VAT returns
and the corporate tax (ISOC) are settled per fiscal year; the opening inventory
carries over what the company owned and owed when the year began.

Only what someone types is stored. The journals, the VAT and ISOC figures, the
result of the year and the closing inventory are all computed from these
tables, never kept, so they cannot drift from the pieces they come from.

Money is Numeric(12, 2) in euros, rates are Numeric(5, 2) percentages (21 for
21 %). Native enums store each member's value (`values_callable`), so the
Postgres labels are the lowercase strings below, not the member names.
"""

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
    text,
)
from qv_auth import UserMixin
from sqlalchemy.orm import Mapped, mapped_column

from fisac.db import Base

# Rows a person orders by hand (invoice lines, partners, ...) carry a
# "fractional index" string (see fractional_index.py). COLLATE "C" forces
# byte-order comparison so Postgres ORDER BY matches the app's lexicographic
# key math regardless of the database's default collation. Everything else is
# listed by its own columns (number, date, label).
_SortKey = String(collation="C")
_Money = Numeric(12, 2)
_Rate = Numeric(5, 2)


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    # inherit_schema puts the type in the fisac schema beside its table;
    # without it the type lands in whatever schema the connection's
    # search_path resolves first, which is public on most managed Postgres.
    return Enum(
        cls,
        name=name,
        native_enum=True,
        inherit_schema=True,
        values_callable=lambda e: [m.value for m in e],
    )


# --- company ---------------------------------------------------------------


class LegalForm(enum.StrEnum):
    SRL = "srl"
    SA = "sa"
    SC = "sc"
    # personne physique: a self-employed person rather than a company
    NATURAL_PERSON = "natural_person"


class VatRegime(enum.StrEnum):
    QUARTERLY = "quarterly"
    MONTHLY = "monthly"
    # franchise and none both charge and recover no VAT; they differ only in
    # the company's status towards the VAT administration
    FRANCHISE = "franchise"
    NONE = "none"


class Company(Base):
    """The one company these books are kept for - a single row, id 1."""

    __tablename__ = "company"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_company_single_row"),
        CheckConstraint(
            "fiscal_year_start_month >= 1 AND fiscal_year_start_month <= 12",
            name="ck_company_fiscal_year_start_month_range",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=False, server_default="1"
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    legal_form: Mapped[LegalForm] = mapped_column(
        _enum(LegalForm, "legal_form"), nullable=False, server_default=LegalForm.SRL.value
    )
    # Numéro d'entreprise (BCE/KBO), kept as typed.
    bce_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vat_regime: Mapped[VatRegime] = mapped_column(
        _enum(VatRegime, "vat_regime"), nullable=False, server_default=VatRegime.QUARTERLY.value
    )
    registered_office: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # Stored without spaces, upper case; grouped by four for display.
    iban: Mapped[str | None] = mapped_column(String(34), nullable=True)
    # The month every fiscal year starts on; it ends the day before, a year later.
    fiscal_year_start_month: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default="1"
    )
    manager_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    manager_since: Mapped[date | None] = mapped_column(Date, nullable=True)
    # A paid manager has a rémunération computed every month; an unpaid one none.
    manager_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class Partner(Base):
    """An associé: who holds the company's shares and what they brought in."""

    __tablename__ = "partners"
    __table_args__ = (
        CheckConstraint("shares >= 0", name="ck_partners_shares_positive"),
        CheckConstraint("contribution >= 0", name="ck_partners_contribution_positive"),
        Index("ix_partners_sort_key", "sort_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    shares: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # The apport; the partners' total is the company's apport in its equity.
    contribution: Mapped[Decimal] = mapped_column(_Money, nullable=False, server_default="0")
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)


# --- fiscal years ----------------------------------------------------------


class FiscalYearState(enum.StrEnum):
    OPEN = "open"
    CLOSED = "closed"
    # A year kept outside fisac: only its closing inventory is here, as the
    # opening inventory of the year after it.
    INVENTORY_ONLY = "inventory_only"


class FiscalYear(Base):
    __tablename__ = "fiscal_years"
    __table_args__ = (
        UniqueConstraint("start_date", name="uq_fiscal_years_start_date"),
        CheckConstraint("end_date > start_date", name="ck_fiscal_years_dates_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    state: Mapped[FiscalYearState] = mapped_column(
        _enum(FiscalYearState, "fiscal_year_state"),
        nullable=False,
        server_default=FiscalYearState.OPEN.value,
    )
    # The three conditions of the ISOC reduced rate (20 % on the first
    # €100 000), as the ISOC screen ticks them for the year: a small company,
    # a director paid at least the legal minimum, shares not held by another
    # company for half or more.
    isoc_small_company: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    isoc_minimum_pay: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    isoc_shares_owned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class EquityLine(Base):
    """A line of the equity at the start of a year, besides the partners' apport.

    E.g. a réserve de liquidation or the perte reportée; signed, a loss is
    negative.
    """

    __tablename__ = "equity_lines"
    __table_args__ = (Index("ix_equity_lines_fiscal_year_sort_key", "fiscal_year_id", "sort_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[Decimal] = mapped_column(_Money, nullable=False)
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)


# --- configuration ---------------------------------------------------------


class ThirdParty(Base):
    """A tiers: a client or a supplier the pieces name."""

    __tablename__ = "third_parties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Optional, to pay the tiers by transfer. Stored without spaces, upper
    # case; the API checks it with ISO 13616 (length per country, mod 97).
    iban: Mapped[str | None] = mapped_column(String(34), nullable=True)


class VatScheme(Base):
    """A régime de TVA a line picks: its rate, and how much of it comes back.

    for_sales / for_purchases say on which side the scheme is offered; a
    scheme offered on purchases says what share of its VAT is recovered (100
    recoverable, 0 non recoverable, 50 a car), the rest being a cost.
    """

    __tablename__ = "vat_schemes"
    __table_args__ = (
        UniqueConstraint("label", name="uq_vat_schemes_label"),
        CheckConstraint("rate >= 0 AND rate <= 100", name="ck_vat_schemes_rate_range"),
        CheckConstraint(
            "recoverable_rate IS NULL OR (recoverable_rate >= 0 AND recoverable_rate <= 100)",
            name="ck_vat_schemes_recoverable_rate_range",
        ),
        CheckConstraint("for_sales OR for_purchases", name="ck_vat_schemes_some_side"),
        CheckConstraint(
            "for_purchases = (recoverable_rate IS NOT NULL)",
            name="ck_vat_schemes_recoverable_iff_purchases",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    rate: Mapped[Decimal] = mapped_column(_Rate, nullable=False)
    recoverable_rate: Mapped[Decimal | None] = mapped_column(_Rate, nullable=True)
    for_sales: Mapped[bool] = mapped_column(Boolean, nullable=False)
    for_purchases: Mapped[bool] = mapped_column(Boolean, nullable=False)


class IsocRubric(enum.StrEnum):
    """The ISOC screen's line for the disallowed part of an expense."""

    RESTAURANT = "restaurant"
    CAR = "car"
    OTHER = "other"


class IsocScheme(Base):
    """A régime ISOC: the share of an expense the corporate tax admits."""

    __tablename__ = "isoc_schemes"
    __table_args__ = (
        UniqueConstraint("label", name="uq_isoc_schemes_label"),
        CheckConstraint(
            "deductible_rate >= 0 AND deductible_rate <= 100",
            name="ck_isoc_schemes_deductible_rate_range",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    deductible_rate: Mapped[Decimal] = mapped_column(_Rate, nullable=False)
    rubric: Mapped[IsocRubric] = mapped_column(
        _enum(IsocRubric, "isoc_rubric"), nullable=False, server_default=IsocRubric.OTHER.value
    )


class DepreciationMethod(enum.StrEnum):
    LINEAR = "linear"
    # twice the linear rate on what remains, until linear over the remaining
    # life gives more
    DECLINING = "declining"


class DepreciationFirstYear(enum.StrEnum):
    # the first year counts the days from acquisition to the year end, of 365
    PRORATA = "prorata"
    FULL = "full"


class DepreciationModel(Base):
    """A modèle d'amortissement an immobilisation follows."""

    __tablename__ = "depreciation_models"
    __table_args__ = (
        UniqueConstraint("label", name="uq_depreciation_models_label"),
        CheckConstraint("years >= 1 AND years <= 50", name="ck_depreciation_models_years_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    years: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    method: Mapped[DepreciationMethod] = mapped_column(
        _enum(DepreciationMethod, "depreciation_method"),
        nullable=False,
        server_default=DepreciationMethod.LINEAR.value,
    )
    first_year: Mapped[DepreciationFirstYear] = mapped_column(
        _enum(DepreciationFirstYear, "depreciation_first_year"),
        nullable=False,
        server_default=DepreciationFirstYear.PRORATA.value,
    )


class FinancialAccountKind(enum.StrEnum):
    BANK = "bank"
    # a deferred debit card: its purchases are paid by the bank once a month
    CARD = "card"
    CASH = "cash"


class FinancialAccount(Base):
    """A compte financier, each with its own journal (Banque, Visa, ...)."""

    __tablename__ = "financial_accounts"
    __table_args__ = (UniqueConstraint("code", name="uq_financial_accounts_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # The journal's code, which numbers its realised movements (BQ-0042).
    code: Mapped[str] = mapped_column(String(8), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[FinancialAccountKind] = mapped_column(
        _enum(FinancialAccountKind, "financial_account_kind"), nullable=False
    )


class PaymentMethodType(enum.StrEnum):
    TRANSFER = "transfer"
    # domiciliation
    DIRECT_DEBIT = "direct_debit"
    CARD = "card"
    CASH = "cash"


class PaymentMethod(Base):
    """A moyen de paiement: a piece picks one, and it picks the financial account.

    A card adds its monthly statement: purchases up to statement_closing_day
    form the month's statement, which settlement_account pays on
    statement_payment_day of the month after. Day 31 stands for the last day
    of every month. The statements are computed, never stored.
    """

    __tablename__ = "payment_methods"
    __table_args__ = (
        CheckConstraint(
            "(type = 'card') = (statement_closing_day IS NOT NULL"
            " AND statement_payment_day IS NOT NULL AND settlement_account_id IS NOT NULL)",
            name="ck_payment_methods_card_statement",
        ),
        CheckConstraint(
            "statement_closing_day IS NULL"
            " OR (statement_closing_day >= 1 AND statement_closing_day <= 31)",
            name="ck_payment_methods_closing_day_range",
        ),
        CheckConstraint(
            "statement_payment_day IS NULL"
            " OR (statement_payment_day >= 1 AND statement_payment_day <= 31)",
            name="ck_payment_methods_payment_day_range",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[PaymentMethodType] = mapped_column(
        _enum(PaymentMethodType, "payment_method_type"), nullable=False
    )
    financial_account_id: Mapped[int] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    statement_closing_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    statement_payment_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    settlement_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=True
    )


class CategoryDirection(enum.StrEnum):
    # offered on the lines of sales
    SALES = "sales"
    # offered on the lines of purchases
    PURCHASES = "purchases"


class Category(Base):
    """A catégorie: the label of a sale or purchase line, on one side only."""

    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("label", name="uq_categories_label"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    direction: Mapped[CategoryDirection] = mapped_column(
        _enum(CategoryDirection, "category_direction"), nullable=False
    )
    # An archived category is offered on no new piece but keeps its pieces.
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


# --- pieces ----------------------------------------------------------------
#
# A sale, a purchase and a miscellaneous movement are numbered within their
# fiscal year (S-0001, A-0001, D-0001). The fiscal year is the one the piece
# is booked in; the API keeps fiscal_year_id in step with the booking date.
#
# Configuration a piece points at is ON DELETE RESTRICT: a tiers, a category,
# a scheme or a payment method in use stays, as the screens promise.


class PieceKind(enum.StrEnum):
    INVOICE = "invoice"
    # note de crédit: counts negative everywhere
    CREDIT_NOTE = "credit_note"


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        UniqueConstraint("fiscal_year_id", "number", name="uq_sales_fiscal_year_number"),
        CheckConstraint("number >= 1", name="ck_sales_number_positive"),
        # NULL means "the document date"; an override equal to it is stored as NULL.
        CheckConstraint(
            "booking_date IS NULL OR booking_date <> document_date",
            name="ck_sales_booking_date_override",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="RESTRICT"), nullable=False
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[PieceKind] = mapped_column(
        _enum(PieceKind, "piece_kind"),
        nullable=False,
        server_default=PieceKind.INVOICE.value,
    )
    # The client. Nullable while a new sale is being typed.
    third_party_id: Mapped[int | None] = mapped_column(
        ForeignKey("third_parties.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    description: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    # The invoice date: it books the revenue in the result.
    document_date: Mapped[date] = mapped_column(Date, nullable=False)
    # The accounting date when it differs from the document date; the booking
    # date picks the VAT period.
    booking_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_method_id: Mapped[int] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="RESTRICT"), nullable=False
    )
    # The date it was paid, or is expected to be. Unpaid with a date after the
    # year end, the sale is a receivable of the closing inventory.
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class SaleLine(Base):
    __tablename__ = "sale_lines"
    __table_args__ = (Index("ix_sale_lines_sale_sort_key", "sale_id", "sort_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sale_id: Mapped[int] = mapped_column(
        ForeignKey("sales.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    # Excluding VAT. The line's net is unit_price × quantity in whole cents;
    # its VAT is the net at the scheme's rate, also in whole cents.
    unit_price: Mapped[Decimal] = mapped_column(_Money, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False, server_default="1")
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    vat_scheme_id: Mapped[int] = mapped_column(
        ForeignKey("vat_schemes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)


class Purchase(Base):
    __tablename__ = "purchases"
    __table_args__ = (
        UniqueConstraint("fiscal_year_id", "number", name="uq_purchases_fiscal_year_number"),
        CheckConstraint("number >= 1", name="ck_purchases_number_positive"),
        CheckConstraint(
            "booking_date IS NULL OR booking_date <> document_date",
            name="ck_purchases_booking_date_override",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="RESTRICT"), nullable=False
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[PieceKind] = mapped_column(
        _enum(PieceKind, "piece_kind"),
        nullable=False,
        server_default=PieceKind.INVOICE.value,
    )
    # The supplier. Nullable while a new purchase is being typed.
    third_party_id: Mapped[int | None] = mapped_column(
        ForeignKey("third_parties.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    description: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    document_date: Mapped[date] = mapped_column(Date, nullable=False)
    # E.g. an invoice dated in March but received in April, booked in Q2.
    booking_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_method_id: Mapped[int] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="RESTRICT"), nullable=False
    )
    # Paid by card, the date of the card payment; the bank pays it later with
    # the card's statement.
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    # NULL for a card purchase, which has no paid status: the date it was
    # used decides.
    paid: Mapped[bool | None] = mapped_column(Boolean, nullable=True, server_default="false")


class PurchaseLine(Base):
    """A line of a purchase. Its charge is the net plus the VAT not recovered;
    the ISOC scheme splits that charge into admitted and disallowed. A line of
    a fixed-asset category is no charge: it goes to the register."""

    __tablename__ = "purchase_lines"
    __table_args__ = (Index("ix_purchase_lines_purchase_sort_key", "purchase_id", "sort_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_id: Mapped[int] = mapped_column(
        ForeignKey("purchases.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    unit_price: Mapped[Decimal] = mapped_column(_Money, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False, server_default="1")
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    vat_scheme_id: Mapped[int] = mapped_column(
        ForeignKey("vat_schemes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Kept for the ISOC slice; the pieces screens do not show it.
    isoc_scheme_id: Mapped[int | None] = mapped_column(
        ForeignKey("isoc_schemes.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)


class OpeningSection(enum.StrEnum):
    """Where a line sits in the opening inventory. The fixed assets have no
    section here: the register computes their value."""

    # avoirs
    CASH = "cash"
    RECEIVABLES = "receivables"
    # dettes
    SUPPLIERS = "suppliers"
    TAX_AND_SOCIAL = "tax_and_social"
    DIRECTOR = "director"


class OpeningLine(Base):
    """A line of the opening inventory of a year, typed once.

    Its value is the sum of its items when it has some, else its amount. A
    cash line names the financial account whose journal starts from it.
    """

    __tablename__ = "opening_lines"
    __table_args__ = (
        UniqueConstraint(
            "fiscal_year_id",
            "financial_account_id",
            name="uq_opening_lines_fiscal_year_financial_account",
        ),
        CheckConstraint(
            "financial_account_id IS NULL OR section = 'cash'",
            name="ck_opening_lines_account_is_cash",
        ),
        Index("ix_opening_lines_fiscal_year_sort_key", "fiscal_year_id", "sort_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="CASCADE"), nullable=False
    )
    section: Mapped[OpeningSection] = mapped_column(
        _enum(OpeningSection, "opening_section"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    # Unsigned: the section says whether it is owned or owed. Ignored once the
    # line has items.
    amount: Mapped[Decimal] = mapped_column(_Money, nullable=False, server_default="0")
    financial_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("financial_accounts.id", ondelete="RESTRICT"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)


class OpeningLineItem(Base):
    """One piece behind an opening line: an unpaid invoice, a tax notice."""

    __tablename__ = "opening_line_items"
    __table_args__ = (Index("ix_opening_line_items_line_sort_key", "opening_line_id", "sort_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    opening_line_id: Mapped[int] = mapped_column(
        ForeignKey("opening_lines.id", ondelete="CASCADE"), nullable=False
    )
    # Free text: a tiers, or e.g. "ISOC 2024".
    counterparty: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    reference: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    amount: Mapped[Decimal] = mapped_column(_Money, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)


class MiscDirection(enum.StrEnum):
    IN = "in"
    OUT = "out"


class MiscEntry(Base):
    """A divers: a payment no sale, purchase or pay makes - a VAT balance, a
    debt carried over, money in from the director."""

    __tablename__ = "misc_entries"
    __table_args__ = (
        UniqueConstraint("fiscal_year_id", "number", name="uq_misc_entries_fiscal_year_number"),
        CheckConstraint("number >= 1", name="ck_misc_entries_number_positive"),
        CheckConstraint("amount >= 0", name="ck_misc_entries_amount_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="RESTRICT"), nullable=False
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_method_id: Mapped[int] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="RESTRICT"), nullable=False
    )
    # The direction is its own column so a movement typed at 0 keeps its sign.
    direction: Mapped[MiscDirection] = mapped_column(
        _enum(MiscDirection, "misc_direction"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(_Money, nullable=False, server_default="0")
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Realised, or still planned (it then counts only in the balance projection).
    realised: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # The opening inventory line it collects or pays, which it reduces.
    opening_line_id: Mapped[int | None] = mapped_column(
        ForeignKey("opening_lines.id", ondelete="RESTRICT"), nullable=True, index=True
    )


# --- fixed assets ----------------------------------------------------------


class FixedAsset(Base):
    """An immobilisation of the register, numbered across years (I-001)."""

    __tablename__ = "fixed_assets"
    __table_args__ = (
        UniqueConstraint("number", name="uq_fixed_assets_number"),
        UniqueConstraint("purchase_line_id", name="uq_fixed_assets_purchase_line"),
        CheckConstraint("number >= 1", name="ck_fixed_assets_number_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    depreciation_model_id: Mapped[int] = mapped_column(
        ForeignKey("depreciation_models.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # The purchase line it was bought with: its date and value are the line's.
    # RESTRICT: a line with an asset is not deleted before the asset.
    purchase_line_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_lines.id", ondelete="RESTRICT"), nullable=False
    )


class FixedAssetDepreciation(Base):
    """One year of an asset's depreciation schedule.

    The schedule is stored, not recomputed on read: a register taken over
    keeps its own amounts, and any year can be typed over. Changing the value,
    date or model recomputes the whole schedule from the model.
    """

    __tablename__ = "fixed_asset_depreciations"
    __table_args__ = (CheckConstraint("amount >= 0", name="ck_fixed_asset_depreciations_amount_positive"),)

    fixed_asset_id: Mapped[int] = mapped_column(
        ForeignKey("fixed_assets.id", ondelete="CASCADE"), primary_key=True
    )
    # The calendar year of the fiscal year's end; assets predate the fiscal
    # years kept here, so this is a year, not a fiscal_years row.
    year: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    amount: Mapped[Decimal] = mapped_column(_Money, nullable=False)
    # Typed over rather than computed from the model.
    edited: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


# --- director's pay --------------------------------------------------------


class PayComponent(enum.StrEnum):
    NET_SALARY = "net_salary"
    # précompte professionnel
    WITHHOLDING_TAX = "withholding_tax"
    SOCIAL_CONTRIBUTIONS = "social_contributions"


class PayPeriodicity(enum.StrEnum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class PaySchedule(Base):
    """How one part of the director's pay is paid over a fiscal year."""

    __tablename__ = "pay_schedules"
    __table_args__ = (
        UniqueConstraint("fiscal_year_id", "component", name="uq_pay_schedules_fiscal_year_component"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="CASCADE"), nullable=False
    )
    component: Mapped[PayComponent] = mapped_column(
        _enum(PayComponent, "pay_component"), nullable=False
    )
    periodicity: Mapped[PayPeriodicity] = mapped_column(
        _enum(PayPeriodicity, "pay_periodicity"), nullable=False
    )
    payment_method_id: Mapped[int] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="RESTRICT"), nullable=False
    )


class PayInstallment(Base):
    """One month's or one quarter's payment of a pay schedule.

    It books in the result for its period, paid or not; it moves cash on its
    payment date, planned until that date has passed.
    """

    __tablename__ = "pay_installments"
    __table_args__ = (
        # 1-12 for a monthly schedule, 1-4 for a quarterly one; the API
        # rewrites the rows when the periodicity changes.
        CheckConstraint("period >= 1 AND period <= 12", name="ck_pay_installments_period_range"),
        CheckConstraint("amount >= 0", name="ck_pay_installments_amount_positive"),
    )

    pay_schedule_id: Mapped[int] = mapped_column(
        ForeignKey("pay_schedules.id", ondelete="CASCADE"), primary_key=True
    )
    period: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[Decimal] = mapped_column(_Money, nullable=False, server_default="0")


class BenefitInKind(Base):
    """An avantage en nature besides the company car, valued per year."""

    __tablename__ = "benefits_in_kind"
    __table_args__ = (
        CheckConstraint("annual_value >= 0", name="ck_benefits_in_kind_annual_value_positive"),
        Index("ix_benefits_in_kind_fiscal_year_sort_key", "fiscal_year_id", "sort_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    annual_value: Mapped[Decimal] = mapped_column(_Money, nullable=False, server_default="0")
    sort_key: Mapped[str] = mapped_column(_SortKey, nullable=False)


class CarFuel(enum.StrEnum):
    ELECTRIC = "electric"
    # hybride rechargeable
    PLUG_IN_HYBRID = "plug_in_hybrid"
    PETROL = "petrol"
    DIESEL = "diesel"


class CompanyCar(Base):
    """A voiture de société the director uses.

    Its benefit in kind and its ISOC deductibility are computed for each year
    it is in use, from these facts and that year's legal parameters.
    """

    __tablename__ = "company_cars"
    __table_args__ = (
        CheckConstraint("co2_emissions >= 0", name="ck_company_cars_co2_positive"),
        CheckConstraint("catalogue_value >= 0", name="ck_company_cars_catalogue_value_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    fuel: Mapped[CarFuel] = mapped_column(_enum(CarFuel, "car_fuel"), nullable=False)
    # g/km, WLTP
    co2_emissions: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    # options and VAT included
    catalogue_value: Mapped[Decimal] = mapped_column(_Money, nullable=False)
    # The order date picks the ISOC deductibility regime.
    ordered_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # The first registration date gives the car's age for the benefit in kind.
    registered_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Fuel or charging paid by the company raises the disallowed share.
    fuel_paid_by_company: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # NULL while the director still uses it.
    returned_on: Mapped[date | None] = mapped_column(Date, nullable=True)


class MealVoucherPlan(Base):
    """The chèques-repas of a fiscal year."""

    __tablename__ = "meal_voucher_plans"
    __table_args__ = (
        CheckConstraint("face_value >= 0", name="ck_meal_voucher_plans_face_value_positive"),
        CheckConstraint(
            "personal_share >= 0 AND personal_share <= face_value",
            name="ck_meal_voucher_plans_personal_share_range",
        ),
        CheckConstraint("vouchers >= 0", name="ck_meal_voucher_plans_vouchers_positive"),
    )

    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="CASCADE"), primary_key=True
    )
    # per voucher
    face_value: Mapped[Decimal] = mapped_column(_Money, nullable=False)
    # per voucher, withheld from the net salary; the employer pays the rest
    personal_share: Mapped[Decimal] = mapped_column(_Money, nullable=False)
    # in the year, one per day worked
    vouchers: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")


# --- taxes -----------------------------------------------------------------


class VatReturn(Base):
    """A VAT return period of a fiscal year, a quarter or a month.

    Its sales and purchases are those booked in the period; only the filing
    date is typed.
    """

    __tablename__ = "vat_returns"
    __table_args__ = (
        UniqueConstraint("period_start", name="uq_vat_returns_period_start"),
        CheckConstraint("period_end >= period_start", name="ck_vat_returns_period_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    filed_on: Mapped[date | None] = mapped_column(Date, nullable=True)


class IsocPrepayment(Base):
    """A versement anticipé (VA1-VA4) of the corporate tax of a fiscal year."""

    __tablename__ = "isoc_prepayments"
    __table_args__ = (
        UniqueConstraint("fiscal_year_id", "number", name="uq_isoc_prepayments_fiscal_year_number"),
        CheckConstraint("number >= 1 AND number <= 4", name="ck_isoc_prepayments_number_range"),
        CheckConstraint("amount >= 0", name="ck_isoc_prepayments_amount_positive"),
        CheckConstraint(
            "NOT paid OR payment_date IS NOT NULL", name="ck_isoc_prepayments_paid_has_date"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fiscal_year_id: Mapped[int] = mapped_column(
        ForeignKey("fiscal_years.id", ondelete="CASCADE"), nullable=False
    )
    number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(_Money, nullable=False, server_default="0")
    payment_method_id: Mapped[int] = mapped_column(
        ForeignKey("payment_methods.id", ondelete="RESTRICT"), nullable=False
    )
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class User(Base, UserMixin):
    """A person who signs in; access is granted by an administrator (qv-auth)."""
