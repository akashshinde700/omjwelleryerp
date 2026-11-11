import { describe, it, expect } from 'vitest'
import { udhaarSign, udhaarDue, udhaarBreakdown, udhaarGramsDue, udhaarMetal } from '@/lib/udhaar'

// The dashboard bug this locks down: credit ₹80,000 + debit ₹30,000 read as ₹1,10,000
// receivable instead of ₹50,000, because every type was summed as a positive.
describe('udhaar sign convention', () => {
  it('credit is money out (+1), debit is money back (-1), advance has no direction (0)', () => {
    expect(udhaarSign('credit')).toBe(1)
    expect(udhaarSign('debit')).toBe(-1)
    expect(udhaarSign('advance')).toBe(0)
    expect(udhaarSign('nonsense')).toBe(0)
    expect(udhaarSign(null)).toBe(0)
  })
})

describe('net outstanding = Σ sign(type) × (amount − settledAmount)', () => {
  it('nets ₹80,000 given against ₹30,000 received to ₹50,000', () => {
    const rows = [
      { type: 'credit', amount: 80000, settledAmount: 0, status: 'active' },
      { type: 'debit', amount: 30000, settledAmount: 0, status: 'active' },
    ]
    expect(udhaarBreakdown(rows)).toMatchObject({ toReceive: 80000, toPay: 30000, net: 50000 })
  })

  it('subtracts settledAmount instead of ignoring it', () => {
    const rows = [
      { type: 'credit', amount: 80000, settledAmount: 5000, status: 'partial' },
      { type: 'debit', amount: 30000, settledAmount: 0, status: 'active' },
    ]
    expect(udhaarBreakdown(rows).net).toBe(45000)
  })

  it('drops settled rows entirely', () => {
    const rows = [
      { type: 'credit', amount: 80000, settledAmount: 80000, status: 'settled' },
      { type: 'credit', amount: 1000, settledAmount: 0, status: 'active' },
    ]
    expect(udhaarBreakdown(rows).net).toBe(1000)
  })

  it('keeps advances out of the net and reports them separately', () => {
    const rows = [
      { type: 'credit', amount: 10000, settledAmount: 0, status: 'active' },
      { type: 'advance', amount: 7000, settledAmount: 0, status: 'active' },
    ]
    expect(udhaarBreakdown(rows)).toMatchObject({ net: 10000, advance: 7000 })
  })

  it('an over-settled row never turns into a negative receivable', () => {
    expect(udhaarDue({ type: 'credit', amount: 100, settledAmount: 250 })).toBe(0)
  })

  it('rounds half-up once at the end, not per row', () => {
    const rows = Array.from({ length: 3 }, () => ({ type: 'credit', amount: 0.335, settledAmount: 0 }))
    // 3 × 0.335 = 1.005 → ₹1.01, not 3 × 0.34 = 1.02
    expect(udhaarBreakdown(rows).net).toBe(1.01)
  })

  it('handles nulls from Prisma groupBy buckets with no rows', () => {
    expect(udhaarBreakdown([{ type: 'credit', amount: null, settledAmount: null }]).net).toBe(0)
    expect(udhaarBreakdown([]).net).toBe(0)
  })
})

/**
 * METAL UDHAAR - "you owe me 10 grams", the commonest udhaar in a jewellery shop.
 * Same direction function, different unit: credit = the metal left the firm.
 * Grams ARE rounded to 3dp here - this is physical metal a shop weighs, not a computed claim.
 */
describe('metal udhaar is carried in grams, on the same sign convention', () => {
  it('nets 10 g given against 3 g returned to 7 g, and keeps gold apart from silver', () => {
    const rows = [
      { type: 'credit', amount: 0, grams: 10, settledGrams: 0, metal: 'gold', status: 'active' },
      { type: 'debit', amount: 0, grams: 3, settledGrams: 0, metal: 'gold', status: 'active' },
      { type: 'credit', amount: 0, grams: 250, settledGrams: 0, metal: 'silver', status: 'active' },
    ]
    expect(udhaarBreakdown(rows).metal).toEqual({ gold: 7, silver: 250 })
  })

  it('never lets grams leak into the rupee totals', () => {
    const rows = [
      { type: 'credit', amount: 50000, settledAmount: 0, status: 'active' },
      { type: 'credit', amount: 0, grams: 10, settledGrams: 0, metal: 'gold', status: 'active' },
    ]
    const b = udhaarBreakdown(rows)
    expect(b.net).toBe(50000)
    expect(b.metal.gold).toBe(7 + 3)
  })

  it('subtracts settledGrams and drops a settled row, exactly as money does', () => {
    const rows = [
      { type: 'credit', amount: 0, grams: 10, settledGrams: 2.5, metal: 'gold', status: 'partial' },
      { type: 'credit', amount: 0, grams: 4, settledGrams: 4, metal: 'gold', status: 'settled' },
    ]
    expect(udhaarBreakdown(rows).metal.gold).toBe(7.5)
    expect(udhaarGramsDue({ type: 'credit', amount: 0, grams: 4, settledGrams: 9 })).toBe(0)
  })

  it('rounds the total to 3dp once, not each row', () => {
    const rows = Array.from({ length: 3 }, () => ({
      type: 'credit', amount: 0, grams: 0.0005, settledGrams: 0, metal: 'gold', status: 'active',
    }))
    // 3 x 0.0005 = 0.0015 -> 0.002 g, not 3 x 0.001 = 0.003 g
    expect(udhaarBreakdown(rows).metal.gold).toBe(0.002)
  })

  it('treats an unknown metal as an ordinary money row rather than inventing a book', () => {
    expect(udhaarMetal('gold')).toBe('gold')
    expect(udhaarMetal('platinum')).toBeNull()
    expect(udhaarMetal(null)).toBeNull()
    const rows = [{ type: 'credit', amount: 900, settledAmount: 0, metal: null, status: 'active' }]
    expect(udhaarBreakdown(rows)).toMatchObject({ net: 900, metal: { gold: 0, silver: 0 } })
  })

  it('leaves every existing money-only caller with the same numbers', () => {
    // Dashboard and the customer panel pass groupBy buckets with no metal field at all.
    const rows = [
      { type: 'credit', amount: 80000, settledAmount: 0, status: 'active' },
      { type: 'debit', amount: 30000, settledAmount: 0, status: 'active' },
    ]
    expect(udhaarBreakdown(rows)).toMatchObject({ toReceive: 80000, toPay: 30000, net: 50000 })
  })
})
