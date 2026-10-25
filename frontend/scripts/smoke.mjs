// End-to-end smoke of slices A and B and the user administration. Needs the stack running: uvicorn on :8000 and
// `npm run dev` on :5173, against a fresh database. Saves screenshots under
// smoke/ and exits non-zero on a failed check or a console error.
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173'
const OUT = fileURLToPath(new URL('../smoke/', import.meta.url))
const SCREENS = [
  ['societe', '/societe'],
  ['tiers', '/tiers'],
  ['categories', '/categories'],
  ['regimes-tva', '/regimes-tva'],
  ['regimes-isoc', '/regimes-isoc'],
  ['modeles-amortissement', '/modeles-amortissement'],
  ['moyens-paiement', '/moyens-paiement'],
]
const SCREENS_B = [
  ['ventes', '/ventes'],
  ['achats', '/achats'],
  ['immobilisations', '/immobilisations'],
  ['journaux', '/journaux'],
  ['tva', '/tva'],
  ['resultat', '/resultat'],
]
const WIDTHS = [
  [1440, 1000],
  [390, 844],
]

mkdirSync(OUT, { recursive: true })
// Amounts render with narrow or non-breaking spaces: compare on a plain-space text.
// The pieces are dated today, so the year and the VAT quarter come from today (quarterly company, January start).
const NOW = new Date()
const YEAR = NOW.getFullYear()
const QUARTER = new RegExp(`^T${Math.floor(NOW.getMonth() / 3) + 1}`)
const plain = (t) => t.replace(/[\u00a0\u202f]/g, ' ')
const failures = []
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures.push(what)
}

/** Fills the open piece's first line: description, category, VAT scheme, unit price. */
async function fillLine(page, category, scheme, price, description = '') {
  const choose = async (name, option) => {
    await page.getByRole('combobox', { name }).first().click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
  if (description) await page.locator('tbody tr').getByLabel('Description').first().fill(description)
  await choose('Catégorie', category)
  await choose('Régime de TVA', scheme)
  const unit = page.getByLabel('Prix unitaire').first()
  await unit.fill(price)
  await unit.blur()
}

async function checkOverflow(page, name) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(wide <= 1, `${name}: no horizontal overflow at 390 (${wide}px over)`)
}

async function closeDialog(page) {
  await page.getByRole('button', { name: 'Fermer' }).first().click()
  await page.waitForLoadState('networkidle')
}

let browser
try {
  browser = await chromium.launch()
} catch (e) {
  console.warn(`default Chromium launch failed (${e.message.split('\n')[0]}); using /opt/pw-browsers/chromium`)
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
}

// Both empty states first: opening the year (below, at the first width) makes "/" redirect.
for (const [width, height] of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height } })
  page.on('console', (m) => m.type() === 'error' && check(false, `console error (${width}): ${m.text()}`))
  await page.goto(`${BASE}/`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: `Ouvrir l’exercice ${YEAR}` }).waitFor()
  await page.screenshot({ path: `${OUT}empty-${width}.png`, fullPage: true })
  await page.close()
}

for (const [i, [width, height]] of WIDTHS.entries()) {
  const page = await browser.newPage({ viewport: { width, height } })
  page.on('console', (m) => m.type() === 'error' && check(false, `console error (${width}): ${m.text()}`))
  page.on('pageerror', (e) => check(false, `page error (${width}): ${e.message}`))
  const shot = (name) => page.screenshot({ path: `${OUT}${name}-${width}.png`, fullPage: true })
  const settle = () => page.waitForLoadState('networkidle')

  await page.goto(`${BASE}/`)
  await settle()
  if (i === 0) {
    await page.getByRole('button', { name: `Ouvrir l’exercice ${YEAR}` }).click()
  }
  await page.waitForURL('**/societe')
  if (i === 0) check(true, 'first fiscal year opened, "/" lands on /societe')

  for (const [name, path] of SCREENS) {
    await page.goto(`${BASE}${path}`)
    await settle()
    await page.waitForTimeout(300)
    if (i === 1) {
      await checkOverflow(page, name)
    }
    await shot(name)
  }

  if (i === 0) {
    // Tiers: a new tiers is created on its first name; the IBAN is checked live.
    await page.goto(`${BASE}/tiers`)
    await settle()
    await page.getByRole('button', { name: 'Nouveau tiers' }).click()
    await page.getByPlaceholder('Société ou personne').fill('Langerman')
    const ibanInput = page.getByPlaceholder('BE00 0000 0000 0000')
    await ibanInput.fill('NL91 ABNA 0417 1643 00')
    check((await page.getByLabel('IBAN valide · Pays-Bas').count()) > 0, 'tiers: "IBAN valide · Pays-Bas"')
    await ibanInput.fill('BE68539007547035')
    check(
      (await page.getByText('IBAN invalide : vérifiez les chiffres').count()) > 0,
      'tiers: "IBAN invalide : vérifiez les chiffres"',
    )
    await ibanInput.fill('NL91 ABNA 0417 1643 00')
    await ibanInput.blur()
    await settle()
    await page.getByRole('button', { name: 'Fermer' }).first().click()
    await settle()
    check((await page.getByText('Langerman').count()) > 0, 'tiers: Langerman is in the list')

    // Categories: archiving leaves the default list.
    await page.goto(`${BASE}/categories`)
    await settle()
    // "Frais bancaires" is a purchases category: the screen opens on ventes.
    await page.getByRole('tab', { name: /^achats/ }).click()
    const pick = page.getByRole('checkbox', { name: 'Sélectionner Frais bancaires' })
    check((await pick.count()) === 1, 'categories: "Frais bancaires" listed by default')
    await pick.check()
    await page.getByRole('button', { name: 'Archiver', exact: true }).click()
    await settle()
    await page.waitForTimeout(300)
    check((await pick.count()) === 0, 'categories: archived "Frais bancaires" left the default list')

    // A sale: one line of 1000 at Ventes 21 %.
    await page.goto(`${BASE}/ventes`)
    await settle()
    await page.getByRole('button', { name: 'Nouvelle vente' }).click()
    await page.getByRole('button', { name: 'Ajouter une ligne' }).click()
    await fillLine(page, 'Prestations de services', 'Ventes 21 %', '1000')
    await settle()
    const total = await page
      .waitForFunction(() => document.body.innerText.replace(/[\u00a0\u202f]/g, ' ').includes('1 210,00'), null, { timeout: 5000 })
      .then(() => true, () => false)
    check(total, 'sale: TVAC 1 210,00 (1 000,00 HTVA at 21 %)')
    await closeDialog(page)
    check((await page.getByText('S-0001').count()) > 0, 'sale: S-0001 is in the list')

    // A purchase: one line of 1500 at Achats 21 % · récupérable.
    await page.goto(`${BASE}/achats`)
    await settle()
    await page.getByRole('button', { name: 'Nouvel achat' }).click()
    await page.getByRole('button', { name: 'Ajouter une ligne' }).click()
    await fillLine(page, 'Petit matériel', 'Achats 21 % · récupérable', '1500', 'Portable de travail')
    await settle()
    const shown = await page
      .waitForFunction(() => document.body.innerText.replace(/[\u00a0\u202f]/g, ' ').includes('1 815,00'), null, { timeout: 5000 })
      .then(() => true, () => false)
    check(shown, 'purchase: TVAC 1 815,00')
    await closeDialog(page)
    check((await page.getByText('A-0001').count()) > 0, 'purchase: A-0001 is in the list')

    // A fixed asset taking that purchase line over.
    await page.goto(`${BASE}/immobilisations`)
    await settle()
    await page.getByRole('button', { name: 'Nouvelle immobilisation' }).click()
    await page.getByRole('list', { name: 'Lignes d’achat disponibles' }).getByRole('button').first().click()
    const model = page.getByRole('combobox', { name: 'Modèle d’amortissement' })
    await model.click()
    await page.getByRole('option', { name: 'Informatique · 3 ans' }).click()
    await page.getByRole('button', { name: 'Ajouter au registre' }).click()
    await page.getByText('I-001').first().waitFor()
    check(true, 'fixed asset: I-001 registered with "Informatique · 3 ans"')
    await closeDialog(page)
    await settle()
    check((await page.getByText('I-001').count()) > 0, 'fixed asset: I-001 is in the register')

    // The journal shows the two movements.
    await page.goto(`${BASE}/journaux`)
    await settle()
    const journal = plain(await page.locator('body').innerText())
    check(journal.includes('S-0001') && journal.includes('A-0001') && journal.includes('1 210,00') && journal.includes('1 815,00'), 'journal: the sale (1 210,00) and the purchase (1 815,00) movements')
  }

  // The new screens, at both widths.
  for (const [name, path] of SCREENS_B) {
    await page.goto(`${BASE}${path}`)
    await settle()
    await page.waitForTimeout(300)
    if (name === 'tva') {
      // The screen opens on the first period to file; today's pieces sit in the running quarter.
      const tab = page.getByRole('tab', { name: QUARTER })
      if (await tab.count()) await tab.click()
      else await page.getByRole('combobox', { name: 'Période' }).click().then(() => page.getByRole('option', { name: QUARTER }).click())
      await settle()
      // Let a closing select list fade out before the screenshot.
      await page.getByRole('listbox').waitFor({ state: 'detached' }).catch(() => {})
    }
    if (i === 1) {
      await checkOverflow(page, name)
    }
    if (i === 0) {
      const text = plain(await page.locator('body').innerText())
      if (name === 'tva') check(/(?<![\d,] ?)210,00/.test(text) && /(?<![\d,] ?)315,00/.test(text), 'tva: sales VAT 210,00 and recovered 315,00')
      if (name === 'resultat') check(text.includes('1 000,00'), 'resultat: revenue 1 000,00')
    }
    await shot(name)
  }

  // The user administration: the dev user (AUTH_DISABLED) is listed as an admin.
  await page.goto(`${BASE}/utilisateurs`)
  await settle()
  await page.waitForTimeout(300)
  // The screen opens on the pending requests; the dev user is approved.
  await page.getByRole('tab', { name: /^acceptés/ }).click()
  await page.getByText('dev@localhost').first().waitFor()
  const users = await page.locator('main').innerText()
  check(users.includes('dev@localhost') && /admin/.test(users), `utilisateurs: dev@localhost listed with the admin tag (${width})`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(overflow <= 1, `utilisateurs: no horizontal overflow at ${width} (${overflow}px over)`)
  await shot('utilisateurs')
  await page.close()
}

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} failed check(s)`)
  process.exit(1)
}
console.log('\nsmoke passed')
