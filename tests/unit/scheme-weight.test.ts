import { describe, it, expect } from 'vitest'
import { deriveSchemeEntry, schemeMetal, schemeDepositAccount, gramsFor } from '../../src/lib/scheme'

/**
 * METAL-WEIGHT SCHEMES — the arithmetic, locked to the numbers in the brief.
 *
 * ₹5,000/month at ₹10,000/g, ₹10,200/g, ₹10,404/g buys
 *   0.500000 + 0.490196 + 0.480584 = 1.470780 g
 * and at a maturity rate of ₹10,612/g that is ₹15,607.92 against ₹15,000 deposited.
 * The ₹607.92 is the shop's loss on being short the metal — which is the whole product.
 *
 * The defect this file exists to catch is the ROUNDING: 3dp per instalment instead of once at
 * the end. It is a ₹2.33 error on ₹15,000 over three months and it grows with the term.
 */

const START = '2026-01-10T00:00:00.000Z'
const MATURITY = '2026-04-10T00:00:00.000Z'
const RATES = [10000, 10200, 10404]
const MATURITY_RATE = 10612

const goldEntry = {
  startDate: START,
  emiAmount: 5000,
  totalInstallments: 3,
  type: 'gold',
  bonusAmount: 0,
  bonusGrams: 0,
  maturityDate: MATURITY,
  earlyExitDeduction: 0,
}

/** n receipts of ₹5,000 at the three rates, dated monthly. */
const receipts = (n: number) =>
  RATES.slice(0, n).map((rate, i) => ({
    installmentNo: i + 1,
    amount: 5000,
    paidDate: `2026-0${i + 1}-10T00:00:00.000Z`,
    metalRate: rate,
    grams: gramsFor(5000, rate) as number,
  }))

describe('weight scheme: grams bought, and what they are worth', () => {
  it('buys the grams the brief says, to 6dp', () => {
    const g = receipts(3).map((r) => r.grams)
    expect(g[0]).toBeCloseTo(0.5, 10)
    expect(g[1]).toBeCloseTo(0.490196, 6)
    expect(g[2]).toBeCloseTo(0.480584, 6)
  })

  it('accumulates 1.470780 g and redeems for ₹15,607.92 on ₹15,000 deposited', () => {
    const d = deriveSchemeEntry(goldEntry, receipts(3), MATURITY, MATURITY_RATE)
    expect(d.metal).toBe('gold')
    expect(d.totalPaid).toBe(15000)
    expect(d.totalGrams).toBeCloseTo(1.47078, 6)
    expect(d.totalGramsDisplay).toBe(1.471)
    expect(d.maturityValue).toBe(15607.92)
    expect(d.valuationRate).toBe(MATURITY_RATE)
  })

  it('does NOT round grams per instalment — that is the ₹2.33 bug', () => {
    const naive = receipts(3).map((r) => ({ ...r, grams: Math.round(r.grams * 1000) / 1000 }))
    const wrong = deriveSchemeEntry(goldEntry, naive, MATURITY, MATURITY_RATE)
    expect(wrong.maturityValue).toBe(15610.25)
    expect(wrong.maturityValue - 15607.92).toBeCloseTo(2.33, 2)
  })

  it('has no rupee value until a rate of the day is supplied — never a guessed one', () => {
    const d = deriveSchemeEntry(goldEntry, receipts(3), MATURITY)
    expect(d.valuationRate).toBeNull()
    expect(d.maturityValue).toBe(0)
    // The claim itself is unaffected: the grams are still there.
    expect(d.totalGrams).toBeCloseTo(1.47078, 6)
  })
})

describe('weight scheme: the bonus is GRAMS, on the same two conditions as cash', () => {
  const withBonus = { ...goldEntry, bonusGrams: 0.5 }

  it('withholds the bonus grams until every installment is in AND the date has arrived', () => {
    const early = deriveSchemeEntry(withBonus, receipts(3), '2026-03-10T00:00:00.000Z', MATURITY_RATE)
    expect(early.fullyPaid).toBe(true)
    expect(early.matured).toBe(false)
    expect(early.bonusGramsPayable).toBe(0)
    expect(early.maturityValue).toBe(15607.92)

    const short = deriveSchemeEntry(withBonus, receipts(2), MATURITY, MATURITY_RATE)
    expect(short.bonusGramsPayable).toBe(0)
  })

  it('pays 0.500 g of bonus gold, valued at the maturity rate', () => {
    const d = deriveSchemeEntry(withBonus, receipts(3), MATURITY, MATURITY_RATE)
    expect(d.bonusGramsPayable).toBe(0.5)
    expect(d.maturityGrams).toBeCloseTo(1.97078, 6)
    // (1.470780 + 0.5) × 10612, rounded once at the end.
    expect(d.maturityValue).toBe(20913.92)
  })

  it('never pays a rupee bonus on a weight scheme, even if bonusAmount is set', () => {
    // Belt and braces: the route holds bonusAmount at 0, and the derivation ignores it anyway.
    const mixed = { ...withBonus, bonusAmount: 5000 }
    const d = deriveSchemeEntry(mixed, receipts(3), MATURITY, MATURITY_RATE)
    expect(d.bonusPayable).toBe(0)
    expect(d.bonusGramsPayable).toBe(0.5)
  })

  it('refunds RUPEES on an early exit and forfeits every gram', () => {
    const d = deriveSchemeEntry({ ...withBonus, earlyExitDeduction: 500 }, receipts(2), '2026-03-01T00:00:00.000Z', MATURITY_RATE)
    expect(d.refundIfClosedNow).toBe(9500) // 10,000 in, ₹500 deduction. Not the grams' value.
    expect(d.bonusGramsPayable).toBe(0)
  })
})

describe('cash schemes are untouched by any of this', () => {
  const cash = {
    startDate: START, emiAmount: 5000, totalInstallments: 3, type: 'cash',
    bonusAmount: 5000, bonusGrams: 0, maturityDate: MATURITY, earlyExitDeduction: 0,
  }
  it('still pays a rupee bonus and reports no metal position', () => {
    const d = deriveSchemeEntry(cash, receipts(3).map(({ metalRate, grams, ...r }) => r), MATURITY)
    expect(d.metal).toBeNull()
    expect(d.totalGrams).toBe(0)
    expect(d.bonusPayable).toBe(5000)
    expect(d.maturityValue).toBe(20000)
  })
  it('ignores a valuation rate it was never meant to have', () => {
    const d = deriveSchemeEntry(cash, receipts(3), MATURITY, MATURITY_RATE)
    expect(d.maturityValue).toBe(20000)
  })
})

describe('the metal is the type, and it chooses the deposit account', () => {
  it('maps type to metal, and anything else to a cash scheme', () => {
    expect(schemeMetal('gold')).toBe('gold')
    expect(schemeMetal('silver')).toBe('silver')
    expect(schemeMetal('cash')).toBeNull()
    expect(schemeMetal(null)).toBeNull()
    expect(schemeMetal('platinum')).toBeNull()
  })

  it('keeps the gold book and the silver book apart, as stock and COGS already do', () => {
    expect(schemeDepositAccount('gold')).toBe('Gold Scheme Deposits')
    expect(schemeDepositAccount('silver')).toBe('Silver Scheme Deposits')
    expect(schemeDepositAccount('cash')).toBe('Scheme Deposits')
  })

  it('refuses to turn money into grams without a usable rate', () => {
    expect(gramsFor(5000, 0)).toBeNull()
    expect(gramsFor(5000, null)).toBeNull()
    expect(gramsFor(5000, -100)).toBeNull()
    expect(gramsFor(5000, 10000)).toBe(0.5)
  })
})
