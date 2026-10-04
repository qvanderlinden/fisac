import { describe, expect, it } from 'vitest'
import {
  emptyLine,
  grossToNet,
  linesToPayload,
  linesTotals,
  linesValid,
  netToGross,
  rebaseLinesForReverseCharge,
  type LineDraft,
} from './LinesEditor'

function line(patch: Partial<LineDraft>): LineDraft {
  return { ...emptyLine(), ...patch }
}

describe('linesValid', () => {
  it('accepts readable amounts and rates', () => {
    expect(linesValid([line({ amount_net: '12,50' })])).toBe(true)
    expect(linesValid([line({ amount_net: '1234' })])).toBe(true)
    expect(linesValid([line({ amount_net: '1 234,5', vat_rate: '21' })])).toBe(true)
    expect(linesValid([line({ amount_net: '100', amount_gross: '121,00', vat_rate: '21' })])).toBe(true)
    expect(linesValid([line({ vat_rate: '5,5' })])).toBe(true)
  })

  it('accepts blank fields (the line is dropped, or the rate is 0)', () => {
    expect(linesValid([line({})])).toBe(true)
    expect(linesValid([line({ amount_net: '10', vat_rate: '' })])).toBe(true)
  })

  it('rejects an amount with more than two decimals, which parseDecimal would drop', () => {
    expect(linesValid([line({ amount_net: '1,234' })])).toBe(false)
    expect(linesValid([line({ amount_net: '12,345' })])).toBe(false)
    expect(linesValid([line({ amount_gross: '1,234', basis: 'gross' })])).toBe(false)
  })

  it('rejects a rate with more than two decimals, which would save as 0 %', () => {
    expect(linesValid([line({ amount_net: '10', vat_rate: '7,555' })])).toBe(false)
  })

  it('rejects unreadable, negative and out-of-range values', () => {
    expect(linesValid([line({ amount_net: '12,5x' })])).toBe(false)
    expect(linesValid([line({ amount_net: '-1' })])).toBe(false)
    expect(linesValid([line({ vat_rate: '101' })])).toBe(false)
    expect(linesValid([line({ vat_rate: '-5' })])).toBe(false)
    expect(linesValid([line({ vat_rate: 'abc' })])).toBe(false)
  })

  it('rejects a net the backend column cannot hold (Numeric(12,2): below 10 000 000 000)', () => {
    expect(linesValid([line({ amount_net: '9 999 999 999,99' })])).toBe(true)
    expect(linesValid([line({ amount_net: '10 000 000 000' })])).toBe(false)
    expect(linesValid([line({ amount_net: '99999999999999999999' })])).toBe(false)
  })

  it('rejects the whole set when any line is bad', () => {
    expect(linesValid([line({ amount_net: '10' }), line({ amount_net: '1,234' })])).toBe(false)
  })
})

describe('linesToPayload', () => {
  it('turns typed text into API decimals and drops blank lines', () => {
    expect(
      linesToPayload([
        line({ description: ' abonnement ', amount_net: '1 234,5', vat_rate: '5,5', ledger_account_id: '7' }),
        line({}),
      ]),
    ).toEqual([{ description: 'abonnement', amount_net: '1234.5', vat_rate: '5.5', ledger_account_id: 7 }])
  })

  it('keeps every line that linesValid accepts', () => {
    const lines = [line({ amount_net: '12,50' }), line({ amount_net: '1234', vat_rate: '' })]
    expect(linesValid(lines)).toBe(true)
    expect(linesToPayload(lines)).toHaveLength(2)
  })
})

describe('VAT preview (half-up per line, like the backend)', () => {
  it('rounds a tie up: 21,50 at 21 % is 4,52 VAT and 26,02 gross', () => {
    expect(linesTotals([{ amount_net: '21,50', vat_rate: '21' }])).toEqual({ net: 21.5, vat: 4.52, gross: 26.02 })
    expect(netToGross('21,50', '21')).toBe('26,02')
  })

  it('rounds a tie up even when the float product lands just below it (4,10 at 15 %)', () => {
    expect(linesTotals([{ amount_net: '4,10', vat_rate: '15' }]).vat).toBe(0.62)
    expect(netToGross('4,10', '15')).toBe('4,72')
  })

  it('rounds each line, then sums', () => {
    expect(
      linesTotals([
        { amount_net: '0,05', vat_rate: '10' },
        { amount_net: '0,05', vat_rate: '10' },
      ]),
    ).toEqual({ net: 0.1, vat: 0.02, gross: 0.12 })
  })

  it('derives a net from a gross', () => {
    expect(grossToNet('121', '21')).toBe('100,00')
    expect(grossToNet('15,13', '21')).toBe('12,50')
  })

  it('previews gross equal to net on a reverse charge flow, keeping the notional VAT', () => {
    expect(linesTotals([{ amount_net: '100', vat_rate: '21' }], true)).toEqual({ net: 100, vat: 21, gross: 100 })
    expect(netToGross('100', '21', true)).toBe('100,00')
    expect(grossToNet('100', '21', true)).toBe('100,00')
  })
})

describe('rebaseLinesForReverseCharge', () => {
  it('re-derives the gross of a net-based line when reverse charge turns on, keeping what was typed', () => {
    const lines = [line({ description: 'En cours', amount_net: '100', amount_gross: '121,00', vat_rate: '21' })]
    const [rebased] = rebaseLinesForReverseCharge(lines, true)
    expect(rebased.amount_gross).toBe('100,00')
    expect(rebased.amount_net).toBe('100')
    expect(rebased.description).toBe('En cours')
  })

  it('goes back to a VAT-inclusive gross when reverse charge turns off', () => {
    const lines = [line({ amount_net: '100', amount_gross: '100,00', vat_rate: '21' })]
    expect(rebaseLinesForReverseCharge(lines, false)[0].amount_gross).toBe('121,00')
  })

  it('keeps a gross-based line fixed and re-derives its net', () => {
    const lines = [line({ amount_net: '100', amount_gross: '121', vat_rate: '21', basis: 'gross' })]
    const [rebased] = rebaseLinesForReverseCharge(lines, true)
    expect(rebased.amount_gross).toBe('121')
    expect(rebased.amount_net).toBe('121,00')
  })

  it('leaves blank lines and the array itself alone when nothing changes', () => {
    const lines = [line({})]
    expect(rebaseLinesForReverseCharge(lines, true)).toBe(lines)
  })
})
