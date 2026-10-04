import { describe, expect, it } from 'vitest'
import {
  amountInput,
  countLabel,
  eur,
  formatDate,
  formatRate,
  isBadAmount,
  MAX_AMOUNT,
  parseDecimal,
  parseRate,
  parseVatRate,
  pluralNoun,
  rateInput,
  signedEur,
  signedFlowAmount,
  toApiDecimal,
} from './format'

// U+202F narrow no-break space (digit groups) and U+2212 true minus, as the
// design system's formatters emit them.
const NNBSP = ' '
const MINUS = '−'

describe('formatDate', () => {
  it('formats table dates as a two-digit day and an abbreviated French month', () => {
    expect(formatDate('2026-10-04')).toBe('04 oct.')
    expect(formatDate('2026-05-12', 'table')).toBe('12 mai')
    expect(formatDate('2026-08-03', 'table')).toBe('03 août')
    expect(formatDate('2026-02-28', 'table')).toBe('28 févr.')
  })

  it('formats list dates as a lowercase abbreviated month and the year', () => {
    expect(formatDate('2026-08-15', 'month')).toBe('août 2026')
    expect(formatDate('2026-09-01', 'month')).toBe('sept. 2026')
  })

  it('formats prose dates with the full month name', () => {
    expect(formatDate('2026-11-30', 'long')).toBe('novembre 2026')
  })

  it('formats full dates with day, abbreviated month and year', () => {
    expect(formatDate('2027-01-05', 'full')).toBe('05 janv. 2027')
  })

  it('reads ISO date-only strings as local calendar dates, not UTC midnight', () => {
    // new Date('2026-01-01') is UTC midnight, i.e. 31 Dec in timezones behind UTC.
    expect(formatDate('2026-01-01')).toBe('01 janv.')
  })

  it('accepts Date objects', () => {
    expect(formatDate(new Date(2026, 6, 14), 'full')).toBe('14 juil. 2026')
  })
})

describe('eur', () => {
  it('formats API decimal strings with the brand euro format', () => {
    expect(eur('84210')).toBe(`€84${NNBSP}210,00`)
    expect(eur('-42.5')).toBe(`${MINUS}€42,50`)
  })

  it('accepts numbers', () => {
    expect(eur(1234.5)).toBe(`€1${NNBSP}234,50`)
  })
})

describe('signedEur', () => {
  it('signs a change either way, and leaves zero unsigned', () => {
    expect(signedEur('1234')).toBe(`+€1${NNBSP}234,00`)
    expect(signedEur(-42.5)).toBe(`${MINUS}€42,50`)
    expect(signedEur('0')).toBe('€0,00')
    expect(signedEur(0.001)).toBe('€0,00')
  })
})

describe('signedFlowAmount', () => {
  it('keeps revenues positive and turns expenses negative', () => {
    expect(signedFlowAmount('revenue', '120.00')).toBe(120)
    expect(signedFlowAmount('expense', '120.00')).toBe(-120)
  })
})

describe('formatRate and rateInput', () => {
  it('drops trailing zero decimals', () => {
    expect(rateInput('21.00')).toBe('21')
    expect(rateInput('5.50')).toBe('5,5')
    expect(rateInput('0')).toBe('0')
    expect(formatRate('100.00')).toBe('100%')
    expect(formatRate('12.25')).toBe('12,25%')
  })
})

describe('amountInput', () => {
  it('shows an amount the way it is typed back: decimal comma, two decimals', () => {
    expect(amountInput('1234.5')).toBe(`1${NNBSP}234,50`)
    expect(amountInput(0)).toBe('0,00')
  })
})

describe('toApiDecimal', () => {
  it('writes a dot decimal rounded to cents, without grouping', () => {
    expect(toApiDecimal(1234.5)).toBe('1234.5')
    expect(toApiDecimal(-42.506)).toBe('-42.51')
    expect(toApiDecimal(0.1 + 0.2)).toBe('0.3')
    expect(toApiDecimal(-0.001)).toBe('0')
  })
})

describe('parseDecimal', () => {
  it('turns French input into an API decimal string', () => {
    expect(parseDecimal('12,50')).toBe('12.5')
    expect(parseDecimal(`1${NNBSP}234,50`)).toBe('1234.5')
    expect(parseDecimal('1 234,5')).toBe('1234.5')
    expect(parseDecimal('-42,5')).toBe('-42.5')
    expect(parseDecimal(`${MINUS}42,5`)).toBe('-42.5')
  })

  it('still accepts dot decimals', () => {
    expect(parseDecimal('12.5')).toBe('12.5')
    expect(parseDecimal('1,234.50')).toBe('1234.5')
  })

  it('returns null for empty or unreadable input', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('   ')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal('-')).toBeNull()
  })

  it('rejects more than two decimals instead of silently rounding them away', () => {
    // "1,234" reads as 1.234 (decimal comma); storing 1.23 would lose data, and
    // someone typing a thousands separator by habit would get 1,23 instead of 1234.
    expect(parseDecimal('1.234')).toBeNull()
    expect(parseDecimal('1,234')).toBeNull()
    expect(parseDecimal('1,230')).toBeNull()
    expect(parseDecimal('12,505')).toBeNull()
    expect(parseDecimal(`1${NNBSP}234,567`)).toBeNull()
    expect(parseDecimal('-0,001')).toBeNull()
    expect(parseDecimal('1,234.567')).toBeNull()
  })

  it('accepts at most two decimals, grouped or not, with a unit', () => {
    expect(parseDecimal('1,2')).toBe('1.2')
    expect(parseDecimal('1,23')).toBe('1.23')
    expect(parseDecimal('1 234')).toBe('1234')
    expect(parseDecimal('12,50 €')).toBe('12.5')
    expect(parseDecimal('1.234,56')).toBe('1234.56')
  })
})

describe('countLabel', () => {
  it('uses the singular for 0 and 1 and the plural from 2, as French does', () => {
    expect(countLabel(0, 'ligne', 'lignes')).toBe('0 ligne')
    expect(countLabel(1, 'ligne', 'lignes')).toBe('1 ligne')
    expect(countLabel(2, 'flux modifié', 'flux modifiés')).toBe('2 flux modifiés')
  })

  it('groups large counts like every other figure', () => {
    expect(countLabel(1200, 'flux', 'flux')).toBe(`1${NNBSP}200 flux`)
  })
})

describe('pluralNoun', () => {
  it('is the rule countLabel uses: singular for 0 and 1, plural from 2', () => {
    expect(pluralNoun(0, 'flux', 'flux modifiés')).toBe('flux')
    expect(pluralNoun(1, 'flux inséré', 'flux insérés')).toBe('flux inséré')
    expect(pluralNoun(2, 'flux inséré', 'flux insérés')).toBe('flux insérés')
  })
})

describe('parseVatRate', () => {
  it('reads a rate through parseDecimal, French comma included', () => {
    expect(parseVatRate('21')).toBe('21')
    expect(parseVatRate('5,5')).toBe('5.5')
    expect(parseVatRate('0')).toBe('0')
    expect(parseVatRate('100')).toBe('100')
  })

  it('reads a blank rate as 0', () => {
    expect(parseVatRate('')).toBe('0')
    expect(parseVatRate('  ')).toBe('0')
  })

  it('rejects what would be sent as something else: a third decimal, text, negatives, above 100', () => {
    expect(parseVatRate('5,125')).toBeNull()
    expect(parseVatRate('21x')).toBeNull()
    expect(parseVatRate('-1')).toBeNull()
    expect(parseVatRate('101')).toBeNull()
  })
})

describe('parseRate', () => {
  it('reads a rate through parseDecimal, French comma included', () => {
    expect(parseRate('12,5', '100')).toBe('12.5')
    expect(parseRate('50', '100')).toBe('50')
    expect(parseRate('0', '100')).toBe('0')
    expect(parseRate('100', '0')).toBe('100')
  })

  it('reads a blank rate as the given default', () => {
    expect(parseRate('', '100')).toBe('100')
    expect(parseRate('  ', '100')).toBe('100')
    expect(parseRate('', '0')).toBe('0')
  })

  it('rejects text, a third decimal, negatives and above 100', () => {
    expect(parseRate('abc', '100')).toBeNull()
    expect(parseRate('12,125', '100')).toBeNull()
    expect(parseRate('150', '100')).toBeNull()
    expect(parseRate('-1', '100')).toBeNull()
  })
})

describe('isBadAmount', () => {
  it('accepts readable, non-negative amounts', () => {
    expect(isBadAmount('12,50')).toBe(false)
    expect(isBadAmount('1 234,56')).toBe(false)
    expect(isBadAmount('0')).toBe(false)
  })

  it('rejects unreadable text, a third decimal and a blank field', () => {
    expect(isBadAmount('12,5x')).toBe(true)
    expect(isBadAmount('1,234')).toBe(true)
    expect(isBadAmount('')).toBe(true)
  })

  it('rejects a negative amount unless the field is signed', () => {
    expect(isBadAmount('-42,5')).toBe(true)
    expect(isBadAmount('-42,5', { signed: true })).toBe(false)
  })

  it('rejects an amount at or above the cap, whichever the sign', () => {
    expect(MAX_AMOUNT).toBe(10_000_000_000)
    expect(isBadAmount('9 999 999 999,99', { max: MAX_AMOUNT })).toBe(false)
    expect(isBadAmount('10 000 000 000', { max: MAX_AMOUNT })).toBe(true)
    expect(isBadAmount('-10 000 000 000', { signed: true, max: MAX_AMOUNT })).toBe(true)
    expect(isBadAmount('-9 999 999 999,99', { signed: true, max: MAX_AMOUNT })).toBe(false)
    expect(isBadAmount('10 000 000 000')).toBe(false)
  })
})
