# Compta simplifiée — data model

Date: 2026-10-23
Status: implemented (models + migration 0005); API and frontend not started

## Purpose

Replace fisac's personal-accounting model (accounts, flows, ledger accounts,
projection) with the model behind the "fisac - Compta simplifiée" design
canvas: simplified books for one Belgian company. The canvas has a screen, a
modal and a mobile variant for each of:

- mouvements: ventes, achats, divers, immobilisations, journaux
- dirigeant: rémunération
- taxes: TVA, ISOC
- clôture: résultat, inventaire
- configuration: structure société, inventaire d'ouverture, tiers,
  catégories, régimes de TVA, régimes ISOC, modèles d'amortissement, moyens de
  paiement

plus a fiscal-year switcher (FY2026 · ouvert, FY2025 · inventaire seul).

This spec covers the data model only. The HTTP API, the computations and the
frontend are separate pieces of work.

## The one rule

**Only what someone types is stored.** Every screen that shows figures
derived from other screens computes them on read:

| screen | computed from |
| --- | --- |
| Journaux (one per financial account) | the opening cash lines, then every sale, purchase, divers, pay installment, ISOC prepayment and card statement, by payment date and payment method |
| Card statements (Décompte Visa · mars) | the card's purchases and the method's closing / payment days |
| TVA, per period | the sales and purchases whose booking date falls in it; only `filed_on` is stored |
| ISOC | the result before tax, the disallowed share per ISOC rubric, the year's three reduced-rate conditions and its prepayments |
| Résultat | sale lines (revenue), purchase charges, pay installments and depreciation of the year |
| Inventaire (closing) | the opening inventory, reduced by the divers that settle its lines, plus everything still unpaid at the year end, the register's residual value, the VAT, withholding and ISOC still due |
| Rémunération synthèse, benefit in kind of the car | the pay schedules, benefits, the car and the year's legal parameters |
| "uses" counts on configuration screens | the pieces that reference the row |

Legal parameters that change by year (ISOC 20 % / 25 % and the €100 000
bracket, the car benefit-in-kind formula, the meal-voucher limits, the
director's minimum pay) belong in code, keyed by year, not in the database.

## Tables

All tables live in the `fisac` schema. Money is `Numeric(12, 2)`, rates are
`Numeric(5, 2)` percentages. Native enums store each member's value, in the
`fisac` schema (`inherit_schema`).

### Company

- `company`: one row, `id = 1` (checked): name, legal form, BCE number, VAT
  regime (quarterly, monthly, franchise, none), registered office, IBAN, the
  month fiscal years start on, the manager and whether they are paid.
- `partners`: name, number of shares, apport. Their total apport is the
  equity's apport.

### Fiscal years

- `fiscal_years`: start and end dates, state (`open`, `closed`,
  `inventory_only` for a year kept outside fisac, present only so its closing
  inventory can open the next one) and the three ISOC reduced-rate conditions
  the ISOC screen ticks.
- `equity_lines`: the equity at the start of the year besides the apport
  (réserve de liquidation, perte reportée), signed.

### Configuration

- `third_parties` (tiers): name, optional IBAN.
- `vat_schemes`: rate, the side(s) it is offered on, and on purchases the
  recoverable share (checked: present exactly when offered on purchases).
- `isoc_schemes`: deductible share and the ISOC rubric its disallowed part
  goes to (restaurant, car, other).
- `depreciation_models`: years, linear or declining, prorata or full first
  year.
- `financial_accounts`: one journal each (`BQ` Banque, `VI` Visa ...), kind
  bank, card or cash.
- `payment_methods`: type and financial account; a card also has its
  statement closing day, payment day and the account that settles it
  (checked: all three exactly for cards).
- `categories`: kind (revenue, expense, tax, fixed_asset, outside), default
  VAT and ISOC schemes for new lines, archived flag, and two markers:
  - `role`: the category a screen books into by itself (sales, net salary,
    social contributions, withholding tax, corporate tax, card statement,
    fixed asset). Unique, and checked against the kind it implies.
  - `settlement`: for outside categories, what a divers of that category
    settles besides the cash (a VAT return balance, an opening-inventory
    line, the director's current account).

### Pieces

Sales, purchases and divers are numbered within their fiscal year (`S-0001`,
`A-0001`, `D-0001`): `UNIQUE (fiscal_year_id, number)`. The fiscal year is the
one the piece is booked in.

- `sales` / `sale_lines`: client, description, document date, an optional
  booking date (stored only when it differs, checked), payment method,
  payment date, paid. Lines: unit price × quantity, category, VAT scheme.
- `purchases` / `purchase_lines`: the same, plus invoice or credit note, and
  an ISOC scheme per line.
- `misc_entries` (divers): label, date, payment method, direction and
  unsigned amount (so a 0 keeps its sign), category, realised or planned, and
  the opening-inventory line it settles if any.
- `fixed_assets`: numbered across years (`A-004`), acquisition date and
  value, depreciation model, and the purchase line it came from (unique; SET
  NULL when the purchase is deleted, so the register keeps it).
- `fixed_asset_depreciations`: the schedule, one row per year, stored rather
  than recomputed so a register taken over keeps its own amounts and any year
  can be typed over (`edited`). Keyed by calendar year, since assets predate
  the fiscal years kept here.

Configuration a piece references is `ON DELETE RESTRICT`: a tiers, category,
scheme or payment method in use cannot be deleted, as the screens promise.

### Director's pay

- `pay_schedules`: per year and component (net salary, withholding tax,
  social contributions): monthly or quarterly, payment method.
- `pay_installments`: per schedule and period (1-12): payment date, amount.
  Planned until its date has passed; it counts in the result for its period
  either way.
- `benefits_in_kind`: label and yearly value.
- `company_cars`: model, fuel, CO₂, catalogue value, order date (picks the
  ISOC deductibility regime), registration date (the car's age), fuel paid by
  the company, returned date. Company-level, not per year: the same car
  spans years and its benefit is recomputed for each.
- `meal_voucher_plans`: per year, face value, personal share (checked ≤ face
  value), number of vouchers.

### Taxes

- `vat_returns`: per period of a year, start, end, filing date.
- `isoc_prepayments`: VA1-VA4 per year (checked 1-4): due date, amount,
  payment method, paid, payment date.

### Opening inventory

- `opening_lines`: per year, section (cash, receivables, suppliers, tax and
  social, director), label, amount, note; a cash line names the financial
  account whose journal starts from it (unique per year, checked cash only).
  Fixed assets have no line: the register computes their value.
- `opening_line_items`: the pieces behind a line (unpaid invoices, tax
  notices); a line with items is worth their sum.

## Reference data

Migration 0005 seeds what every company starts from, editable afterwards:
the Belgian VAT schemes of the design, the five ISOC schemes, five
depreciation models, the `BQ` bank account with transfer and direct-debit
methods, and the design's nineteen categories with their roles and
settlements. A card, the company row, fiscal years and tiers are created by
the user.

## Decisions that depart from the canvas

- Sales categories default to "Ventes 21 %"; the canvas gave
  "Prestations de services" the purchase scheme "Achats 21 % · récupérable".
- An immobilisation links a purchase *line*, not a purchase: the purchase
  modal already says which line "va au registre".
- Fixed assets (`A-004`) and purchases (`A-0001`) share the "A-" prefix in
  the canvas; they are separate sequences here, and the UI should give one
  of them another prefix.
- The company car is not tied to a fiscal year.

## Migration

`0005_compta_simplifiee` drops the five old tables and their two enum types
(created unqualified by 0001, so dropped the same way, wherever the
search_path put them), creates the new tables and seeds the reference data.
It has no downgrade: the old rows are gone.
