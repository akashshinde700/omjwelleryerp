import { describe, it, expect } from 'vitest'
import { deriveCycles, deriveLoan, type LoanTxnLike } from '@/lib/interest'

/**
 * BYAJ STILL DUE THIS CYCLE — the A101 double-collection defect.
 *
 * The loan list's "This month's byaj" column read thisCycleProjected: the GROSS interest of the
 * current cycle. A part payment made INSIDE the cycle had already paid part of that, so the list told
 * the clerk to collect money the customer had already handed over. thisCycleDue nets it off.
 *
 * Rule (src/lib/interest.ts, LoanMonthlyPosition.thisCycleDue):
 *     thisCycleDue = max(0, charged(nextDue) − max(charged(cycleStart), paidToDate))
 * Receipts are interest-first across the whole loan, so they clear arrears up to the cycle start
 * before any of them counts towards the current cycle.
 *
 * Every figure below is hand-worked in the comment above it; none recomputes the expression.
 * Default convention: calendar months, pro-rata remainder days / 30, simple interest.
 */

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

describe('A101 — ₹50,000 at 1.5%/mo from 09 Sep 2026, ₹5,000 part payment on 24 Oct 2026 (IST)', () => {
  // As the live row holds it: the loan stamped 09 Sep 14:00 IST (08:30Z), the payment dated
  // 24 Oct 00:00 IST (23 Oct 18:30Z). Remainder days are whole days, so 09 Oct 08:30Z → 23 Oct
  // 18:30Z is 14 days (14.4 floored) — the "1 month + 14 days" of the live walk.
  const LOAN = { principalAmount: 50000, interestRate: 1.5, loanDate: '2026-09-09T08:30:00.000Z' }
  const TXNS: LoanTxnLike[] = [{ id: 'p1', date: '2026-10-23T18:30:00.000Z', amount: 5000 }]
  const AS_OF = '2026-10-24T06:30:00.000Z' // 24 Oct 12:00 IST

  it('the payment splits ₹1,100 interest + ₹3,900 principal, leaving ₹46,100 and ₹0 interest', () => {
    // 50,000 × 1.5% = ₹750/month. 1 month + 14/30 = 750 + 350 = ₹1,100. 5,000 − 1,100 = 3,900.
    const q = deriveLoan(LOAN, TXNS, AS_OF)
    expect(q.paidInterest).toBe(1100)
    expect(q.paidPrincipal).toBe(3900)
    expect(q.outstandingPrincipal).toBe(46100)
    expect(q.accruedInterest).toBe(0) // the detail screen's "Simple Interest ₹0"
    expect(q.totalDue).toBe(46100)
  })

  const pos = deriveCycles(LOAN, TXNS, AS_OF)

  it('sits in cycle 2 (09 Oct → 09 Nov), not behind', () => {
    expect(pos.cycles).toHaveLength(2)
    expect(day(pos.lastDueDate)).toBe('2026-10-09')
    expect(day(pos.nextDueDate)).toBe('2026-11-09')
    // charged(09 Oct) = ₹750, paid ₹1,100 → arrears max(0, 750 − 1,100) = 0.
    expect(pos.overdueInterest).toBe(0)
    expect(pos.cyclesBehind).toBe(0)
  })

  it('GROSS cycle cost is unchanged at ₹718.80 = ₹350.00 + ₹368.80', () => {
    // 09→23 Oct on ₹50,000: 750 × 14/30 = ₹350.00. 23 Oct 18:30Z → 09 Nov 08:30Z is 16 days on
    // ₹46,100: 46,100 × 1.5% × 16/30 = 691.50 × 16/30 = ₹368.80. Sum ₹718.80.
    expect(pos.thisCycleProjected).toBe(718.8)
  })

  it('STILL DUE is ₹368.80 — the ₹350 slice inside the ₹1,100 already received is netted off', () => {
    // charged(09 Nov) = 1,100 + 368.80 = ₹1,468.80. max(charged(09 Oct) 750, paid 1,100) = 1,100.
    // 1,468.80 − 1,100.00 = ₹368.80.
    expect(pos.thisCycleDue).toBe(368.8)
  })

  it('unpaid so far this cycle is ₹0 — ties to the detail screen', () => {
    // charged(24 Oct 12:00 IST) = ₹1,100 (0 whole days since the payment). 1,100 − 1,100 = 0.
    expect(pos.thisCycleInterest).toBe(350) // gross accrued in the cycle, unchanged meaning
    expect(pos.thisCycleUnpaid).toBe(0)
  })

  it('arrears + still due = everything owed by the due date, never more', () => {
    // 0 + 368.80 = charged(09 Nov) 1,468.80 − paid 1,100.
    expect(pos.overdueInterest + pos.thisCycleDue).toBeCloseTo(1468.8 - 1100, 2)
  })
})

describe('no payment — still due equals the gross cycle cost (behaviour unchanged)', () => {
  // ₹50,000 at 1.5%/mo from 09 Sep 00:00Z, asOf 24 Oct. Cycle 2 = 09 Oct → 09 Nov, one full month.
  const LOAN = { principalAmount: 50000, interestRate: 1.5, loanDate: '2026-09-09T00:00:00.000Z' }
  const pos = deriveCycles(LOAN, [], '2026-10-24T00:00:00.000Z')

  it('₹750 projected, ₹750 still due; ₹750 overdue from cycle 1', () => {
    // Each full month 50,000 × 1.5% = ₹750. Nothing paid → covered = charged(09 Oct) = 750.
    // still due = 1,500 − 750 = ₹750 = the gross.
    expect(pos.thisCycleProjected).toBe(750)
    expect(pos.thisCycleDue).toBe(750)
    expect(pos.overdueInterest).toBe(750)
    expect(pos.cyclesBehind).toBe(1)
    // 09 Oct → 24 Oct = 15 days: 750 × 15/30 = ₹375 accrued in the cycle, all unpaid.
    expect(pos.thisCycleInterest).toBe(375)
    expect(pos.thisCycleUnpaid).toBe(375)
  })
})

describe('cycle fully paid — nothing still due', () => {
  // A101's basis, but the customer hands over ₹51,100 on 24 Oct: ₹1,100 interest + ₹50,000 principal.
  // Principal is 0 from then on, so nothing more accrues inside the cycle.
  const LOAN = { principalAmount: 50000, interestRate: 1.5, loanDate: '2026-09-09T08:30:00.000Z' }
  const TXNS: LoanTxnLike[] = [{ id: 'p1', date: '2026-10-23T18:30:00.000Z', amount: 51100 }]
  const pos = deriveCycles(LOAN, TXNS, '2026-10-24T06:30:00.000Z')

  it('gross cycle ₹350 (all paid), still due ₹0', () => {
    // charged(09 Nov) = 1,100 + 0 = 1,100. covered = max(750, 1,100) = 1,100. Due = 0.
    expect(pos.thisCycleProjected).toBe(350)
    expect(pos.thisCycleDue).toBe(0)
    expect(pos.thisCycleUnpaid).toBe(0)
    expect(pos.overdueInterest).toBe(0)
  })
})

describe('a receipt clears arrears FIRST, and only the surplus counts towards this cycle', () => {
  // ₹50,000 at 1.5%/mo from 01 Jan 00:00Z. Cycles fall due 01 Feb, 01 Mar; current 01 Mar → 01 Apr.
  // At 15 Mar charged = 2 months + 14/30 = 1,500 + 350 = ₹1,850.
  // 15 Mar → 01 Apr = 17 days.
  const LOAN = { principalAmount: 50000, interestRate: 1.5, loanDate: '2026-01-01T00:00:00.000Z' }
  const AS_OF = '2026-03-20T00:00:00.000Z'

  it('₹1,600 on 15 Mar: arrears ₹1,500 cleared, ₹100 credited to this cycle → still due ₹675', () => {
    // All ₹1,600 is interest (< 1,850); principal stays ₹50,000. charged(01 Apr) = 1,850 +
    // 50,000 × 1.5% × 17/30 (= 425) = ₹2,275. Gross cycle = 2,275 − 1,500 = ₹775.
    // covered = max(1,500, 1,600) = 1,600 → still due 2,275 − 1,600 = ₹675. Overdue = 0.
    const pos = deriveCycles(LOAN, [{ id: 'p', date: '2026-03-15T00:00:00.000Z', amount: 1600 }], AS_OF)
    expect(pos.thisCycleProjected).toBe(775)
    expect(pos.thisCycleDue).toBe(675)
    expect(pos.overdueInterest).toBe(0)
    expect(pos.cyclesBehind).toBe(0)
    // charged(20 Mar) = 1,850 + 750 × 5/30 (125) = 1,975. 1,975 − 1,600 = ₹375 unpaid so far.
    expect(pos.thisCycleUnpaid).toBe(375)
  })

  it('₹1,000 on 15 Mar: arrears not cleared → still due is the full gross ₹775, overdue ₹500', () => {
    // covered = max(1,500, 1,000) = 1,500 → 2,275 − 1,500 = ₹775. Overdue = 1,500 − 1,000 = ₹500.
    // 500 + 775 = 1,275 = 2,275 − 1,000: nothing double-counted.
    const pos = deriveCycles(LOAN, [{ id: 'p', date: '2026-03-15T00:00:00.000Z', amount: 1000 }], AS_OF)
    expect(pos.thisCycleDue).toBe(775)
    expect(pos.overdueInterest).toBe(500)
    expect(pos.cyclesBehind).toBe(1)
    // 1,975 − 1,500 = ₹475 accrued this cycle and unpaid.
    expect(pos.thisCycleUnpaid).toBe(475)
  })
})
