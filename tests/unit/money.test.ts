import { describe, it, expect } from 'vitest'
import {
  formatINR,
  formatINRShort,
  formatWeight,
  daysBetween,
  toISODate,
  calculateLoanInterest,
  calculateCompoundInterest,
} from '@/lib/format'
import { PURITIES, PURITY_PERCENT } from '@/lib/constants'

describe('rupee formatting (Indian lakh/crore grouping)', () => {
  it('groups in the Indian system, not thousands', () => {
    expect(formatINR(108750)).toBe('₹1,08,750')
    expect(formatINR(10000000)).toBe('₹1,00,00,000')
    // Paise print in pairs. This used to assert '₹1,234.5', which on an old-gold rate reads
    // like a truncated figure rather than a price.
    expect(formatINR(1234.5)).toBe('₹1,234.50')
    expect(formatINR(1234.56)).toBe('₹1,234.56')
    expect(formatINR(1234)).toBe('₹1,234')
  })

  it('never renders NaN or undefined into a money field', () => {
    expect(formatINR(null)).toBe('₹0')
    expect(formatINR(undefined)).toBe('₹0')
    expect(formatINR(NaN)).toBe('₹0')
    expect(formatINR(0)).toBe('₹0')
  })

  it('abbreviates at the Indian thresholds', () => {
    expect(formatINRShort(12345678)).toBe('₹1.23 Cr')
    expect(formatINRShort(250000)).toBe('₹2.50 L')
    expect(formatINRShort(1500)).toBe('₹1.5K')
    expect(formatINRShort(999)).toBe('₹999')
  })

  it('keeps a negative amount negative when abbreviating', () => {
    // Characterisation, not endorsement: the sign lands after the symbol ("₹-2.50 L").
    // Cosmetic, but locked down so a change to it is deliberate.
    expect(formatINRShort(-250000)).toBe('₹-2.50 L')
  })
})

describe('weight', () => {
  it('always shows three decimals — a jeweller reads milligrams', () => {
    expect(formatWeight(10.5)).toBe('10.500g')
    expect(formatWeight(0)).toBe('0.000g')
    expect(formatWeight(9.9996)).toBe('10.000g')
    expect(formatWeight(null)).toBe('0.000g')
  })
})

describe('purity table (BIS)', () => {
  it('matches the BIS fineness for every karatage offered in the UI', () => {
    expect(PURITY_PERCENT['24K']).toBe(99.9)
    expect(PURITY_PERCENT['22K']).toBe(91.6)
    expect(PURITY_PERCENT['21K']).toBe(87.5)
    expect(PURITY_PERCENT['18K']).toBe(75.0)
    expect(PURITY_PERCENT['14K']).toBe(58.5)
    expect(PURITY_PERCENT['925']).toBe(92.5)
  })

  it('has a percentage for every purity the dropdown can produce', () => {
    // sell.tsx does PURITY_PERCENT[purity] ?? Number(purity) — a missing entry silently
    // becomes NaN and poisons fine weight, so the two lists must stay in step.
    for (const p of PURITIES) {
      expect(PURITY_PERCENT[p], `PURITY_PERCENT is missing "${p}"`).toBeTypeOf('number')
    }
  })

  it('fine weight = net weight × purity', () => {
    const fine = 10 * (PURITY_PERCENT['22K'] / 100)
    expect(fine).toBeCloseTo(9.16, 6)
  })
})

describe('simple interest (girvi, % per month)', () => {
  it('₹50,000 at 2%/month for 6 months = ₹6,000', () => {
    expect(calculateLoanInterest(50000, 2, 6)).toBe(6000)
    expect(calculateLoanInterest(50000, 2, 6, 'simple')).toBe(6000)
  })

  it('is zero for a zero-month loan', () => {
    expect(calculateLoanInterest(50000, 2, 0)).toBe(0)
  })
})

describe('compound interest', () => {
  it('monthly compounding: A = P(1 + r)^n', () => {
    const r = calculateCompoundInterest(100000, 2, 12, 'monthly')
    expect(r.totalAmount).toBe(126824) // 100000 × 1.02^12
    expect(r.interest).toBe(26824)
    expect(r.breakdown).toHaveLength(12)
    expect(r.breakdown[0]).toEqual({ month: 1, interest: 2000, balance: 102000 })
  })

  it('quarterly compounding is cheaper than monthly for the same nominal rate', () => {
    const monthly = calculateCompoundInterest(100000, 2, 12, 'monthly')
    const quarterly = calculateCompoundInterest(100000, 2, 12, 'quarterly')
    const yearly = calculateCompoundInterest(100000, 2, 12, 'yearly')
    expect(quarterly.totalAmount).toBe(126248) // 100000 × 1.06^4
    expect(yearly.totalAmount).toBe(124000) // 100000 × 1.24
    expect(monthly.totalAmount).toBeGreaterThan(quarterly.totalAmount)
    expect(quarterly.totalAmount).toBeGreaterThan(yearly.totalAmount)
  })

  it('guards the degenerate inputs', () => {
    expect(calculateCompoundInterest(0, 2, 12)).toEqual({ interest: 0, totalAmount: 0, breakdown: [] })
    expect(calculateCompoundInterest(100000, 2, 0)).toEqual({ interest: 0, totalAmount: 100000, breakdown: [] })
  })

  // DEFECT (see report): the month-by-month schedule ignores the compounding frequency —
  // it always accrues at annualRate/12. For quarterly/yearly the last row of the schedule
  // therefore contradicts the headline total shown right above it, on both the Girvi
  // Calculator (src/components/app/modules/girvicalc.tsx:224) and the Expo screen.
  // Left failing on purpose: it documents a real, user-visible inconsistency.
  it('the repayment schedule must end on the same figure as the headline total', () => {
    for (const mode of ['monthly', 'quarterly', 'yearly'] as const) {
      const r = calculateCompoundInterest(100000, 2, 12, mode)
      const lastRow = r.breakdown[r.breakdown.length - 1].balance
      expect(lastRow, `${mode}: schedule ends at ${lastRow}, headline says ${r.totalAmount}`)
        .toBe(r.totalAmount)
    }
  })
})

describe('dates', () => {
  it('counts whole days between two dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30)
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('serialises to a plain ISO date', () => {
    expect(toISODate('2026-03-15T10:30:00Z')).toBe('2026-03-15')
    expect(toISODate(null)).toBe('')
    expect(toISODate('not a date')).toBe('')
  })
})
