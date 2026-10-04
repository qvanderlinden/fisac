// Belgian PCMN classes. Only 6 and 7 matter for flow lines, but the whole
// chart is definable. Lowercase: they show as tags.
export const CLASS_LABELS: Record<number, string> = {
  1: 'capitaux propres',
  2: 'immobilisés',
  3: 'stocks',
  4: 'créances et dettes',
  5: 'trésorerie',
  6: 'charges',
  7: 'produits',
}

// Mirrors the backend's _LEDGER_CODE and the database's two check
// constraints, so a bad code is caught before a round trip.
const CODE_PATTERN = /^[1-7][0-9]*$/
// The column is String(20) and the request schema caps the code the same way.
const MAX_CODE_LENGTH = 20

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code) && code.length <= MAX_CODE_LENGTH
}

/** "6 charges": the class a valid code falls in, or null for anything else. */
export function classTag(code: string): string | null {
  if (!isValidCode(code)) return null
  const pcmnClass = Number(code[0])
  return `${pcmnClass} ${CLASS_LABELS[pcmnClass]}`
}

/** What is wrong with a code being typed; null when empty or fine. */
export function codeHint(code: string): string | null {
  if (code === '' || isValidCode(code)) return null
  if (CODE_PATTERN.test(code)) return `Un code ne dépasse pas ${MAX_CODE_LENGTH} chiffres.`
  return 'Un code ne contient que des chiffres et commence par une classe, de 1 à 7.'
}
