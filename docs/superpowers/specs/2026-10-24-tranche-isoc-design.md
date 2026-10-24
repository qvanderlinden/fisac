# Tranche ISOC — corporate tax and the result after tax

Date: 2026-10-24
Status: design approved in conversation; spec awaiting review
Builds on: slice B (`2026-10-23-tranche-b-pieces-design.md`, merged) and the
card-purchase change (migration 0007)

## Intent

What matters most to the user: producing the income statement (compte de
résultat) including the Belgian corporate tax (ISOC). That needs sales,
purchases and depreciation to be fully reliable, then the tax computed from
them.

Decisions taken with the user:

- The deductible share of a purchase comes from an ISOC scheme on each
  purchase line (100 %, 69 % restaurant, 75 % voiture …), chosen in the line
  editor like the VAT scheme, default 100 %.
- Advance payments VA1–VA4 are typed, appear in the journals, and the
  increase for insufficient advance payments (majoration) is computed.
- The legal parameters (rates, bonifications, thresholds, due-date rule) live
  in one Python module keyed by assessment year; the screens label the tax an
  estimation; the user adjusts the module when their accountant or the SPF
  Finances gives other figures.
- Card purchases keep their slice-B change: no paid status, status from the
  date.

Success: on desktop and mobile, the Résultat screen shows the result before
tax, the estimated corporate tax and the result after tax; the ISOC screen
explains the computation (disallowed expenses by rubric, taxable base, rates,
majoration, advance payments, balance); every figure is reproducible by hand
and covered by tests.

## Scope

In: migration 0008; the pure modules `books/isoc.py` and `books/isoc_params.py`;
the ISOC read and advance-payment routes; ISOC schemes on purchase lines; the
company's incorporation date; the ISOC screen; the Résultat, Achats, Structure
société and Journaux changes below; three reliability fixes from the slice-B
reviews; tests and the extended smoke.

Out: the director's pay (the "rémunération suffisante" condition stays a
ticked box), divers, the opening and closing inventory, tax credits, the
minimum tax rules not listed here, filing the return.

## Data — migration 0008

- `purchase_lines.isoc_scheme_id` stays nullable; NULL is read as the "100 %"
  scheme. The line editor offers the ISOC schemes; a new line gets "100 %".
- `company.incorporated_on` (date, nullable) — typed on Structure société.
- `fiscal_years`: the three existing booleans keep their names and are read
  as "condition met" (all default true): `isoc_small_company` (petite
  société), `isoc_minimum_pay` (rémunération du dirigeant suffisante),
  `isoc_shares_owned` (pas détenue à 50 % ou plus par une autre société).
  The UI wording carries the meaning; the columns are not renamed.
- `isoc_prepayments` (existing): number 1–4, `due_date`, `amount` ≥ 0,
  `payment_method_id` (not a card), `paid`, `payment_date` (required when
  paid). Rows are created on first read with the due dates of the rule below,
  amount 0, the first bank transfer method, unpaid.

## Legal parameters — `books/isoc_params.py`

One frozen dataclass per assessment year (`exercice d'imposition` N covers
the fiscal years closed between 31 December N−1 and 30 December N: the
calendar year after the fiscal year's end when it closes on 31 December, the
year of its end otherwise — a year closing on 30 June 2026 is assessment year
2026), plus a lookup that falls back to
the latest known year and says so (`fallback: True`, shown on screen).

Assessment year 2027 (income 2026):

| parameter | value |
| --- | --- |
| reduced rate | 20 % on the first €100 000 of taxable base |
| normal rate | 25 % |
| majoration rate | 6.75 % of the tax |
| bonifications | VA1 9 %, VA2 7.5 %, VA3 6 %, VA4 4.5 % |
| majoration threshold | none due when below 0.5 % of the tax or €80 |
| exemption | a small company in its first three fiscal years |

Due dates: the 10th of the 4th, 7th and 10th month of the fiscal year and the
20th of its 12th month, moved to the next Monday when on a weekend (for 2026:
10 April, 10 July, 12 October, 21 December).

Sources consulted (they disagree on the base uplift and the threshold; the
module's comment lists them): Pyxis "VAI exercice d'imposition 2027",
Grant Thornton on the majoration, Argenta, StarterPass, myfid, and the SPF
circular on the 0.5 % / €80 threshold.

## Computation — `books/isoc.py`

Pure functions, amounts in cents, half-up, as in slice B.

1. `before_tax` = the slice-B result (revenue − charges − depreciation).
2. Disallowed, per rubric (restaurant, car, other):
   - a purchase line no fixed asset takes over: signed charge × (100 −
     deductible rate) / 100, rounded per line;
   - a purchase line a fixed asset takes over: that asset's depreciation of
     the year × (100 − the line's deductible rate) / 100.
3. `taxable_base` = max(0, before_tax + Σ disallowed).
4. `tax` = if the three conditions are met: 20 % × min(base, 100 000) + 25 %
   × max(0, base − 100 000); otherwise 25 % × base; rounded to the cent.
5. Advance payments count when paid; each is attributed to the first quarter
   whose due date is on or after its payment date (a payment after the fourth
   due date counts for none); `bonification` = Σ amount × the attributed
   quarter's rate.
6. `majoration` = 0 when exempt (small company within its first three fiscal
   years since `incorporated_on`; unknown date → not exempt); otherwise
   max(0, tax × 6.75 % − bonification), then 0 when below max(0.5 % × tax,
   €80).
7. `balance` = tax + majoration − Σ paid advance payments (negative: an
   excess, shown "Excédent de versements").
8. `estimated_tax` = tax + majoration; `after_tax` = before_tax −
   estimated_tax.

## API

- `GET /api/fiscal-years/{fy}/isoc` → `before_tax`, `disallowed` by rubric
  (total and the lines: piece reference, date, tiers, amount, rate, part
  disallowed; assets as `I-001`), `taxable_base`, conditions, `reduced`
  (bool), `tax_reduced`, `tax_normal`, `tax`, `majoration` detail (rate,
  gross, bonification per VA, threshold, exempt and why), `prepayments`,
  `paid_total`, `balance`, `estimated_tax`, `after_tax`, `assessment_year`,
  `parameters_fallback`.
- `GET /api/fiscal-years/{fy}/isoc-prepayments` (rows created on first read,
  race-safe with `ON CONFLICT DO NOTHING` as for VAT periods);
  `PATCH /api/isoc-prepayments/{id}` (`amount`, `payment_method_id`,
  `payment_date`, `paid`; a card method → 422; paid without a date → 422).
- `GET /api/fiscal-years/{fy}/result` adds `estimated_tax`, `majoration`,
  `after_tax` (same module as the ISOC read).
- Purchase lines accept and return `isoc_scheme_id` (NULL read as "100 %").
- Company accepts and returns `incorporated_on`.
- Journals: each advance payment with an amount > 0 is a movement out of its
  payment method's account on its payment date (or its due date while unpaid,
  then `planned`), reference `VA1 · ISOC`.

## Frontend

- **ISOC** (sidebar entry enabled): tiles (résultat avant impôt, base
  imposable, impôt estimé, solde); "Calcul de l'impôt" card, each disallowed
  rubric opening its pieces; "Taux réduit" card with the three conditions
  (PATCH the fiscal year); "Versements anticipés" table VA1–VA4 editable in
  place (échéance, bonification, montant, moyen, date, payé) with the
  majoration computation; an "estimation" badge, and a notice when the
  parameters fall back to another year; mobile layout as in the canvas
  (`Isoc`, `MobileIsoc` artboards).
- **Résultat**: after the result before tax, "Impôt des sociétés estimé"
  (opening the ISOC screen) and "Résultat de l'exercice" after tax; tiles
  updated.
- **Achats**: the line editor shows "Régime ISOC"; the "Dans le résultat"
  effect card shows the non-deductible part.
- **Structure société**: "Date de constitution".
- **Journaux**: VA movements; clicking one opens the ISOC screen.

## Reliability fixes carried in

- An invalid amount or quantity in a line is refused with a message instead
  of being dropped silently on blur.
- The schedule's fiscal-year edge cases are pinned by tests (partial first
  year with a start month other than January, leap year, acquisition on the
  last day).
- The purchase-line picker accepts a French amount ("1 500,00").

## Testing

- `books/isoc.py` unit tests with hand-computed figures: both rates and the
  €100 000 bracket, each rubric, a car taken over by an asset, the majoration
  without VA, with a late VA, below the threshold, exempt.
- `isoc_params` tests: due dates for 2026 (12 October, 21 December), the
  fallback year.
- API: prepayments CRUD and refusals; one fiscal year end to end (sales, a
  restaurant purchase, a car asset, two VAs) checking the ISOC read, the
  result after tax and the journal movements.
- Frontend: vitest on the pure helpers; `npm run test`, `npm run build`,
  `npm run check:design`.
- Smoke: adds a restaurant purchase and a VA, checks the ISOC and Résultat
  screens at 1440 and 390 px.

## Delivery

One commit per plan task on the working branch; `CLAUDE.md` and the README
updated at the end.
