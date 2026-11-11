import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CONVENTION,
  accrueSegment,
  conventionMonths,
  deriveLoan,
  describeConvention,
  effectiveRate,
  isDefaultConvention,
  resolveConvention,
  type InterestConvention,
} from '@/lib/interest'

/**
 * Task 71 — the interest-convention engine.
 *
 * A girvi shop quotes "full month" or "half month" and escalates the rate after six months. Until
 * this engine existed we had exactly one model, so we could not reproduce a competitor's quote and
 * could not import a shop's live loan book without re-pricing every loan on it.
 *
 * Every worked example below is arithmetic anyone can check on paper, because that is the only kind
 * of test worth having on a money rule. The reference loan throughout:
 *
 *     ₹50,000 · 2.5% per month · disbursed 2026-01-01
 *     2026-02-10 is 1 calendar month + 9 days (40 elapsed days)
 *     2026-04-11 is 3 calendar months + 10 days (100 elapsed days)
 *
 * Owners: be-lending. Independent verification: qa-finance.
 */

const LOAN = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z' }
const DAY40 = '2026-02-10T00:00:00.000Z'
const DAY100 = '2026-04-11T00:00:00.000Z'

const conv = (patch: Partial<InterestConvention>): InterestConvention => resolveConvention({ ...DEFAULT_CONVENTION, ...patch })

/** Interest on the reference loan to `to`, under `patch`, as the counter would charge it. */
const interestTo = (to: string, patch: Partial<InterestConvention> = {}) =>
  deriveLoan({ ...LOAN, interestConvention: conv(patch) }, [], to).accruedInterest

describe('the default convention is untouched — no existing loan moves', () => {
  it('a loan with no stored convention is priced exactly as it always was', () => {
    // The ₹53,486.77 worked example, re-asserted through the new code path.
    const paid = { id: 'p1', date: DAY40, amount: 15000 }
    const atRelease = deriveLoan(LOAN, [paid], DAY100)
    expect(atRelease.accruedInterest).toBe(1861.77)
    expect(atRelease.totalDue).toBe(38486.77)
    expect(atRelease.outstandingPrincipal).toBe(36625)
  })

  it('an explicit default convention prices identically to no convention at all', () => {
    const bare = deriveLoan(LOAN, [], DAY100)
    const explicit = deriveLoan({ ...LOAN, interestConvention: JSON.stringify(DEFAULT_CONVENTION) }, [], DAY100)
    expect(explicit.totalDue).toBe(bare.totalDue)
    expect(explicit.accruedInterest).toBe(4166.67) // 50000 × 2.5% × (3 + 10/30)
  })

  it('unreadable JSON falls back to the default rather than blanking a screen or a quote', () => {
    expect(deriveLoan({ ...LOAN, interestConvention: '{not json' }, [], DAY100).accruedInterest).toBe(4166.67)
    expect(resolveConvention('{not json')).toEqual(DEFAULT_CONVENTION)
    // One nonsense key falls back ALONE — it must not re-price the other six.
    expect(resolveConvention({ rounding: 'sideways', dayBasis: 'days30' } as never)).toEqual({
      ...DEFAULT_CONVENTION,
      dayBasis: 'days30',
    })
  })
})

/**
 * MONTHLY INTEREST OPTION — what the 9 leftover days of a 1-month-9-day loan cost.
 * On ₹50,000 at 2.5%/month one whole month is ₹1,250, so each rule is one multiplication:
 */
describe('part-month rules (oMunim MONTHLY INTEREST OPTION)', () => {
  it('exact — 1 + 9/30 = 1.3 months = ₹1,625.00 (the house default, no minimum)', () => {
    expect(conventionMonths(LOAN.loanDate, DAY40, conv({ rounding: 'exact' }))).toBeCloseTo(1.3, 10)
    expect(interestTo(DAY40)).toBe(1625)
  })

  it('full — any leftover day rounds up: 2 months = ₹2,500.00', () => {
    expect(conventionMonths(LOAN.loanDate, DAY40, conv({ rounding: 'full' }))).toBe(2)
    expect(interestTo(DAY40, { rounding: 'full' })).toBe(2500)
  })

  it('half — 9 days is inside 1–15, so half a month: 1.5 months = ₹1,875.00', () => {
    expect(interestTo(DAY40, { rounding: 'half' })).toBe(1875)
  })

  it('half — 16 days tips over to a whole month, 15 does not', () => {
    const half = conv({ rounding: 'half' })
    expect(conventionMonths(LOAN.loanDate, '2026-02-16T00:00:00.000Z', half)).toBe(1.5) // 15 days
    expect(conventionMonths(LOAN.loanDate, '2026-02-17T00:00:00.000Z', half)).toBe(2) // 16 days
  })

  it('weekly — 9 days is 2 whole weeks: 1 + 14/30 months = ₹1,833.33', () => {
    expect(conventionMonths(LOAN.loanDate, DAY40, conv({ rounding: 'weekly' }))).toBeCloseTo(1 + 14 / 30, 10)
    expect(interestTo(DAY40, { rounding: 'weekly' })).toBe(1833.33)
  })

  it('weekly never charges more than the month the leftover days sit in', () => {
    // 2026-03-01 to 2026-03-30 is 0 whole months and 29 leftover days. Five whole weeks is 35 days,
    // which is more than the month it sits in, so it is capped at 30/30 = exactly one month.
    expect(conventionMonths('2026-03-01T00:00:00.000Z', '2026-03-30T00:00:00.000Z', conv({ rounding: 'weekly' }))).toBe(1)
    // 26 leftover days is four weeks = 28 days, under the cap and charged as such.
    expect(conventionMonths('2026-03-01T00:00:00.000Z', '2026-03-27T00:00:00.000Z', conv({ rounding: 'weekly' }))).toBeCloseTo(28 / 30, 10)
  })

  it('a whole number of months is untouched by every rule — nobody pays a rounding penalty on 3.0', () => {
    for (const rounding of ['exact', 'full', 'half', 'weekly'] as const) {
      expect(conventionMonths(LOAN.loanDate, '2026-04-01T00:00:00.000Z', conv({ rounding }))).toBe(3)
    }
  })
})

/**
 * LOAN DAYS OPTION — how the term is measured before rounding. The two disagree by design:
 * 2026-01-01 → 2026-02-10 is 1 calendar month + 9 days, but 40 days = 1 × 30 + 10.
 */
describe('month length (oMunim LOAN DAYS OPTION)', () => {
  it('days30 charges 40 days as 1 + 10/30 = 1.3333 months = ₹1,666.67', () => {
    expect(interestTo(DAY40, { dayBasis: 'days30' })).toBe(1666.67)
    expect(interestTo(DAY40)).toBe(1625) // calendar, for contrast
  })

  it('calendar charges February and March alike; days30 does not — that is the whole difference', () => {
    const feb = { ...LOAN, loanDate: '2026-02-01T00:00:00.000Z' }
    const mar = { ...LOAN, loanDate: '2026-03-01T00:00:00.000Z' }
    const cal = (l: typeof feb, to: string) => deriveLoan(l, [], to).accruedInterest
    expect(cal(feb, '2026-03-01T00:00:00.000Z')).toBe(1250)
    expect(cal(mar, '2026-04-01T00:00:00.000Z')).toBe(1250)

    const d30 = (l: typeof feb, to: string) => deriveLoan({ ...l, interestConvention: conv({ dayBasis: 'days30' }) }, [], to).accruedInterest
    expect(d30(feb, '2026-03-01T00:00:00.000Z')).toBe(1166.67) // 28 days
    expect(d30(mar, '2026-04-01T00:00:00.000Z')).toBe(1291.67) // 31 days
  })
})

describe('rate basis (the loan screen Monthly/Annually selector)', () => {
  it('30% per annum prices exactly as 2.5% per month, and divides by 12 only once', () => {
    const annual = deriveLoan(
      { ...LOAN, interestRate: 30, interestConvention: conv({ rateBasis: 'annual' }) },
      [],
      DAY100,
    )
    expect(annual.accruedInterest).toBe(4166.67)
    expect(annual.effectiveRatePct).toBe(2.5)
  })
})

describe('compound interest with rests (oMunim girviCompoundedOption)', () => {
  it('yearly rests: 12 months is still simple, 24 months folds once — ₹34,500 on ₹50,000', () => {
    const yearly = conv({ compound: true, restMonths: 12 })
    // No rest falls strictly inside the first 12 months, so year one is plain simple interest.
    expect(accrueSegment(50000, 2.5, yearly, 0, 12)).toBeCloseTo(15000, 6)
    // Year one's ₹15,000 folds in at month 12, so year two accrues on ₹65,000: 65000 × 2.5% × 12
    // = ₹19,500. Total ₹34,500 — and 50000 × 1.30² − 50000 is the same number.
    expect(accrueSegment(50000, 2.5, yearly, 0, 24)).toBeCloseTo(34500, 6)
    expect(accrueSegment(50000, 2.5, yearly, 0, 24)).toBeCloseTo(50000 * 1.3 ** 2 - 50000, 6)
  })

  it('quarterly rests compound four times a year, and beat yearly rests', () => {
    const q = accrueSegment(50000, 2.5, conv({ compound: true, restMonths: 3 }), 0, 12)
    expect(q).toBeCloseTo(50000 * 1.075 ** 4 - 50000, 6) // 2.5% × 3 months = 7.5% a quarter
    expect(q).toBeGreaterThan(15000)
  })

  it('a rest that falls mid-segment is honoured on its own date, not at the segment edge', () => {
    // Months 6 → 18 with yearly rests: 6 months at ₹50,000 (₹7,500), fold, then 6 months on
    // ₹57,500 (₹8,625). Charging the whole 12 months flat would be ₹15,000.
    expect(accrueSegment(50000, 2.5, conv({ compound: true, restMonths: 12 }), 6, 12)).toBeCloseTo(7500 + 8625, 6)
  })
})

/**
 * Settings ▸ ROI — the 13-row slab table. oMunim's shipped ROI 1 is base 1% with four rungs of
 * +0.5% at 3, 6, 9 and 12 months, recurring. Cumulative, so on ₹1,00,000:
 *     months  0–3 @1.0% = ₹3,000    3–6 @1.5% = ₹4,500
 *             6–9 @2.0% = ₹6,000    9–12 @2.5% = ₹7,500      ⇒ one year = ₹21,000
 *     12–15 @3.0% = ₹9,000   15–18 @3.5% = ₹10,500           ⇒ 18 months = ₹40,500
 */
describe('ROI slab escalation (oMunim Settings ▸ ROI)', () => {
  const OMUNIM_ROI_1 = {
    steps: [
      { afterMonths: 3, increaseBy: 0.5 },
      { afterMonths: 6, increaseBy: 0.5 },
      { afterMonths: 9, increaseBy: 0.5 },
      { afterMonths: 12, increaseBy: 0.5 },
    ],
    recurring: true,
  }
  const slabbed = conv({ slab: OMUNIM_ROI_1 })

  it('steps the rate cumulatively as the loan ages', () => {
    // base 1 + four rungs of 0.5 = 3.0 at month 12, then the recurring tail adds 0.5 every 3
    // months: 15 -> 3.5, 18 -> 4.0, 21 -> 4.5, 24 -> 5.0.
    for (const [age, rate] of [[0, 1], [2.9, 1], [3, 1.5], [6, 2], [9, 2.5], [12, 3], [15, 3.5], [24, 5]] as const) {
      expect(effectiveRate(1, slabbed, age), `age ${age} months`).toBeCloseTo(rate, 10)
    }
  })

  it('one year on ₹1,00,000 costs ₹21,000, not ₹12,000 at the flat base rate', () => {
    expect(accrueSegment(100000, 1, slabbed, 0, 12)).toBeCloseTo(21000, 6)
    expect(accrueSegment(100000, 1, DEFAULT_CONVENTION, 0, 12)).toBeCloseTo(12000, 6)
  })

  it('the recurring tail keeps stepping past the last rung', () => {
    expect(accrueSegment(100000, 1, slabbed, 0, 18)).toBeCloseTo(40500, 6)
  })

  it('a step that falls inside a segment is charged from its own month', () => {
    // Months 2 → 4 on ₹1,00,000: one month at 1% then one at 1.5% = ₹1,000 + ₹1,500.
    expect(accrueSegment(100000, 1, slabbed, 2, 2)).toBeCloseTo(2500, 6)
  })

  it('escalates from the LOAN date, not from the last payment — a part payment does not reset the age', () => {
    const loan = { principalAmount: 100000, interestRate: 1, loanDate: '2026-01-01T00:00:00.000Z', interestConvention: slabbed }
    // Pay exactly the interest due at 3 months (₹3,000), leaving ₹1,00,000 out, then run to month 6.
    const d = deriveLoan(loan, [{ id: 'p1', date: '2026-04-01T00:00:00.000Z', amount: 3000 }], '2026-07-01T00:00:00.000Z')
    expect(d.outstandingPrincipal).toBe(100000)
    expect(d.accruedInterest).toBe(4500) // months 3–6 at 1.5%, NOT months 0–3 at 1% again
    expect(d.effectiveRatePct).toBe(2) // month 6: the next rung
  })
})

describe('first month full (oMunim FIRST MONTH FULL INT.)', () => {
  const fmf = conv({ firstMonthFull: true })

  it('charges a whole month on a pledge redeemed after 5 days: ₹1,250, not ₹208.33', () => {
    expect(interestTo('2026-01-06T00:00:00.000Z', { firstMonthFull: true })).toBe(1250)
    expect(interestTo('2026-01-06T00:00:00.000Z')).toBe(208.33)
  })

  it('applies to the first segment ONLY — a part payment does not buy another minimum month', () => {
    // ₹15,000 on day 40 clears ₹1,625 interest (1.3 months, above the one-month floor) and leaves
    // ₹36,625. Five days later only 5/30 of a month has run on the reduced balance: ₹152.60.
    const d = deriveLoan({ ...LOAN, interestConvention: fmf }, [{ id: 'p1', date: DAY40, amount: 15000 }], '2026-02-15T00:00:00.000Z')
    expect(d.outstandingPrincipal).toBe(36625)
    expect(d.accruedInterest).toBe(152.6) // 36625 × 2.5% × 5/30
  })

  it('a same-instant quote still owes the bare principal', () => {
    expect(deriveLoan({ ...LOAN, interestConvention: fmf }, [], LOAN.loanDate).totalDue).toBe(50000)
  })
})

describe('grace period (oMunim LOAN GRACE PERIOD)', () => {
  it('charges nothing inside the window and everything from day zero once it lapses', () => {
    const g = { graceDays: 7 }
    expect(interestTo('2026-01-06T00:00:00.000Z', g)).toBe(0) // day 5, inside
    expect(interestTo('2026-01-08T00:00:00.000Z', g)).toBe(0) // day 7, the last free day
    // Day 8: a waiver window, not a deduction — interest runs from the loan date.
    expect(interestTo('2026-01-09T00:00:00.000Z', g)).toBe(333.33) // 50000 × 2.5% × 8/30
  })

  it('beats firstMonthFull — a redemption inside grace pays nothing at all', () => {
    expect(interestTo('2026-01-06T00:00:00.000Z', { graceDays: 7, firstMonthFull: true })).toBe(0)
  })
})

/**
 * THE RULE THAT MATTERS MOST: a loan is priced by the convention in force when it was WRITTEN.
 * The convention lives on the loan; nothing in the replay reads a firm setting.
 */
describe('the convention is frozen onto the loan', () => {
  it('two loans written on the same day under different conventions keep their own prices', () => {
    const houseDefault = deriveLoan(LOAN, [], DAY40)
    const fullMonth = deriveLoan({ ...LOAN, interestConvention: JSON.stringify(conv({ rounding: 'full' })) }, [], DAY40)
    expect(houseDefault.accruedInterest).toBe(1625)
    expect(fullMonth.accruedInterest).toBe(2500)
    // …and each one says which rule priced it, so a receipt can print it.
    expect(houseDefault.convention.rounding).toBe('exact')
    expect(fullMonth.convention.rounding).toBe('full')
  })

  it('the derivation carries the convention and the live rate for the screen and the receipt', () => {
    const d = deriveLoan({ ...LOAN, interestConvention: conv({ rounding: 'half' }) }, [], DAY40)
    expect(describeConvention(d.convention)).toContain('half or a full month')
    expect(d.effectiveRatePct).toBe(2.5)
    expect(isDefaultConvention(d.convention)).toBe(false)
    expect(isDefaultConvention(DEFAULT_CONVENTION)).toBe(true)
  })
})

/**
 * oMunim's loan screen SHOWS ₹14,829 and CHARGES ₹14,829.26 — the displayed S. INT is truncated
 * while the hidden totalAmt carries the true figure. Every convention must round once, at the end,
 * so the number on the screen is the number on the receipt.
 */
describe('display and charge are the same number under every convention', () => {
  it('every figure a screen shows is already the figure the counter takes', () => {
    const patches: Partial<InterestConvention>[] = [
      {},
      { rounding: 'full' },
      { rounding: 'half' },
      { rounding: 'weekly' },
      { dayBasis: 'days30' },
      { compound: true, restMonths: 3 },
      { rateBasis: 'annual' },
      { slab: { steps: [{ afterMonths: 6, increaseBy: 0.75 }], recurring: false } },
    ]
    for (const p of patches) {
      const d = deriveLoan({ ...LOAN, principalAmount: 1482926, interestRate: 1, interestConvention: conv(p) }, [], DAY100)
      for (const v of [d.accruedInterest, d.outstandingPrincipal, d.totalDue]) {
        expect(Number(v.toFixed(2)), `${describeConvention(conv(p))} must be exact to the paise`).toBe(v)
      }
      // principal + interest = total due, to the paise, with no third rounding in between.
      expect(d.totalDue).toBeCloseTo(d.outstandingPrincipal + d.accruedInterest, 2)
    }
  })
})

describe('the replay survives every convention', () => {
  it('a topup still raises the principal from its own date under a non-default convention', () => {
    // Full-month rule. ₹20,000 topped up on 02-01: January is 1 month on ₹50,000 (₹1,250), and
    // 02-01 → 03-01 is 1 month on ₹70,000 (₹1,750). Charging ₹70,000 for both would be ₹3,500.
    const d = deriveLoan(
      { ...LOAN, interestConvention: conv({ rounding: 'full' }) },
      [{ id: 't1', type: 'topup', date: '2026-02-01T00:00:00.000Z', amount: 20000 }],
      '2026-03-01T00:00:00.000Z',
    )
    expect(d.outstandingPrincipal).toBe(70000)
    expect(d.accruedInterest).toBe(3000)
    expect(d.principalAdvanced).toBe(70000)
  })

  it('a reversal still cancels both rows under a non-default convention', () => {
    const d = deriveLoan({ ...LOAN, interestConvention: conv({ rounding: 'full' }) }, [
      { id: 'p1', date: DAY40, amount: 15000 },
      { id: 'r1', date: '2026-03-01T00:00:00.000Z', amount: -15000, reversalOfId: 'p1' },
    ], DAY100)
    expect(d.outstandingPrincipal).toBe(50000)
    expect(d.totalPaid).toBe(0)
    expect(d.accruedInterest).toBe(5000) // 4 full months
  })

  it('never runs away on a nonsense slab or rest period', () => {
    const silly = conv({ compound: true, restMonths: 0, slab: { steps: [{ afterMonths: 0.0001, increaseBy: 0 }], recurring: true } })
    expect(Number.isFinite(accrueSegment(50000, 2.5, silly, 0, 600))).toBe(true)
  })
})
