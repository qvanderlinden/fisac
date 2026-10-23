# Tranche B — pieces, register, journals, VAT and result

Date: 2026-10-23
Status: design approved in conversation; spec awaiting review
Builds on: slice A (`2026-10-23-tranche-a-socle-design.md`, merged) and the
data model (`2026-10-23-compta-simplifiee-data-model.md`, migration 0005)

## Intent

Slice A delivered the configuration screens. This slice makes fisac keep the
books: sales and purchases are typed, fixed assets are put in the register
from a purchase line, and the journals, the VAT periods and the result are
computed from them.

What the user decided while designing it, in their words or close to them:

- A category is only a label used to filter and aggregate. It does not
  suggest VAT or ISOC schemes and has no type, role or settlement. It keeps a
  direction (sales or purchases) so each screen offers only its own.
- The result follows three rules:
  - every sale line increases the result;
  - a purchase line that no fixed asset takes over decreases it by its amount,
    with the right share of VAT (its net plus the VAT that is not recovered);
  - a purchase line taken over by a fixed asset decreases it only by that
    asset's depreciation of the year.
- A fixed asset is created from the register, by first picking a purchase
  line in a searchable select; its value and date follow from the line and
  are shown read only.
- Miscellaneous movements (divers), the director's pay, ISOC and the opening
  inventory stay out of this slice.

Success: on desktop and mobile, against the real API, a user can type sales
and purchases (invoices and credit notes), put a purchase line in the
register and adjust its schedule, and read the bank and card journals, the
VAT periods and the result, all consistent with each other and with the
three rules; the computations are covered by tests.

## Scope

In:

- migration 0006 (categories simplified, sales kind, required payment date,
  fixed assets tied to a purchase line, ISOC scheme optional on lines)
- `/api` routes for sales, purchases, their lines, fixed assets and their
  schedules, and the computed journals, VAT periods and result
- pure computation modules in `backend/src/fisac/books/`
- screens: Ventes, Achats, Immobilisations, Journaux, TVA, Résultat (desktop
  and mobile), and the Catégories screen and API of slice A simplified
- the end-to-end smoke extended to the new screens

Out: divers, rémunération, ISOC, inventaire (closing) and inventaire
d'ouverture screens; paying a VAT balance (it is a divers); Belgian return
grid numbers; attachments ("Joindre la facture"); exports.

## Decisions

| topic | decision |
| --- | --- |
| category | `label`, `direction` (`sales` / `purchases`), `archived`; nothing else |
| payment status | `payment_date` always required (expected while unpaid) and a `paid` checkbox typed by the user; unpaid is "planifiée" when the date is today or later, "en retard" when it has passed |
| dates | document date required; booking date optional (NULL = the document date); the booking date places a piece in its fiscal year, VAT period and result |
| credit notes | sales and purchases are an invoice or a credit note; a credit note reverses every effect (result, VAT, journal) |
| card purchases | a purchase paid by card leaves the card's journal at its payment date; each month's card statement, computed from the card's closing and payment days, leaves the bank journal and enters the card's |
| journal opening | every journal starts the fiscal year at 0 (no opening inventory in this slice) |
| VAT screen | the canvas summary per period (bases, VAT due, VAT recovered, balance, due date, filing date), no grid numbers; monthly or quarterly from the company's VAT regime |
| fixed asset | created from one purchase-invoice line, which it alone takes over; value and date derived from the line; schedule stored and editable |
| computations | on the server, in pure Python modules; the frontend only displays |

## Amounts

All amounts are computed in cents with half-up rounding, line by line, then
summed. For a line:

- `net` = `unit_price × quantity`, rounded to the cent;
- `vat` = `net × rate / 100`, rounded;
- for a purchase line, `recovered` = `vat × recoverable_rate / 100`, rounded
  (0 when the scheme has no recoverable rate), and `charge` = `net + vat −
  recovered`;
- the piece's totals are the sums: HTVA = Σ net, TVA = Σ vat, TVAC = HTVA +
  TVA.

A credit note's lines are typed with positive prices; every effect uses
their amounts with the opposite sign (the sign of the piece: +1 invoice,
−1 credit note).

## Data model changes — migration 0006

- **categories**: drop `kind`, `role`, `settlement`, `default_vat_scheme_id`,
  `default_isoc_scheme_id`, their constraints and the `category_kind`,
  `category_role`, `category_settlement` types; add `direction`
  (`category_direction` enum, `sales` / `purchases`, NOT NULL), filled from the
  old kind (revenue → sales, anything else → purchases). The seeded
  categories with no place in this model are deleted when no line uses them:
  TVA, Transfert interne, Reprise d'ouverture, Compte courant du gérant,
  Impôt des sociétés, Rémunération du gérant, Cotisations sociales du gérant,
  Précompte professionnel, Immobilisation · au registre. The label stays
  unique across directions.
- **sales**: add `kind` (the existing `purchase_kind` enum renamed
  `piece_kind`, default `invoice`).
- **sales, purchases**: `payment_date` NOT NULL (existing NULLs take the
  document date); the `ck_*_paid_has_date` checks go.
- **purchase_lines**: `isoc_scheme_id` nullable (kept for the ISOC slice, not
  shown).
- **fixed_assets**: drop `acquisition_date` and `acquisition_value`;
  `purchase_line_id` NOT NULL, unique, `ON DELETE RESTRICT` (rows without a
  line are deleted; none exist in practice). Shown as `I-001` (3 digits),
  numbered across years.
- **fixed_asset_depreciations** stays: one row per fiscal year (`year` = the
  calendar year the fiscal year ends in), `amount`, `edited`.
- `misc_entries.category_id`, the pay tables and the other out-of-scope
  tables are left as they are; nothing of this slice reads them.

The models module, `errors.CONSTRAINT_MESSAGES` and the slice-A code that
used roles and kinds are updated to match (the 409 `system` code goes).

## API

Conventions of slice A apply: routes under `/api`, Pydantic `XCreate` /
`XUpdate` / `XRead` schemas, money as decimal strings, dates as ISO strings,
the same error shapes, autosave by PATCHing one field.

### Categories (changed)

`CategoryRead` = `id, label, direction, archived, uses`; `GET` accepts
`?direction=`. A sale line must use a `sales` category and a purchase line a
`purchases` one (422 on `category_id`, "Choisissez une catégorie de vente" /
"… d'achat"). The direction of a category in use cannot change (422).

### Sales and purchases

- `GET /api/fiscal-years/{fy}/sales` → `list[SaleRead]`, by number;
  `POST /api/sales` → 201 `SaleRead`; `GET / PATCH / DELETE /api/sales/{id}`.
  Same for `purchases`.
- `SaleRead`: `id, fiscal_year_id, number, kind, third_party_id,
  third_party_name, description, document_date, booking_date (effective),
  payment_method_id, payment_date, paid, status (paid | planned | late),
  net, vat, total, lines`. `PurchaseRead` adds `recovered` and `charge` and,
  per line, `fixed_asset_id` and `fixed_asset_number` when a fixed asset
  takes it over. Lines carry `id, description, unit_price, quantity,
  category_id, vat_scheme_id, net, vat` (and `recovered, charge` on purchase
  lines), ordered by `sort_key`.
- Create body: `kind`, `document_date`, `payment_method_id`, `payment_date`,
  optional `third_party_id`, `description`, `booking_date`, `paid`. The
  piece is numbered next in the fiscal year that contains its booking date
  (422 on `document_date` / `booking_date`, "Aucun exercice ne couvre cette
  date", when none does). Numbering takes a transaction-scoped advisory lock
  per fiscal year, as opening a fiscal year does.
- PATCH accepts any subset; a booking date moved into another fiscal year
  renumbers the piece there; a booking date equal to the document date is
  stored as NULL. Every read returns the whole piece, so one field's autosave
  refreshes the totals.
- A sale cannot use a card payment method (422 on `payment_method_id`).
- Lines: `POST /api/sales/{id}/lines` (appended with `next_sort_key`),
  `PATCH / DELETE /api/sale-lines/{id}`; same for `purchase-lines`. Every
  line route answers the whole parent piece.
- A purchase line a fixed asset takes over cannot be deleted, nor can its
  purchase (409 `in_use`, "Reprise par l'immobilisation I-004"); its
  purchase cannot become a credit note (422 on `kind`).
- `GET /api/purchase-lines/available?q=` → the invoice lines no fixed asset
  takes over, newest first: `id, purchase_id, purchase_number, fiscal_year,
  third_party_name, description, net, charge, booking_date`.

### Fixed assets

- `GET /api/fiscal-years/{fy}/fixed-assets` → the register for that year:
  `id, number, description, purchase_line_id, purchase_id, purchase_number,
  depreciation_model_id, value, acquired_on, depreciated_before (Σ schedule
  before the year), depreciation (the year's row, 0 if none), remaining
  (value − depreciated_before − depreciation), status (in_service |
  depreciated), schedule_balanced (Σ schedule == value)`.
- `POST /api/fixed-assets` `{purchase_line_id, description,
  depreciation_model_id}` → 201 `FixedAssetRead` (with its `schedule`).
  `GET / PATCH / DELETE /api/fixed-assets/{id}`; PATCH changes
  `description` and `depreciation_model_id`.
- `value` = the line's `charge`; `acquired_on` = the purchase's booking date.
- The schedule is stored when the asset is created, and the rows not
  `edited` are recomputed when the model changes or the line's amount, VAT
  scheme or the purchase's booking date changes.
  `PUT /api/fixed-assets/{id}/depreciations/{year}` `{amount}` types a year
  (`edited = true`); `POST /api/fixed-assets/{id}/recompute` recomputes every
  row and clears `edited`.
- Schedule algorithm: the frontend's `schedule()` of slice A, ported, with
  periods being fiscal years: the first period runs from the acquisition
  date to the end of its fiscal year (prorata over 365 days when the model
  says so, capped at a full year), later periods are whole fiscal years
  (computed from the company's start month, so years not opened yet are
  covered), the last row takes the remainder; declining switches to linear
  as in slice A.

### Computed reads

- `GET /api/fiscal-years/{fy}/journals` → one entry per financial account
  that has movements or a payment method: `account {id, code, name, kind},
  opening (0), receipts, payments, closing, movements[]`. A movement is
  `date, kind (sale | purchase | card_statement), piece_id, reference
  (S-0001, A-0001, "Décompte Visa · mars"), label (tiers, else description),
  amount (signed: in > 0), balance (running), planned`. Movements are the
  pieces whose payment date falls in the fiscal year, on their payment
  method's financial account, at their TVAC (sign: sale invoice in, purchase
  invoice out, reversed for credit notes); `planned` = not paid. Card
  statements: for each card method, the purchases paid by card are grouped
  by statement (closing day rule of slice A's `nextStatements`, now ported
  to Python); each statement with purchases is a movement out of the
  settlement account and into the card's account on the statement's
  payment date; it is planned while that date is after today. Sorted by
  date, then reference.
- `GET /api/fiscal-years/{fy}/vat-periods` → the periods of the year
  (quarters, or months when the company's regime is monthly; an empty list
  with `regime` for franchise / none): `id, start, end, due (the 20th of the
  month after the end), filed_on, status (current | to_file | filed),
  sales_net, sales_vat, purchases_net, purchases_vat_recovered, balance
  (sales_vat − recovered: > 0 to pay, < 0 to recover), pieces[]` (number,
  date, tiers, net, vat, recovered). Pieces belong to a period by booking
  date. A period's `vat_returns` row is created on first read;
  `PATCH /api/vat-periods/{id}` `{filed_on}`. Status: `filed` when
  `filed_on` is set, `current` while the period has not ended, `to_file`
  after.
- `GET /api/fiscal-years/{fy}/result` → `revenue {total, by_category[]},
  charges {total, by_category[]}, depreciation {total, by_asset[]}, result
  (revenue − charges − depreciation)`. Each group lists its pieces
  (reference, date, tiers, amount). Revenue = Σ signed sale-line net;
  charges = Σ signed charge of purchase lines no fixed asset takes over;
  depreciation = each asset's schedule row for the year. Pieces count by
  booking date.

### Computation modules

Pure functions, no database, in `backend/src/fisac/books/`:
`amounts.py` (line and piece amounts, sign), `depreciation.py` (schedule),
`card_statements.py` (statement periods), `journals.py`, `vat.py`,
`result.py`. Routers load rows, build plain inputs and call them.

## Frontend

The slice-A patterns apply: one folder per screen (`XScreen`, `XTable`,
`XCards`, `XForm`), the `src/lists/` kit, the edit session and autosave, the
desktop `EditDialog` and mobile `FullScreenForm`, money and dates through
`format.ts`, French copy, `@qvanderlinden/ui` first. The sidebar enables
ventes, achats, immobilisations, journaux, tva and résultat; divers,
rémunération, isoc, inventaire and inventaire d'ouverture stay "bientôt".
The canvas artboards (`Ventes`, `Achats`, `Immobilisations`, `Main` for the
journal, `Tva`, `Resultat` and their mobile versions) are the reference,
changed only where this spec says.

- **Ventes / Achats**: list (number, date, tiers, description, HTVA, TVA,
  TVAC, status badge; filters tiers, status, VAT period, and invoice / credit
  note; totals of the shown rows; row menu dupliquer, marquer payée, créer la
  note de crédit, supprimer); form (kind, tiers, description, document date,
  booking date hidden while equal with "Rétablir", payment method — no card
  for sales —, payment date, payée; a line editor: description, unit price,
  quantity, category of the right direction, VAT scheme, line total, add and
  remove; on a purchase line taken over, "au registre · I-004" linking to
  the asset; the three effect cards "Dans le résultat", "Dans le journal
  financier", "Dans la déclaration TVA"). "Nouvelle vente" / "Nouvel achat"
  creates the piece at once (today, the first allowed payment method,
  payment date = today) so its number shows; a piece closed with no line and
  no tiers is deleted.
- **Immobilisations**: list (number, description, acquisition value,
  depreciated at the start of the year, depreciation of the year, remaining,
  status; totals); "Nouvelle immobilisation" opens with a searchable select
  of available purchase lines (search on piece, tiers, description, amount),
  then shows the value and date read only next to the linked piece, the
  description (prefilled from the line) and the depreciation model; the
  schedule table, one row per fiscal year, amount editable with a "modifié"
  badge, "Recalculer", and the "Le tableau ne tombe pas juste" warning.
- **Journaux**: one tab per financial account, four tiles (solde au début,
  recettes, dépenses, solde à la fin), the movements table (date, pièce,
  libellé, recette, dépense, solde, "prévu" badge), a réalisés / prévus
  filter; a movement opens its piece, a card statement lists its purchases.
- **TVA**: one tab per period with its status; the summary (sales bases and
  VAT, purchase bases and VAT recovered, balance to pay or recover, due
  date); the filing date typed in place; the period's pieces, each opening
  its form. A company under franchise or without VAT sees a short notice.
- **Résultat**: tiles, then revenue by category, charges by category,
  depreciation by asset and the result; each row opens the list of its
  pieces. The canvas's ISOC, pay and inventory-check cards are not built.
- **Catégories** (slice A): tabs ventes / achats replace the kind tabs; the
  default-scheme fields, the system rows and their notes go.

## Testing

- Unit tests for every `books/` module (amounts with recoverable shares and
  credit notes, the schedule including the slice-A cases, card statements,
  journals, VAT periods, result).
- API tests: numbering and renumbering, status, card refused on sales, line
  direction, the lock on a line taken over, fixed asset creation, schedule
  edit and recompute, and one fiscal year end to end (two sales, a purchase
  with a line in the register, a restaurant purchase, a card purchase)
  checking journals, VAT and result together.
- Frontend: vitest on the pure helpers; `npm run test`, `npm run build`,
  `npm run check:design` pass.
- The smoke creates a sale and a purchase, registers a purchase line, and
  checks the journal, VAT and result screens, with screenshots at 1440 and
  390 px.

## Delivery

One commit per plan task, pushed to the working branch. At the end,
`CLAUDE.md` and the README say slice B is done and list the new routes.
