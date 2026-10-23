import { describe, expect, it } from 'vitest'
import type { JournalRead, MovementRead, PaymentMethodRead } from '../../api/types'
import { filterMovements, receiptOf, paymentOf, statementPurchases } from './journalsView'

const move = (over: Partial<MovementRead>): MovementRead => ({
  date: '2026-03-05',
  kind: 'sale',
  piece_id: 1,
  reference: 'S-0001',
  label: 'Client',
  amount: '100.00',
  balance: '100.00',
  planned: false,
  ...over,
})

const MOVES = [
  move({}),
  move({ date: '2026-04-01', kind: 'purchase', piece_id: 2, reference: 'A-0001', amount: '-40.00', balance: '60.00', planned: true }),
  move({ date: '2026-05-01', reference: 'S-0002', amount: '10.00', balance: '70.00', planned: true }),
]

describe('filterMovements', () => {
  it('keeps every movement for "all"', () => {
    expect(filterMovements(MOVES, 'all')).toEqual(MOVES)
  })

  it('keeps the server running balance on the movements it keeps', () => {
    expect(filterMovements(MOVES, 'planned').map((m) => m.balance)).toEqual(['60.00', '70.00'])
    expect(filterMovements(MOVES, 'done').map((m) => m.balance)).toEqual(['100.00'])
  })
})

describe('receiptOf / paymentOf', () => {
  it('splits a signed amount into the two columns', () => {
    expect(receiptOf(MOVES[0])).toBe('100.00')
    expect(paymentOf(MOVES[0])).toBeNull()
    expect(receiptOf(MOVES[1])).toBeNull()
    expect(paymentOf(MOVES[1])).toBe('40.00')
  })
})

describe('statementPurchases', () => {
  const card = (over: Partial<PaymentMethodRead>): PaymentMethodRead => ({
    id: 1,
    name: 'Visa',
    type: 'card',
    financial_account_id: 2,
    financial_account_name: 'Carte Visa',
    statement_closing_day: 25,
    statement_payment_day: 5,
    settlement_account_id: 1,
    uses: 1,
    ...over,
  })
  const account = (id: number, kind: 'bank' | 'card') => ({ id, code: String(id), name: kind, kind })
  const statement = move({ date: '2026-04-05', kind: 'card_statement', piece_id: null, reference: 'Décompte Visa · mars', label: 'Visa', amount: '90.00', balance: '90.00' })
  const journals: JournalRead[] = [
    { account: account(1, 'bank'), opening: '0.00', receipts: '0.00', payments: '90.00', closing: '-90.00', movements: [{ ...statement, amount: '-90.00' }] },
    {
      account: account(2, 'card'),
      opening: '0.00',
      receipts: '90.00',
      payments: '90.00',
      closing: '0.00',
      movements: [
        move({ date: '2026-03-10', kind: 'purchase', piece_id: 5, reference: 'A-0005', amount: '-50.00' }),
        move({ date: '2026-03-25', kind: 'purchase', piece_id: 6, reference: 'A-0006', amount: '-40.00' }),
        move({ date: '2026-03-26', kind: 'purchase', piece_id: 7, reference: 'A-0007', amount: '-5.00' }),
        statement,
      ],
    },
  ]

  it('lists the card purchases whose statement is paid on the movement date', () => {
    const found = statementPurchases(journals, [card({})], journals[0].movements[0])
    expect(found?.purchases.map((m) => m.reference)).toEqual(['A-0005', 'A-0006'])
    expect(found?.complete).toBe(true)
  })

  it('flags a list that does not add up to the statement', () => {
    const short = { ...journals[1], movements: journals[1].movements.slice(1) }
    const found = statementPurchases([journals[0], short], [card({})], journals[0].movements[0])
    expect(found?.complete).toBe(false)
  })

  it('gives nothing when the card is unknown', () => {
    expect(statementPurchases(journals, [], journals[0].movements[0])).toBeNull()
  })
})
