import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CONVENTION,
  cycleAnniversary,
  deriveCycles,
  deriveLoan,
  resolveConvention,
  type InterestConvention,
  type LoanTxnLike,
} from '@/lib/interest'

/**
 * INDEPENDENT AUDIT of deriveCycles — a second set of eyes on src/lib/interest.ts.
 *
 * Rules followed throughout:
 *  - Every loan/date combination here is DIFFERENT from tests/unit/interest-cycles.test.ts (own
 *    worked examples, not a re-run of the author's).
 *  - Every assertion is hand-computed on paper in the comment directly above it; nothing here
 *    recomputes the expression under test.
 *  - Defects found during this audit are NOT encoded as passing tests here (that would document a
 *    bug as intended behaviour). They are reported to the caller instead, with exact repro.
 *
 * Owner: be-lending. Independent verification performed by: qa-finance (this file).
 */

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const conv = (patch: Partial<InterestConvention>): InterestConvention =>
  resolveConvention({ ...DEFAULT_CONVENTION, ...patch })

describe('worked example A — ₹1,20,000 at 3%/month, disbursed 15 Mar, no payments', () => {
  // Anniversaries: 15-Apr, 15-May, 15-Jun, 15-Jul, 15-Aug. asOf = 20-Jul: 4 anniversaries have
  // passed (Apr/May/Jun/Jul), the 5th cycle (15-Jul -> 15-Aug) is current, 5 days deep.
  const LOAN = { principalAmount: 120000, interestRate: 3, loanDate: '2026-03-15T00:00:00.000Z' }
  const pos = deriveCycles(LOAN, [], '2026-07-20T00:00:00.000Z')

  it('opens 4 due cycles + the current one, ₹3,600 = 1,20,000 × 3% each full month', () => {
    expect(pos.cycles).toHaveLength(5)
    expect(pos.cycles.map((c) => day(c.to))).toEqual([
      '2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15', '2026-08-15',
    ])
    for (const c of pos.cycles.slice(0, 4)) {
      expect(c.due, `cycle ${c.no}`).toBe(true)
      expect(c.interestCharged, `cycle ${c.no}`).toBe(3600)
    }
  })

  it('current cycle: 5 days of 30 into the month = 1,20,000 × 3% × 5/30 = ₹600.00', () => {
    const cur = pos.cycles[4]
    expect(cur.due).toBe(false)
    expect(cur.current).toBe(true)
    expect(cur.interestCharged).toBe(600)
    expect(cur.interestForCycle).toBe(3600) // projected whole month
    expect(pos.thisCycleInterest).toBe(600)
    expect(pos.thisCycleProjected).toBe(3600)
  })

  it('4 months behind, nothing recovered: overdue = 4 × 3,600 = ₹14,400', () => {
    expect(pos.overdueInterest).toBe(14400)
    expect(pos.cyclesBehind).toBe(4)
    expect(day(pos.lastDueDate)).toBe('2026-07-15')
  })
})

describe('worked example B — two receipts landing on the SAME day', () => {
  // Same loan as A. Two ₹3,600 receipts both dated 15-Jun (the anniversary closing cycle 3).
  // Cycle 3 (15-May -> 15-Jun) must show BOTH receipts, not just one — 2 × 3,600 = ₹7,200.
  const LOAN = { principalAmount: 120000, interestRate: 3, loanDate: '2026-03-15T00:00:00.000Z' }
  const txns: LoanTxnLike[] = [
    { id: 'p1', date: '2026-06-15T00:00:00.000Z', amount: 3600 },
    { id: 'p2', date: '2026-06-15T00:00:00.000Z', amount: 3600 },
  ]
  const pos = deriveCycles(LOAN, txns, '2026-07-20T00:00:00.000Z')

  it('both same-day receipts land in the cycle they close, summed, no double count and no drop', () => {
    expect(pos.cycles[2].interestPaid).toBe(7200) // cycle 3, ends 15-Jun
    expect(pos.cycles.reduce((s, c) => s + c.interestPaid, 0)).toBe(7200)
    expect(pos.interestPaidToDate).toBe(7200)
  })

  it('4 months charged (14,400) less 7,200 recovered = ₹7,200 overdue, 2 whole cycles behind', () => {
    // Charged to last due date (15-Jul) = 4 × 3,600 = 14,400. Recovered to date = 7,200.
    // Eating arrears newest-first: cycle4 (3,600) then cycle3 (3,600) = 7,200 exactly -> 2 behind.
    expect(pos.overdueInterest).toBe(7200)
    expect(pos.cyclesBehind).toBe(2)
  })
})

describe('worked example C — the (from, to] boundary, hand-verified both sides', () => {
  const LOAN = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z' }

  it('a receipt dated EXACTLY on the anniversary settles the CLOSING cycle, not the opening one', () => {
    // ₹1,250 paid 2026-02-01, asOf = 2026-02-01 (the anniversary itself).
    const pos = deriveCycles(LOAN, [{ id: 'x1', date: '2026-02-01T00:00:00.000Z', amount: 1250 }], '2026-02-01T00:00:00.000Z')
    expect(pos.cycles[0].interestPaid).toBe(1250) // cycle 1 (…, 2026-02-01]
    expect(pos.cycles[1].interestPaid).toBe(0) // cycle 2 opens AT 2026-02-01, gets nothing
    expect(pos.overdueInterest).toBe(0)
    expect(pos.cyclesBehind).toBe(0)
  })

  it('one day late: behind AT the anniversary, square the very next day once paid', () => {
    const txns: LoanTxnLike[] = [{ id: 'x1', date: '2026-02-02T00:00:00.000Z', amount: 1250 }]
    // At the anniversary itself (2026-02-01), the payment has not happened yet: 1 whole cycle behind.
    const atAnniversary = deriveCycles(LOAN, txns, '2026-02-01T00:00:00.000Z')
    expect(atAnniversary.overdueInterest).toBe(1250)
    expect(atAnniversary.cyclesBehind).toBe(1)
    // The day the payment lands (2026-02-02): fully recovered, square. Current cycle has accrued
    // exactly 1 day of the new month: 50,000 × 2.5% × 1/30 = ₹41.666… → ₹41.67.
    const dayAfter = deriveCycles(LOAN, txns, '2026-02-02T00:00:00.000Z')
    expect(dayAfter.overdueInterest).toBe(0)
    expect(dayAfter.cyclesBehind).toBe(0)
    expect(dayAfter.thisCycleInterest).toBe(41.67)
  })
})

describe('worked example D — a topup dated exactly on an anniversary matches the module’s own worked example', () => {
  // This reproduces the header's worked example (₹50,000 @ 2.5%, ₹20,000 topped up 01-Feb) but
  // proves it through deriveCycles's cycle-level figures, independently, rather than trusting the
  // prose: Jan accrues on 50,000 (₹1,250), Feb accrues on 70,000 (₹1,750).
  const LOAN = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z' }
  const txns: LoanTxnLike[] = [{ id: 't1', date: '2026-02-01T00:00:00.000Z', amount: 20000, type: 'topup' }]
  const pos = deriveCycles(LOAN, txns, '2026-03-01T00:00:00.000Z')

  it('cycle 1 (Jan) is unaffected by a topup that lands on its own closing anniversary', () => {
    expect(pos.cycles[0].interestCharged).toBe(1250) // 50,000 × 2.5% × 1
    expect(pos.cycles[0].principalAfter).toBe(70000) // topup applied AT the boundary itself
  })

  it('cycle 2 (Feb) accrues on the raised balance from day 1: 70,000 × 2.5% = ₹1,750', () => {
    expect(pos.cycles[1].interestCharged).toBe(1750)
    expect(pos.cycles[1].principalAfter).toBe(70000)
  })

  it('a topup is not a receipt: it never appears as lastPaymentDate and never reduces arrears', () => {
    expect(pos.lastPaymentDate).toBeNull()
  })
})

describe('worked example E — a receipt that overpays the whole loan clamps at zero, never negative', () => {
  const LOAN = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z' }
  // ₹9,99,999 paid on 2026-02-10. Interest to that date: 1 month (Jan) + 9 days of Feb
  //   = 50,000 × 2.5% × (1 + 9/30) = 50,000 × 2.5% × 1.3 = ₹1,625.
  // That clears all interest (₹1,625) and every rupee of principal (₹50,000); nothing more exists
  // to charge or to be behind on for the rest of the loan's life.
  const txns: LoanTxnLike[] = [{ id: 'o1', date: '2026-02-10T00:00:00.000Z', amount: 999999 }]
  const pos = deriveCycles(LOAN, txns, '2026-06-01T00:00:00.000Z')

  it('every cycle after the payoff shows zero interest and zero principal, never negative', () => {
    for (const c of pos.cycles) {
      expect(c.principalAfter, `cycle ${c.no}`).toBeGreaterThanOrEqual(0)
      expect(c.interestCharged, `cycle ${c.no}`).toBeGreaterThanOrEqual(0)
    }
    expect(pos.cycles[pos.cycles.length - 1].principalAfter).toBe(0)
    expect(pos.overdueInterest).toBe(0)
    expect(pos.cyclesBehind).toBe(0)
    expect(pos.interestPaidToDate).toBe(1625)
  })
})

describe('worked example F — a reversal pair cancels the receipt entirely', () => {
  const LOAN = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z' }
  const txns: LoanTxnLike[] = [
    { id: 'r1', date: '2026-02-01T00:00:00.000Z', amount: 1250 },
    { id: 'r2', date: '2026-02-05T00:00:00.000Z', amount: 1250, reversalOfId: 'r1' },
  ]
  const pos = deriveCycles(LOAN, txns, '2026-03-01T00:00:00.000Z')

  it('behaves exactly as if the receipt never happened: 2 due cycles, both fully unpaid', () => {
    // Cycle1 + Cycle2 = 1,250 + 1,250 = 2,500 charged and due, nothing recovered.
    expect(pos.overdueInterest).toBe(2500)
    expect(pos.cyclesBehind).toBe(2)
    expect(pos.interestPaidToDate).toBe(0)
    expect(pos.lastPaymentDate).toBeNull()
    expect(pos.cycles[0].interestPaid).toBe(0)
    expect(pos.cycles[1].interestPaid).toBe(0)
  })
})

describe('the telescoping invariant, pushed at scale — rounding drift measurement', () => {
  it('123 monthly cycles (10+ years, an awkward repeating-decimal rate): Σ(rounded cycles) ties to the single-shot rounded total to the paise', () => {
    // ₹77,777.77 at 1/3 % per month (0.3333…%), disbursed 2020-01-01, asOf 2030-03-17.
    const LOAN = { principalAmount: 77777.77, interestRate: 1 / 3, loanDate: '2020-01-01T00:00:00.000Z' }
    const asOf = '2030-03-17T00:00:00.000Z'
    const pos = deriveCycles(LOAN, [], asOf)
    const d = deriveLoan(LOAN, [], asOf)
    expect(pos.cycles.length).toBe(123)
    const summed = pos.cycles.reduce((s, c) => s + Math.round(c.interestCharged * 100), 0) / 100
    // Measured: 0 paise of drift over 123 independently-rounded cycles.
    expect(summed).toBe(round2total(d.accruedInterest + d.paidInterest))
    function round2total(n: number) { return Math.round(n * 100) / 100 }
  })

  it('43 cycles with 40 irregular ₹263.17 payments: paid-interest sum also ties to the paise', () => {
    const LOAN = { principalAmount: 12345.67, interestRate: 2.13, loanDate: '2021-06-15T00:00:00.000Z' }
    const txns: LoanTxnLike[] = []
    for (let i = 1; i <= 40; i++) {
      txns.push({ id: 'p' + i, date: new Date(Date.UTC(2021, 5 + i, 15)).toISOString(), amount: 263.17 })
    }
    const asOf = '2025-01-01T00:00:00.000Z'
    const pos = deriveCycles(LOAN, txns, asOf)
    const d = deriveLoan(LOAN, txns, asOf)
    const summedPaid = Math.round(pos.cycles.reduce((s, c) => s + c.interestPaid, 0) * 100) / 100
    const summedCharged = Math.round(pos.cycles.reduce((s, c) => s + c.interestCharged, 0) * 100) / 100
    expect(summedPaid).toBe(d.paidInterest)
    expect(summedCharged).toBe(Math.round((d.accruedInterest + d.paidInterest) * 100) / 100)
  })
})

describe('convention respect — the loan\'s own frozen rule prices the cycle, hand-verified', () => {
  it("rounding: 'half' — 15 leftover days cost half a month, 16 cost a whole one (the exact doc boundary)", () => {
    const LOAN = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z', interestConvention: conv({ rounding: 'half' }) }
    // Anniversary 2026-02-01. 15 days later = 2026-02-16: half a month = 50,000×2.5%×0.5 = ₹625.
    expect(deriveCycles(LOAN, [], '2026-02-16T00:00:00.000Z').thisCycleInterest).toBe(625)
    // 16 days later = 2026-02-17: a FULL month = ₹1,250, not a pro-rated 16/30.
    expect(deriveCycles(LOAN, [], '2026-02-17T00:00:00.000Z').thisCycleInterest).toBe(1250)
  })

  it('graceDays: 15 — redeemed on day 10 owes ₹0; redeemed on day 20 is charged from day 0, not from day 15', () => {
    const LOAN = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z', interestConvention: conv({ graceDays: 15 }) }
    const inside = deriveCycles(LOAN, [], '2026-01-10T00:00:00.000Z')
    expect(inside.thisCycleInterest).toBe(0)
    expect(inside.overdueInterest).toBe(0)
    const outside = deriveCycles(LOAN, [], '2026-01-20T00:00:00.000Z')
    // 19 days elapsed, charged from day 0 (not day 15): 50,000 × 2.5% × 19/30 = ₹791.666… → ₹791.67.
    expect(outside.thisCycleInterest).toBe(791.67)
  })

  it("rateBasis: 'annual' — 30%/yr divided by 12 prices identically to a 2.5%/month loan", () => {
    const annual = { principalAmount: 50000, interestRate: 30, loanDate: '2026-01-01T00:00:00.000Z', interestConvention: conv({ rateBasis: 'annual' }) }
    const monthly = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z' }
    const asOf = '2026-02-01T00:00:00.000Z'
    expect(deriveCycles(annual, [], asOf).cycles[0].interestCharged).toBe(deriveCycles(monthly, [], asOf).cycles[0].interestCharged)
    expect(deriveCycles(annual, [], asOf).cycles[0].interestCharged).toBe(1250)
  })

  it('firstMonthFull does NOT leak into a segment restarted by an early part-payment', () => {
    // Loan 9 days old (2026-01-10) — under firstMonthFull the segment from disbursal is forced
    // UP to a full month: 50,000 × 2.5% × 1 = ₹1,250, despite only 9 elapsed days. A receipt of
    // exactly ₹1,250 that day therefore clears interest with nothing left for principal, and
    // restarts the clock AT 2026-01-10 — a restart, per the doc, is not "starting at disbursal",
    // so firstMonthFull must NOT force the next (restarted) segment to a full month too.
    const fmf = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z', interestConvention: conv({ firstMonthFull: true }) }
    const txns: LoanTxnLike[] = [{ id: 'p1', date: '2026-01-10T00:00:00.000Z', amount: 1250 }]
    // asOf pinned exactly at the restart: thisCycleInterest so far = the forced full first month,
    // now fully paid off (still within cycle 1, since no anniversary has passed yet).
    const atRestart = deriveCycles(fmf, txns, '2026-01-10T00:00:00.000Z')
    expect(atRestart.thisCycleInterest).toBe(1250)
    expect(atRestart.overdueInterest).toBe(0) // paid the instant it was charged
    // 5 days further into the SAME cycle: if firstMonthFull leaked, this would jump to another
    // forced full month (2,500 total). It must instead be the plain 5-day pro-rata on top:
    // 50,000 × 2.5% × 5/30 = ₹208.333… → ₹208.33, i.e. 1,250 + 208.33 = ₹1,458.33 cumulative.
    const fiveDaysLater = deriveCycles(fmf, txns, '2026-01-15T00:00:00.000Z')
    expect(fiveDaysLater.thisCycleInterest).toBe(1458.33)
    expect(fiveDaysLater.thisCycleInterest - atRestart.thisCycleInterest).toBeCloseTo(208.33, 2)
  })
})

describe('the financier leg — isolation proven when the transfer basis is correctly assembled', () => {
  // Loan: customer owes 50,000 @ 2.5%/mo. Financier leg: we owe 35,000 @ 1.5%/mo, same start date.
  // A customer receipt of ₹5,000 and a financier repayment of ₹5,000, BOTH dated 2026-02-01 (the
  // first anniversary of both legs, since they share a start date).
  const loan = {
    principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z',
    transferPrincipal: 35000, transferRate: 1.5, transferDate: '2026-01-01T00:00:00.000Z',
  }
  const txns: LoanTxnLike[] = [
    { id: 'c1', date: '2026-02-01T00:00:00.000Z', amount: 5000, stream: 'in' },
    { id: 'f1', date: '2026-02-01T00:00:00.000Z', amount: 5000, stream: 'out' },
  ]
  const asOf = '2026-03-01T00:00:00.000Z'
  const customer = deriveCycles(loan, txns, asOf, 'in')
  // The financier leg must be assembled from the loan's OWN transfer* columns, mirroring exactly
  // what deriveTransfer() does for deriveLoan() — see the defect reported separately: deriveCycles
  // has no such helper, so a caller must reshape the basis itself, as done here.
  const financier = deriveCycles(
    { principalAmount: loan.transferPrincipal, interestRate: loan.transferRate, loanDate: loan.transferDate },
    txns, asOf, 'out',
  )

  it('cycle 1: customer owes 50,000×2.5%=1,250; financier owes 35,000×1.5%=525 — two different numbers', () => {
    expect(customer.cycles[0].interestCharged).toBe(1250)
    expect(financier.cycles[0].interestCharged).toBe(525)
  })

  it('the customer’s ₹5,000 receipt cannot pay down the financier’s arrears, and vice versa', () => {
    // The receipt lands EXACTLY on the anniversary (2026-02-01), so — per the (from,to] boundary —
    // it settles cycle 1, not cycle 2. Customer: cycle-1 interest 1,250 fully cleared by the 5,000,
    // remaining 3,750 -> principal (46,250 left). Cycle 2 then runs a FULL new month on the reduced
    // balance to asOf=03-01: 46,250 × 2.5% = ₹1,156.25, entirely unpaid -> that IS the arrears.
    expect(customer.interestPaidToDate).toBe(1250)
    expect(customer.overdueInterest).toBe(1156.25)
    expect(customer.cyclesBehind).toBe(1)
    // Financier: cycle-1 interest 525 cleared by the 5,000, remaining 4,475 -> principal (30,525
    // left). Cycle 2 runs a full month on ITS OWN reduced balance: 30,525 × 1.5% = ₹457.875 → 457.88.
    expect(financier.interestPaidToDate).toBe(525)
    expect(financier.overdueInterest).toBe(457.88)
    expect(financier.cyclesBehind).toBe(1)
    // The two arrears figures are NOT equal — if the engine ever mixed streams (e.g. priced the
    // financier leg off the customer's principal/rate), both would read identically. They must
    // stay their own two numbers, each derived from its own principal and its own rate.
    expect(customer.overdueInterest).not.toBe(financier.overdueInterest)
    expect(customer.interestPaidToDate).not.toBe(financier.interestPaidToDate)
  })
})

describe('totality — never throws, never NaN, on garbage the table can hand it', () => {
  const finite = (n: number) => expect(Number.isFinite(n)).toBe(true)

  it('asOf before the loan date', () => {
    const pos = deriveCycles({ principalAmount: 40000, interestRate: 2, loanDate: '2026-06-01' }, [], '2020-01-01')
    finite(pos.overdueInterest); finite(pos.cyclesBehind); finite(pos.thisCycleInterest); finite(pos.thisCycleProjected)
    expect(pos.lastDueDate).toBeNull()
    expect(pos.overdueInterest).toBe(0)
  })

  it('loan date in the future relative to asOf', () => {
    const pos = deriveCycles({ principalAmount: 40000, interestRate: 2, loanDate: '2030-06-01' }, [], '2026-01-01')
    finite(pos.overdueInterest); finite(pos.thisCycleProjected)
    expect(pos.overdueInterest).toBe(0)
  })

  it('interestRate null, 0, and negative all stay finite (never throw, never NaN)', () => {
    for (const interestRate of [null, 0, -7]) {
      const pos = deriveCycles({ principalAmount: 40000, interestRate, loanDate: '2026-01-01' }, [], '2026-06-01')
      finite(pos.overdueInterest); finite(pos.cyclesBehind); finite(pos.thisCycleInterest); finite(pos.thisCycleProjected)
    }
  })

  it('principalAmount 0, empty txns', () => {
    const pos = deriveCycles({ principalAmount: 0, interestRate: 2.5, loanDate: '2026-01-01' }, [], '2026-06-01')
    expect(pos.overdueInterest).toBe(0)
    expect(() => deriveCycles({ principalAmount: 0, loanDate: '2026-01-01' }, [], '2026-06-01')).not.toThrow()
  })

  it('a txn with a NaN amount is treated as zero, not propagated', () => {
    const pos = deriveCycles(
      { principalAmount: 40000, interestRate: 2, loanDate: '2026-01-01' },
      [{ id: 'n1', date: '2026-02-01', amount: NaN }], '2026-06-01',
    )
    finite(pos.overdueInterest); finite(pos.interestPaidToDate)
    expect(pos.interestPaidToDate).toBe(0) // NaN amount never actually paid anything
  })

  it('a txn with an unparseable date is dropped from the replay, not propagated', () => {
    const withGarbage = deriveCycles(
      { principalAmount: 40000, interestRate: 2, loanDate: '2026-01-01' },
      [{ id: 'n2', date: 'not-a-date', amount: 100 }], '2026-06-01',
    )
    const withoutIt = deriveCycles({ principalAmount: 40000, interestRate: 2, loanDate: '2026-01-01' }, [], '2026-06-01')
    expect(withGarbage.overdueInterest).toBe(withoutIt.overdueInterest)
  })

  it('a loan 100 years old stays bounded by CYCLE_GUARD, never runs away', () => {
    const pos = deriveCycles({ principalAmount: 40000, interestRate: 2, loanDate: '1926-01-01' }, [], '2026-06-01')
    expect(pos.cycles.length).toBeLessThanOrEqual(1201)
    finite(pos.overdueInterest); finite(pos.cyclesBehind)
  })
})

describe('cycleAnniversary — independent hand check on a different date grid', () => {
  it('pledged 10th of the month, month-end clamp on the 31st', () => {
    expect(day(cycleAnniversary('2026-05-10T00:00:00.000Z', 1))).toBe('2026-06-10')
    expect(day(cycleAnniversary('2026-05-31T00:00:00.000Z', 1))).toBe('2026-06-30') // June has 30 days
    expect(day(cycleAnniversary('2026-05-31T00:00:00.000Z', 9))).toBe('2027-02-28') // Feb 2027, not a leap year
  })
})
