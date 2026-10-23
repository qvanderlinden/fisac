// End-to-end smoke of slice A. Needs the stack running: uvicorn on :8000 and
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
const WIDTHS = [
  [1440, 1000],
  [390, 844],
]

mkdirSync(OUT, { recursive: true })
const failures = []
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures.push(what)
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
  await page.getByRole('button', { name: 'Ouvrir l’exercice 2026' }).waitFor()
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
    await page.getByRole('button', { name: 'Ouvrir l’exercice 2026' }).click()
  }
  await page.waitForURL('**/societe')
  if (i === 0) check(true, 'first fiscal year opened, "/" lands on /societe')

  for (const [name, path] of SCREENS) {
    await page.goto(`${BASE}${path}`)
    await settle()
    await page.waitForTimeout(300)
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
    const pick = page.getByRole('checkbox', { name: 'Sélectionner Frais bancaires' })
    check((await pick.count()) === 1, 'categories: "Frais bancaires" listed by default')
    await pick.check()
    await page.getByRole('button', { name: 'Archiver', exact: true }).click()
    await settle()
    await page.waitForTimeout(300)
    check((await pick.count()) === 0, 'categories: archived "Frais bancaires" left the default list')
  }
  await page.close()
}

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} failed check(s)`)
  process.exit(1)
}
console.log('\nsmoke passed')
