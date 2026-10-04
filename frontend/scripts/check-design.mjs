#!/usr/bin/env node
// Design-system compliance guard (Ledger redesign spec, "Verification").
// Scans frontend/src and fails on what @qvanderlinden/ui's rules forbid:
// emoji and glyph icons, raw hex colours, hand-rolled number formatting,
// imports of the old vendored primitives, the system's English-only
// formatDate, window.confirm, and Tailwind default-palette classes (which
// the design system removes, so they silently render nothing).
//
// Run with `npm run check:design`. Exits 1 on any violation.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const srcDir = join(root, 'src')

// Paths (relative to frontend/) not migrated to the design system yet. Each
// migration task deletes its entries; the cleanup task deletes the list.
const LEGACY = [
  'src/accountingDisplay.ts',
  'src/components/AnnualAccountsView.tsx',
  'src/components/BalanceChart.tsx',
  'src/components/CategoriesView.tsx',
  'src/components/FlowBulkEditDialog.tsx',
  'src/components/FlowForm.tsx',
  'src/components/FlowGenerator.tsx',
  'src/components/FlowList.tsx',
  'src/components/FlowRow.tsx',
  'src/components/LedgerAccountsView.tsx',
  'src/components/LinesEditor.tsx',
  'src/components/NewFlowRow.tsx',
  'src/components/ProjectionView.tsx',
  'src/components/VatView.tsx',
  'src/components/ui',
  'src/lib/utils.ts',
  'src/styles.css',
]

const PALETTE =
  'gray|zinc|neutral|stone|red|orange|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

// Checked line by line.
const LINE_RULES = [
  { name: 'emoji', test: /\p{Extended_Pictographic}/u },
  { name: 'glyph used as an icon (use a Lucide icon)', test: /[▾▸▲▼↕✓✕✎×⚙⚠]/u },
  { name: 'raw hex colour (use a brand utility or token)', test: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/ },
  { name: 'toFixed( (format through src/format.ts)', test: /\.toFixed\(/ },
  { name: 'toLocaleString( (format through src/format.ts)', test: /\.toLocale(?:Date|Time)?String\(/ },
  { name: 'import from the removed components/ui primitives', test: /from\s+['"][^'"]*components\/ui\// },
  { name: 'window.confirm (use a confirmation Dialog)', test: /\b(?:window\.)?confirm\(/ },
  {
    name: 'Tailwind default palette class (removed by the design system)',
    test: new RegExp(`\\b(?:bg|text|border|fill|stroke|ring|outline|divide|decoration|shadow|accent|caret|placeholder|from|via|to)-(?:${PALETTE})-\\d{2,3}\\b`),
  },
]

// Checked on the whole file: import lists span several lines.
const DS_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]@qvanderlinden\/ui['"]/g

function toPosix(path) {
  return path.split(sep).join('/')
}

function isLegacy(rel) {
  return LEGACY.some((entry) => rel === entry || rel.startsWith(`${entry}/`))
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : []
  })
}

const violations = []
let checked = 0
let skipped = 0

for (const entry of LEGACY) {
  if (!existsSync(join(root, entry))) {
    violations.push(`${entry}: listed in LEGACY but no longer exists; remove the entry`)
  }
}

for (const file of walk(srcDir)) {
  const rel = toPosix(relative(root, file))
  if (isLegacy(rel)) {
    skipped += 1
    continue
  }
  checked += 1
  const text = readFileSync(file, 'utf8')
  text.split('\n').forEach((line, i) => {
    for (const rule of LINE_RULES) {
      const match = line.match(rule.test)
      if (match) violations.push(`${rel}:${i + 1}: ${rule.name}: ${match[0]}`)
    }
  })
  for (const match of text.matchAll(DS_IMPORT)) {
    if (/\bformatDate\b/.test(match[1])) {
      const line = text.slice(0, match.index).split('\n').length
      violations.push(
        `${rel}:${line}: formatDate imported from @qvanderlinden/ui is English-only; use formatDate from src/format.ts`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'))
  console.error(`\ncheck:design failed: ${violations.length} violation(s).`)
  process.exit(1)
}
console.log(`check:design passed: ${checked} file(s) checked, ${skipped} legacy file(s) skipped.`)
