#!/usr/bin/env node
// Design-system compliance guard (Ledger redesign spec, "Verification").
// Scans every .ts/.tsx/.css file in frontend/src and fails on what
// @qvanderlinden/ui's rules forbid: emoji (flags included) and glyph icons,
// raw hex colours, hand-rolled number formatting, imports of the removed
// vendored primitives, the system's English-only formatDate (imported or
// re-exported), window.confirm, and Tailwind default-palette classes (which
// the design system removes, so they silently render nothing).
//
// Every match on a line is reported, not only the first.
// Run with `npm run check:design`. Exits 1 on any violation.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const srcDir = join(root, 'src')

const PALETTE =
  'gray|zinc|neutral|stone|red|orange|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

// Utilities that take a colour, including the per-side border and ring-offset
// forms (border-t-red-500, ring-offset-blue-300).
const COLOUR_PREFIX =
  'bg|text|border(?:-[xystebrl])?|fill|stroke|ring(?:-offset)?|inset-ring|outline|divide|decoration|shadow|inset-shadow|drop-shadow|accent|caret|placeholder|from|via|to'

// A hex colour is only a colour where one is expected, so "#123" in an issue
// reference or an SVG `url(#id)` is not flagged. 3-4 digit forms need a
// colour-like context (a quote, bracket, colon, comma or opening parenthesis
// right before it); 6 and 8 digit forms are flagged anywhere outside a word.
const HEX_RULE = new RegExp(
  '(?:(?<=[\'"`\\[(:,]\\s*)(?<!url\\(\\s*)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\\b' +
    '|(?<![\\w&/#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\\b)',
  'g',
)

// Checked line by line; every match on the line is reported.
const LINE_RULES = [
  { name: 'emoji', test: /\p{Extended_Pictographic}/gu },
  { name: 'flag emoji', test: /\p{Regional_Indicator}+/gu },
  { name: 'glyph used as an icon (use a Lucide icon)', test: /[▾▸▲▼↕✓✕✎×⚙⚠]/gu },
  { name: 'raw hex colour (use a brand utility or token)', test: HEX_RULE, code: true },
  { name: 'toFixed( (format through src/format.ts)', test: /\.toFixed\(/g },
  { name: 'toLocaleString( (format through src/format.ts)', test: /\.toLocale(?:Date|Time)?String\(/g },
  {
    name: 'import from the removed components/ui primitives',
    test: /from\s+['"][^'"]*components\/ui(?:\/[^'"]*)?['"]/g,
  },
  { name: 'import through the "@/" alias (removed)', test: /from\s+['"]@\//g },
  { name: 'window.confirm (use a confirmation Dialog)', test: /\b(?:window\.)?confirm\(/g },
  {
    name: 'Tailwind default palette class (removed by the design system)',
    test: new RegExp(`\\b(?:${COLOUR_PREFIX})-(?:${PALETTE})-\\d{2,3}\\b`, 'g'),
  },
]

const DS = String.raw`['"]@qvanderlinden\/ui(?:\/[\w-]+)*['"]`
// Checked on the whole file: import and export lists span several lines.
const DS_NAMED = new RegExp(String.raw`\b(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*from\s*${DS}`, 'g')
const DS_NAMESPACE = new RegExp(String.raw`import\s*\*\s*as\s+(\w+)\s+from\s*${DS}`, 'g')

const FORMAT_DATE_MESSAGE = 'formatDate from @qvanderlinden/ui is English-only; use formatDate from src/format.ts'

function toPosix(path) {
  return path.split(sep).join('/')
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(tsx?|css)$/.test(entry.name) ? [full] : []
  })
}

// The source with comments blanked out (line structure and string literals
// kept), so a comment mentioning "#123" cannot trip the hex rule.
function stripComments(text) {
  let out = ''
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    const next = text[i + 1]
    if (quote) {
      out += c
      if (c === '\\') {
        out += next ?? ''
        i += 1
      } else if (c === quote) quote = null
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c
      out += c
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      out += text.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop - 1
    } else if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i)
      const stop = end === -1 ? text.length : end
      out += ' '.repeat(stop - i)
      i = stop - 1
    } else out += c
    // A quote opened on one line never survives past it, except template
    // literals; this keeps a stray apostrophe in a comment-free line harmless.
    if (c === '\n' && (quote === '"' || quote === "'")) quote = null
  }
  return out
}

const violations = []
let checked = 0

for (const file of walk(srcDir)) {
  const rel = toPosix(relative(root, file))
  checked += 1
  const text = readFileSync(file, 'utf8')
  const code = stripComments(text).split('\n')
  text.split('\n').forEach((line, i) => {
    for (const rule of LINE_RULES) {
      const subject = rule.code ? code[i] : line
      for (const match of subject.matchAll(rule.test)) {
        violations.push(`${rel}:${i + 1}: ${rule.name}: ${match[0].trim()}`)
      }
    }
  })
  const lineOf = (index) => text.slice(0, index).split('\n').length
  for (const match of text.matchAll(DS_NAMED)) {
    if (/\bformatDate\b/.test(match[1])) {
      const verb = match[0].startsWith('export') ? 'exported' : 'imported'
      violations.push(`${rel}:${lineOf(match.index)}: formatDate ${verb} via @qvanderlinden/ui: ${FORMAT_DATE_MESSAGE}`)
    }
  }
  for (const match of text.matchAll(DS_NAMESPACE)) {
    const use = new RegExp(`\\b${match[1]}\\.formatDate\\b`).exec(text)
    if (use) violations.push(`${rel}:${lineOf(use.index)}: ${match[1]}.formatDate: ${FORMAT_DATE_MESSAGE}`)
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'))
  console.error(`\ncheck:design failed: ${violations.length} violation(s).`)
  process.exit(1)
}
console.log(`check:design passed: ${checked} file(s) checked.`)
