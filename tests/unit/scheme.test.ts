import { describe, it, expect } from 'vitest'
import { deriveSchemeEntry, addMonths } from '../../src/lib/scheme'

/**
 * The 11+1 kitty, stated once: ₹5,000 × 11 = ₹55,000 deposited, ₹5,000 bonus, ₹60,000 redeemable
 * — but only when BOTH conditions hold: every installment in AND the maturity date reached.
 */
const START = '2026-01-10T00:00:00.000Z'
const entry = {
  startDate: START,
  emiAmount: 5000,
  totalInstallments: 11,
  bonusAmount: 5000,
  maturityDate: '2026-12-10T00:00:00.000Z',
  earlyExitDeduction: 0,
}
const pay = (n: number, on: string, amount = 5000) => ({ installmentNo: n, amount, paidDate: on })
const monthly = (n: number) => Array.from({ length: n }, (_, i) => pay(i + 1, addMonths(START, i).toISOString()))

describe('scheme derivation', () => {
  it('counts one installment due on day one', () => {
    const d = deriveSchemeEntry(entry, [], START)
    expect(d.due).toBe(1)
    expect(d.missed).toBe(0)
    expect(d.paid).toBe(0)
  })

  it('counts due and missed against elapsed whole months', () => {
    // Four months in (10 May), two paid: slots 1-5 expected, 1-4 fully elapsed.
    const d = deriveSchemeEntry(entry, monthly(2), '2026-05-10T00:00:00.000Z')
    expect(d.elapsedMonths).toBe(4)
    expect(d.due).toBe(3) // min(11, 4+1) − 2
    expect(d.missed).toBe(2) // min(11, 4) − 2
    expect(d.totalPaid).toBe(10000)
  })

  it('never counts more than the term, and stops at zero once ahead', () => {
    const d = deriveSchemeEntry(entry, monthly(11), '2027-06-10T00:00:00.000Z')
    expect(d.due).toBe(0)
    expect(d.missed).toBe(0)
    expect(d.remaining).toBe(0)
  })

  it('WITHHOLDS the bonus when all 11 are paid but the date has not arrived', () => {
    // Prepaid the lot by 12 March. ₹55,000 is redeemable, ₹60,000 is not.
    const early = deriveSchemeEntry(entry, monthly(11), '2026-03-12T00:00:00.000Z')
    expect(early.fullyPaid).toBe(true)
    expect(early.matured).toBe(false)
    expect(early.bonusPayable).toBe(0)
    expect(early.maturityValue).toBe(55000)
  })

  it('pays the bonus once both conditions hold', () => {
    const on = deriveSchemeEntry(entry, monthly(11), '2026-12-10T00:00:00.000Z')
    expect(on.matured).toBe(true)
    expect(on.bonusPayable).toBe(5000)
    expect(on.maturityValue).toBe(60000)
  })

  it('withholds the bonus past maturity when an installment is missing', () => {
    const short = deriveSchemeEntry(entry, monthly(10), '2027-01-10T00:00:00.000Z')
    expect(short.matured).toBe(false)
    expect(short.maturityValue).toBe(50000)
    expect(short.due).toBe(1)
  })

  it('refunds deposits less an explicit deduction on early exit, never a bonus', () => {
    const d = deriveSchemeEntry({ ...entry, earlyExitDeduction: 1500 }, monthly(6), '2026-07-10T00:00:00.000Z')
    expect(d.totalPaid).toBe(30000)
    expect(d.refundIfClosedNow).toBe(28500)
    expect(d.bonusPayable).toBe(0)
  })

  it('rounds the deposit total once, not per receipt', () => {
    const odd = [pay(1, START, 1666.665), pay(2, START, 1666.665), pay(3, START, 1666.67)]
    expect(deriveSchemeEntry(entry, odd, START).totalPaid).toBe(5000)
  })

  it('suggests the next receipt number without renumbering an out-of-order one', () => {
    const d = deriveSchemeEntry(entry, [pay(1, START), pay(3, START)], START)
    expect(d.nextInstallmentNo).toBe(4)
    expect(d.paid).toBe(2)
  })

  it('clamps the maturity date onto a short month', () => {
    expect(addMonths('2026-01-31T00:00:00.000Z', 1).toISOString().slice(0, 10)).toBe('2026-02-28')
  })
})
