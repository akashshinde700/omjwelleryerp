import { describe, it, expect } from 'vitest'
import * as web from '@/lib/interest'
import * as mob from '../../mobile/src/utils/interest'

/**
 * mobile/src/utils/interest.ts is a HAND-SYNCED port of src/lib/interest.ts — Metro only serves
 * files under mobile/, so the phone cannot import the web module. A hand-synced copy of a money
 * rule rots the first time one side is edited alone, and the symptom is the worst kind: a
 * topped-up loan shows a smaller balance on the phone than at the counter, and nothing errors.
 *
 * This test is the sync guard. It drives BOTH copies over every convention, every part-month
 * boundary, the slab, the compounding rests and a full replay, and demands the same answer.
 * If it goes red, the two files have diverged — fix the port, do not relax the test.
 *
 * Owners: be-lending (with fe-mobile). Independent verification: qa-finance.
 */

const CONVENTIONS: Partial<web.InterestConvention>[] = [
  {},
  { rounding: 'full' },
  { rounding: 'half' },
  { rounding: 'weekly' },
  { dayBasis: 'days30' },
  { dayBasis: 'days30', rounding: 'full' },
  { rateBasis: 'annual' },
  { compound: true, restMonths: 1 },
  { compound: true, restMonths: 3 },
  { compound: true, restMonths: 12 },
  { firstMonthFull: true },
  { graceDays: 15 },
  { graceDays: 15, firstMonthFull: true },
  {
    slab: {
      steps: [
        { afterMonths: 3, increaseBy: 0.5 },
        { afterMonths: 6, increaseBy: 0.5 },
        { afterMonths: 9, increaseBy: 0.5 },
        { afterMonths: 12, increaseBy: 0.5 },
      ],
      recurring: true,
    },
  },
  { compound: true, restMonths: 6, slab: { steps: [{ afterMonths: 6, increaseBy: 1 }], recurring: false } },
]

/** Boundaries an operator argues about: day 1, a week, the half-month edges, month ends, leap day. */
const DATES = [
  '2026-01-01T00:00:00.000Z',
  '2026-01-02T00:00:00.000Z',
  '2026-01-08T00:00:00.000Z',
  '2026-01-16T00:00:00.000Z',
  '2026-01-17T00:00:00.000Z',
  '2026-01-31T00:00:00.000Z',
  '2026-02-01T00:00:00.000Z',
  '2026-02-10T00:00:00.000Z',
  '2026-02-28T00:00:00.000Z',
  '2026-04-11T00:00:00.000Z',
  '2027-01-01T00:00:00.000Z',
  '2028-02-29T00:00:00.000Z',
  '2029-07-04T00:00:00.000Z',
]

const START = '2026-01-01T00:00:00.000Z'

describe('web and mobile agree on the month count under every convention', () => {
  it('matches on every part-month boundary', () => {
    for (const patch of CONVENTIONS) {
      const w = web.resolveConvention({ ...web.DEFAULT_CONVENTION, ...patch })
      const m = mob.resolveConvention({ ...mob.DEFAULT_CONVENTION, ...patch } as never)
      expect(m, `resolveConvention diverged for ${JSON.stringify(patch)}`).toEqual(w)
      for (const to of DATES) {
        for (const fromDisbursal of [true, false]) {
          expect(
            mob.conventionMonths(START, to, m as never, fromDisbursal),
            `${web.describeConvention(w)} to ${to} (fromDisbursal=${fromDisbursal})`,
          ).toBe(web.conventionMonths(START, to, w, fromDisbursal))
        }
      }
    }
  })
})

describe('web and mobile agree on the interest charged', () => {
  it('matches accrueSegment across ages, terms, rates and conventions', () => {
    for (const patch of CONVENTIONS) {
      const w = web.resolveConvention({ ...web.DEFAULT_CONVENTION, ...patch })
      const m = mob.resolveConvention({ ...mob.DEFAULT_CONVENTION, ...patch } as never)
      for (const age of [0, 1.5, 6, 11.9, 12, 25]) {
        for (const months of [0.1, 1, 2.0333333, 6, 13, 30]) {
          for (const rate of [1, 2.5, 18]) {
            expect(
              mob.accrueSegment(50000, rate, m as never, age, months),
              `${web.describeConvention(w)} · age ${age} · ${months}mo · ${rate}%`,
            ).toBeCloseTo(web.accrueSegment(50000, rate, w, age, months), 9)
          }
        }
      }
    }
  })

  it('matches a full replay — part payment, topup, discount, reversal — under every convention', () => {
    const txns = [
      { id: 'p1', date: '2026-02-10T00:00:00.000Z', amount: 15000 },
      { id: 't1', type: 'topup', date: '2026-03-01T00:00:00.000Z', amount: 20000 },
      { id: 'p2', date: '2026-04-11T00:00:00.000Z', amount: 5000, discount: 250 },
      { id: 'p3', date: '2026-05-01T00:00:00.000Z', amount: 1000 },
      { id: 'r1', date: '2026-05-02T00:00:00.000Z', amount: -1000, reversalOfId: 'p3' },
    ]
    for (const patch of CONVENTIONS) {
      const conv = web.resolveConvention({ ...web.DEFAULT_CONVENTION, ...patch })
      const loan = { principalAmount: 50000, interestRate: 2.5, loanDate: START, interestConvention: conv }
      for (const asOf of ['2026-03-15T00:00:00.000Z', '2026-06-01T00:00:00.000Z', '2027-09-09T00:00:00.000Z']) {
        const w = web.deriveLoan(loan, txns, asOf)
        const m = mob.deriveLoan({ ...loan, interestConvention: JSON.stringify(conv) } as never, txns as never, asOf)
        for (const k of ['outstandingPrincipal', 'accruedInterest', 'totalDue', 'totalPaid', 'paidInterest', 'paidPrincipal', 'totalDiscount', 'totalTopUp', 'principalAdvanced', 'effectiveRatePct'] as const) {
          expect(m[k], `${k} diverged under ${web.describeConvention(conv)} at ${asOf}`).toBe(w[k])
        }
        expect(m.interestFrom.getTime()).toBe(w.interestFrom.getTime())
        expect(mob.splitPayment(m.totalDue, m.accruedInterest)).toEqual(web.splitPayment(w.totalDue, w.accruedInterest))
      }
    }
  })

  it('matches the ₹53,486.77 default worked example end to end', () => {
    const loan = { principalAmount: 50000, interestRate: 2.5, loanDate: START }
    const paid = [{ id: 'p1', date: '2026-02-10T00:00:00.000Z', amount: 15000 }]
    expect(mob.deriveLoan(loan, paid, '2026-04-11T00:00:00.000Z').totalDue).toBe(38486.77)
    expect(web.deriveLoan(loan, paid, '2026-04-11T00:00:00.000Z').totalDue).toBe(38486.77)
  })
})
