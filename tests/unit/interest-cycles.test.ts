import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CONVENTION,
  cycleAnniversary,
  deriveCycles,
  deriveLoan,
  deriveTransferCycles,
  resolveConvention,
  type InterestConvention,
  type LoanTxnLike,
} from '@/lib/interest'

/**
 * The MONTHLY INTEREST POSITION — "whose byaj is due this month, and who has fallen behind".
 *
 * oMunim shows a girvi as one running total and ages it only by "time period expired" and "one year
 * old". In a real pawn shop the customer pays the MONTHLY INTEREST and leaves the principal until
 * redemption, so the question the shop actually asks every morning is unanswerable there. deriveCycles
 * answers it — and answers it by REPLAYING deriveLoan at the cycle boundaries, never by a second
 * formula. The tie-back block below is what proves that: for five different conventions, the cycles
 * sum back to the release quote to the paise.
 *
 * Reference loan throughout: ₹50,000 · 2.5% per month · disbursed 2026-01-01 ⇒ ₹1,250 a month.
 *
 * Owners: be-lending. Independent verification: qa-finance.
 */

const LOAN = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z' }
const APR15 = '2026-04-15T00:00:00.000Z'
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const conv = (patch: Partial<InterestConvention>): InterestConvention =>
  resolveConvention({ ...DEFAULT_CONVENTION, ...patch })

describe('cycleAnniversary — the byaj due date, not "every 30 days"', () => {
  it('pledged on the 5th, due on the 5th', () => {
    expect(day(cycleAnniversary('2026-01-05T00:00:00.000Z', 1))).toBe('2026-02-05')
    expect(day(cycleAnniversary('2026-01-05T00:00:00.000Z', 3))).toBe('2026-04-05')
    // n = 0 is the loan date itself — cycle 1 opens there.
    expect(day(cycleAnniversary('2026-01-05T00:00:00.000Z', 0))).toBe('2026-01-05')
  })

  it('clamps a month-end pledge instead of rolling into the next month', () => {
    expect(day(cycleAnniversary('2026-01-31T00:00:00.000Z', 1))).toBe('2026-02-28')
    expect(day(cycleAnniversary('2026-01-31T00:00:00.000Z', 2))).toBe('2026-03-31')
    expect(day(cycleAnniversary('2026-01-31T00:00:00.000Z', 3))).toBe('2026-04-30')
  })
})

describe('a loan on which no byaj has ever been paid', () => {
  const pos = deriveCycles(LOAN, [], APR15)

  it('opens one cycle per anniversary plus the one the customer is standing in', () => {
    expect(pos.cycles).toHaveLength(4)
    expect(pos.cycles.map((c) => day(c.to))).toEqual(['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'])
    expect(pos.cycles.filter((c) => c.current)).toHaveLength(1)
    expect(pos.cycles[3].current).toBe(true)
  })

  it('charges ₹1,250 in each of the three cycles that have fallen due', () => {
    for (const c of pos.cycles.slice(0, 3)) {
      expect(c.due, `cycle ${c.no}`).toBe(true)
      expect(c.interestCharged, `cycle ${c.no}`).toBe(1250)
      expect(c.interestForCycle, `cycle ${c.no}`).toBe(1250)
      expect(c.interestPaid, `cycle ${c.no}`).toBe(0)
      expect(c.principalAfter, `cycle ${c.no}`).toBe(50000)
    }
  })

  it('shows the current cycle part-charged but projects the whole month', () => {
    const cur = pos.cycles[3]
    expect(cur.due).toBe(false)
    // 01-04 → 15-04 is 14 days: 50,000 × 2.5% × 14/30 = ₹583.33 accrued, NOT yet due.
    expect(cur.interestCharged).toBe(583.33)
    expect(cur.interestForCycle).toBe(1250) // what he is expected to hand over on 01-05
    expect(pos.thisCycleInterest).toBe(583.33)
    expect(pos.thisCycleProjected).toBe(1250)
  })

  it('reads three months behind — the current month is not dunned for', () => {
    expect(pos.overdueInterest).toBe(3750) // three due cycles, nothing recovered
    expect(pos.cyclesBehind).toBe(3)
    expect(day(pos.lastDueDate)).toBe('2026-04-01')
    expect(day(pos.nextDueDate)).toBe('2026-05-01')
    expect(pos.interestPaidToDate).toBe(0)
    expect(pos.lastPaymentDate).toBeNull()
  })
})

describe('a customer who pays his byaj on the anniversary every month', () => {
  const txns: LoanTxnLike[] = [
    { id: 'b1', date: '2026-02-01T00:00:00.000Z', amount: 1250 },
    { id: 'b2', date: '2026-03-01T00:00:00.000Z', amount: 1250 },
    { id: 'b3', date: '2026-04-01T00:00:00.000Z', amount: 1250 },
  ]
  const pos = deriveCycles(LOAN, txns, APR15)

  it('is square: no arrears, nothing behind', () => {
    expect(pos.overdueInterest).toBe(0)
    expect(pos.cyclesBehind).toBe(0)
    expect(pos.interestPaidToDate).toBe(3750)
    expect(day(pos.lastPaymentDate)).toBe('2026-04-01')
  })

  it('leaves the principal untouched — interest-first means nothing reaches it', () => {
    expect(deriveLoan(LOAN, txns, APR15).outstandingPrincipal).toBe(50000)
    for (const c of pos.cycles) expect(c.principalAfter, `cycle ${c.no}`).toBe(50000)
    for (const c of pos.cycles) expect(c.principalPaid, `cycle ${c.no}`).toBe(0)
  })

  it('credits each receipt to the cycle its date closes', () => {
    // The window is (from, to]: the payment ON the anniversary settles the cycle ending there.
    expect(pos.cycles.map((c) => c.interestPaid)).toEqual([1250, 1250, 1250, 0])
  })

  it('still shows this month running — ₹583.33 accrued, ₹1,250 due on 01-05', () => {
    expect(pos.thisCycleInterest).toBe(583.33)
    expect(pos.thisCycleProjected).toBe(1250)
  })
})

describe('a customer who paid one month and stopped', () => {
  const txns: LoanTxnLike[] = [{ id: 'b1', date: '2026-02-01T00:00:00.000Z', amount: 1250 }]
  const pos = deriveCycles(LOAN, txns, APR15)

  it('is two months behind on ₹2,500 of byaj', () => {
    expect(pos.overdueInterest).toBe(2500) // ₹3,750 charged to 01-04, ₹1,250 recovered
    expect(pos.cyclesBehind).toBe(2)
    expect(pos.cycles.map((c) => c.interestPaid)).toEqual([1250, 0, 0, 0])
    expect(day(pos.lastPaymentDate)).toBe('2026-02-01')
  })
})

/**
 * THE TIE-BACK INVARIANT — the reason this module has no formula of its own.
 *
 * For a loan with a messy real history (a part payment that eats into principal, a further advance,
 * a rebate at a later receipt), the cycles must slice the SAME interest the release quote charges,
 * under whatever convention priced the loan. If a second formula ever creeps in, one of these five
 * fails to the paise.
 */
describe('cycles tie back to deriveLoan under every convention', () => {
  const MIXED: LoanTxnLike[] = [
    { id: 't1', date: '2026-02-10T00:00:00.000Z', amount: 15000 }, // eats interest, then principal
    { id: 't2', date: '2026-05-01T00:00:00.000Z', amount: 20000, type: 'topup' }, // further advance
    { id: 't3', date: '2026-08-20T00:00:00.000Z', amount: 5000, discount: 500 }, // receipt + rebate
    { id: 't4', date: '2026-09-09T00:00:00.000Z', amount: 900, reversalOfId: 'tX' }, // reversal: ignored
  ]
  const ASOF = '2026-11-07T00:00:00.000Z'
  const CASES: [string, Partial<InterestConvention>][] = [
    ['default (calendar, pro-rata, simple)', {}],
    ['days30', { dayBasis: 'days30' }],
    ["rounding 'full'", { rounding: 'full' }],
    ['compound, yearly rests', { compound: true, restMonths: 12 }],
    [
      'ROI slab 1 (+0.5% every 3 months, recurring)',
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
    ],
  ]

  for (const [label, patch] of CASES) {
    it(`${label}: Σ interestCharged = paidInterest + accruedInterest, last principalAfter = outstanding`, () => {
      const loan = { ...LOAN, interestConvention: conv(patch) }
      const pos = deriveCycles(loan, MIXED, ASOF)
      const d = deriveLoan(loan, MIXED, ASOF)

      const summed = pos.cycles.reduce((s, c) => s + c.interestCharged, 0)
      expect(summed, label).toBeCloseTo(d.paidInterest + d.accruedInterest, 2)
      expect(pos.cycles[pos.cycles.length - 1].principalAfter, label).toBe(d.outstandingPrincipal)

      // Recoveries slice the same way: the windows partition the life of the loan.
      expect(pos.cycles.reduce((s, c) => s + c.interestPaid, 0), label).toBeCloseTo(d.paidInterest, 2)
      expect(pos.cycles.reduce((s, c) => s + c.principalPaid, 0), label).toBeCloseTo(d.paidPrincipal, 2)
      expect(pos.interestPaidToDate, label).toBe(d.paidInterest)

      // 01-01-2026 → 07-11-2026 is 10 anniversaries plus the cycle he is standing in.
      expect(pos.cycles, label).toHaveLength(11)
      expect(day(pos.nextDueDate), label).toBe('2026-12-01')
      expect(pos.cycles.filter((c) => c.current), label).toHaveLength(1)
      // The topup and the reversal are not receipts; the rebated receipt is.
      expect(day(pos.lastPaymentDate), label).toBe('2026-08-20')
    })
  }

  it('a closed cycle never differs from its own projection', () => {
    for (const [label, patch] of CASES) {
      const pos = deriveCycles({ ...LOAN, interestConvention: conv(patch) }, MIXED, ASOF)
      for (const c of pos.cycles.filter((x) => x.due)) {
        expect(c.interestForCycle, `${label} cycle ${c.no}`).toBe(c.interestCharged)
      }
    }
  })
})

describe('a month-end pledge falls due at month end', () => {
  it('31 Jan is due 28 Feb and 31 Mar, never 3 March', () => {
    const pos = deriveCycles({ ...LOAN, loanDate: '2026-01-31T00:00:00.000Z' }, [], '2026-04-01T00:00:00.000Z')
    expect(pos.cycles.map((c) => day(c.to))).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
    expect(day(pos.lastDueDate)).toBe('2026-03-31')
    expect(day(pos.nextDueDate)).toBe('2026-04-30')
    expect(pos.cyclesBehind).toBe(2)
  })
})

describe('it never throws, whatever the table hands it', () => {
  it('asOf before the loan date: nothing due, nothing behind, the first cycle still projected', () => {
    const pos = deriveCycles(LOAN, [], '2025-12-01T00:00:00.000Z')
    expect(pos.cycles).toHaveLength(1)
    expect(pos.lastDueDate).toBeNull()
    expect(day(pos.nextDueDate)).toBe('2026-02-01')
    expect(pos.overdueInterest).toBe(0)
    expect(pos.cyclesBehind).toBe(0)
    expect(pos.thisCycleInterest).toBe(0)
    expect(pos.thisCycleProjected).toBe(1250)
    expect(pos.cycles[0].due).toBe(false)
    expect(pos.cycles[0].current).toBe(false)
  })

  it('a loan repaid in full mid-way stops charging and shows square', () => {
    // ₹1,625 interest to day 40 (1 month + 9 days) + ₹50,000 principal.
    const txns: LoanTxnLike[] = [{ id: 'r1', date: '2026-02-10T00:00:00.000Z', amount: 51625 }]
    const pos = deriveCycles(LOAN, txns, '2026-06-15T00:00:00.000Z')
    expect(pos.overdueInterest).toBe(0)
    expect(pos.cyclesBehind).toBe(0)
    expect(pos.interestPaidToDate).toBe(1625)
    expect(pos.thisCycleInterest).toBe(0)
    expect(pos.thisCycleProjected).toBe(0)
    expect(pos.cycles[pos.cycles.length - 1].principalAfter).toBe(0)
    expect(pos.cycles.reduce((s, c) => s + c.interestCharged, 0)).toBeCloseTo(1625, 2)
  })

  it('a zero-rate loan is never behind', () => {
    const pos = deriveCycles({ ...LOAN, interestRate: 0 }, [], APR15)
    expect(pos.cycles).toHaveLength(4)
    expect(pos.overdueInterest).toBe(0)
    expect(pos.cyclesBehind).toBe(0)
    expect(pos.thisCycleProjected).toBe(0)
    expect(pos.cycles.every((c) => c.interestForCycle === 0)).toBe(true)
  })

  it('a loan with no transactions and a far-future asOf stays bounded', () => {
    const pos = deriveCycles({ ...LOAN, loanDate: '1970-01-01T00:00:00.000Z' }, [], '2999-01-01T00:00:00.000Z')
    expect(pos.cycles.length).toBeLessThanOrEqual(1201) // CYCLE_GUARD + the current cycle
    expect(pos.cyclesBehind).toBeGreaterThan(0)
  })

  it('an empty loan basis does not explode', () => {
    expect(() => deriveCycles({ principalAmount: 0, loanDate: '2026-01-01T00:00:00.000Z' }, [], APR15)).not.toThrow()
  })
})

describe('the loan keeps its own frozen convention', () => {
  it('firstMonthFull charges the whole first month three days in', () => {
    const loan = { ...LOAN, interestConvention: conv({ firstMonthFull: true }) }
    const pos = deriveCycles(loan, [], '2026-01-04T00:00:00.000Z')
    expect(pos.cycles).toHaveLength(1)
    // The projection is a full month, and under this convention so is the charge already standing —
    // that is the point of FIRST MONTH FULL INT. and it is the loan's own stored rule, not a setting.
    expect(pos.cycles[0].interestForCycle).toBe(1250)
    expect(pos.thisCycleInterest).toBe(1250)
    // The default convention on the same three days charges 3/30 of a month.
    expect(deriveCycles(LOAN, [], '2026-01-04T00:00:00.000Z').thisCycleInterest).toBe(125)
  })

  it('the financier leg is a separate position — customer receipts do not appear on it', () => {
    const txns: LoanTxnLike[] = [
      { id: 'c1', date: '2026-02-01T00:00:00.000Z', amount: 1250, stream: 'in' },
      { id: 'f1', date: '2026-03-01T00:00:00.000Z', amount: 700, stream: 'out' },
    ]
    const out = deriveCycles({ principalAmount: 35000, interestRate: 1.5, loanDate: LOAN.loanDate }, txns, APR15, 'out')
    expect(day(out.lastPaymentDate)).toBe('2026-03-01')
    expect(out.interestPaidToDate).toBe(700) // the customer's ₹1,250 is not on this leg
    const inLeg = deriveCycles(LOAN, txns, APR15)
    expect(inLeg.interestPaidToDate).toBe(1250)
  })
})

/**
 * REGRESSION — a transaction dated BEFORE the loan date (audit defect 2).
 *
 * The replay cursor used to be set to the transaction's date unconditionally, so a receipt keyed
 * two months before disbursal anchored every later segment before the loan existed and charged
 * phantom months. Hand-check: Rs 1,00,000 at 2%/mo disbursed 2026-03-01, Rs 500 received (mis-dated
 * 2026-01-01) reduces the principal to Rs 99,500 with no interest yet standing to absorb it; from
 * 2026-03-01 to 2026-04-01 is exactly one calendar month, so
 *     99,500 x 2% x 1 = Rs 1,990.
 * The old figure was 99,500 x 2% x 3 = Rs 5,970, three months on a one-month-old loan.
 */
describe('a transaction dated before the loan date cannot move the interest clock', () => {
  const PRE = { principalAmount: 100000, interestRate: 2, loanDate: '2026-03-01T00:00:00.000Z' }
  const EARLY: LoanTxnLike[] = [{ id: 'p1', date: '2026-01-01T00:00:00.000Z', amount: 500 }]

  it('charges one month, not three, and still banks the money', () => {
    const d = deriveLoan(PRE, EARLY, '2026-04-01T00:00:00.000Z')
    expect(d.outstandingPrincipal).toBe(99500) // the receipt is KEPT — the cash was received
    expect(d.totalPaid).toBe(500)
    expect(d.paidPrincipal).toBe(500)
    expect(d.paidInterest).toBe(0) // nothing had accrued before the loan existed to apply it to
    expect(d.accruedInterest).toBe(1990) // 99,500 x 2% x 1 month, not x 3
    expect(d.totalDue).toBe(101490)
    // The clock runs from disbursal, never from the mis-dated row.
    expect(day(d.interestFrom)).toBe('2026-03-01')
    expect(d.monthsSinceLastEvent).toBe(1)
  })

  it('arrears now agree with the sum of the due cycles', () => {
    const pos = deriveCycles(PRE, EARLY, '2026-04-01T00:00:00.000Z')
    const due = pos.cycles.filter((c) => c.due)
    expect(due).toHaveLength(1)
    expect(due[0].interestForCycle).toBe(1990)
    expect(pos.overdueInterest).toBe(1990)
    expect(pos.overdueInterest).toBe(due.reduce((sum, c) => sum + c.interestForCycle, 0))
    expect(pos.cyclesBehind).toBe(1)
  })

  it('graceDays still runs from the loan date, not from the early receipt', () => {
    const g = { ...PRE, interestConvention: conv({ graceDays: 10 }) }
    // Five days after disbursal — inside the window, so no interest at all.
    expect(deriveLoan(g, EARLY, '2026-03-06T00:00:00.000Z').accruedInterest).toBe(0)
    expect(deriveLoan(g, EARLY, '2026-03-06T00:00:00.000Z').outstandingPrincipal).toBe(99500)
    // Fifteen days — past the window, and the interest then runs from day 0: 99,500 x 2% x 15/30.
    expect(deriveLoan(g, EARLY, '2026-03-16T00:00:00.000Z').accruedInterest).toBe(995)
  })

  it('firstMonthFull still applies from the loan date after the clamp', () => {
    const f = { ...PRE, interestConvention: conv({ firstMonthFull: true }) }
    // Five days in, charged as a whole month: 99,500 x 2% x 1.
    expect(deriveLoan(f, EARLY, '2026-03-06T00:00:00.000Z').accruedInterest).toBe(1990)
    // And without the flag, five days is five days.
    expect(deriveLoan(PRE, EARLY, '2026-03-06T00:00:00.000Z').accruedInterest).toBe(331.67)
  })
})

/**
 * deriveTransferCycles — the financier leg's monthly position (audit defect 1).
 *
 * deriveCycles(loan, txns, asOf, 'out') on a raw Loan record reads the right ROWS but the wrong
 * BASIS: the customer's principal, rate and date. This wrapper is to deriveCycles what
 * deriveTransfer() is to deriveLoan(), and is the only call site that should ever pass 'out'.
 */
describe('deriveTransferCycles — the financier leg gets its own cycles', () => {
  const REPLEDGED = {
    ...LOAN, // customer: Rs 50,000 @ 2.5%/mo from 2026-01-01
    transferPrincipal: 35000,
    transferRate: 1.5,
    transferDate: '2026-01-01T00:00:00.000Z',
  }
  const TXNS: LoanTxnLike[] = [
    { id: 'c1', date: '2026-02-01T00:00:00.000Z', amount: 1250, stream: 'in' },
    { id: 'f1', date: '2026-03-01T00:00:00.000Z', amount: 700, stream: 'out' },
  ]

  it('is null for a pledge that was never re-pledged', () => {
    expect(deriveTransferCycles({}, TXNS, APR15)).toBeNull()
    expect(deriveTransferCycles({ transferDate: '2026-01-01T00:00:00.000Z' }, TXNS, APR15)).toBeNull()
    expect(deriveTransferCycles({ transferPrincipal: 35000 }, TXNS, APR15)).toBeNull()
  })

  it('prices off transferPrincipal / transferRate / transferDate, not the customer leg', () => {
    const f = deriveTransferCycles(REPLEDGED, TXNS, APR15)!
    // 35,000 x 1.5% = Rs 525 a month — NOT the customer's 50,000 x 2.5% = Rs 1,250.
    expect(f.cycles[0].interestForCycle).toBe(525)
    expect(f.thisCycleProjected).toBe(525)
    expect(f.interestPaidToDate).toBe(700)
    expect(day(f.lastPaymentDate)).toBe('2026-03-01')
    // Charged to the last due date 2026-04-01: three months x 525 = 1,575, less 700 recovered.
    expect(f.overdueInterest).toBe(875)
    // The naked call following deriveTransfer's precedent would have quoted the customer's number.
    expect(deriveCycles(LOAN, TXNS, APR15).cycles[0].interestForCycle).toBe(1250)
  })

  it('a customer-leg receipt cannot move the financier leg, and vice versa', () => {
    const f = deriveTransferCycles(REPLEDGED, TXNS, APR15)!
    const c = deriveCycles(REPLEDGED, TXNS, APR15)
    expect(c.overdueInterest).toBe(2500) // 1,250 x 3 charged to 04-01, less the 1,250 received

    const extraIn: LoanTxnLike[] = [...TXNS, { id: 'c2', date: '2026-03-15T00:00:00.000Z', amount: 5000, stream: 'in' }]
    expect(deriveTransferCycles(REPLEDGED, extraIn, APR15)!.overdueInterest).toBe(f.overdueInterest)
    expect(deriveTransferCycles(REPLEDGED, extraIn, APR15)!.interestPaidToDate).toBe(700)

    const extraOut: LoanTxnLike[] = [...TXNS, { id: 'f2', date: '2026-03-15T00:00:00.000Z', amount: 5000, stream: 'out' }]
    expect(deriveCycles(REPLEDGED, extraOut, APR15).overdueInterest).toBe(c.overdueInterest)
    expect(deriveCycles(REPLEDGED, extraOut, APR15).interestPaidToDate).toBe(1250)
  })
})
