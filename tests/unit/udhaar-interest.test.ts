import { describe, it, expect } from 'vitest'
import { DEFAULT_CONVENTION, resolveConvention, type LoanTxnLike } from '@/lib/interest'
import { udhaarBreakdown, udhaarDue, udhaarSummary } from '@/lib/udhaar'
import { round2 } from '@/lib/gst'
import {
  EMI_INTERVALS,
  bearsInterest,
  udhaarInterestFrom,
  udhaarLoanBasis,
  deriveUdhaar,
  udhaarSchedule,
  type UdhaarInterestRow,
} from '@/lib/udhaar'

/**
 * Task 87 — udhaar interest + installment plan.
 *
 * ONE ENGINE, NO SECOND FORMULA: every figure below comes out of deriveLoan() / accrueSegment() /
 * conventionMonths() in src/lib/interest.ts via the pure functions in src/lib/udhaar.ts, and nothing
 * else. oMunim runs two engines and shows the SAME loan at two different totals depending which
 * screen you're on (defect 5) — that is the defect this file exists to keep out.
 *
 * Every date below is a fixed ISO string; nothing here reads the clock.
 * Owners: be-lending. Independent verification: qa-api.
 */

const conv = (patch: Partial<Parameters<typeof resolveConvention>[0] & object> = {}) =>
  resolveConvention({ ...DEFAULT_CONVENTION, ...patch })

describe('bearsInterest — what is a lending at all', () => {
  it('a rated, money, credit row bears interest', () => {
    const row: UdhaarInterestRow = { type: 'credit', amount: 50000, interestRate: 2, interestType: 'monthly' }
    expect(bearsInterest(row)).toBe(true)
  })

  it('no rate, zero rate, or a negative rate bears nothing', () => {
    expect(bearsInterest({ type: 'credit', amount: 50000 })).toBe(false)
    expect(bearsInterest({ type: 'credit', amount: 50000, interestRate: 0 })).toBe(false)
    expect(bearsInterest({ type: 'credit', amount: 50000, interestRate: -1 })).toBe(false)
  })

  it('a metal udhaar never bears interest — it is grams, not rupees', () => {
    expect(bearsInterest({ type: 'credit', amount: 0, metal: 'gold', grams: 10, interestRate: 2 })).toBe(false)
  })

  it('a debit or an advance is not a lending — only a credit is money we lent out', () => {
    expect(bearsInterest({ type: 'debit', amount: 50000, interestRate: 2 })).toBe(false)
    expect(bearsInterest({ type: 'advance', amount: 50000, interestRate: 2 })).toBe(false)
  })
})

/**
 * DEFECT 6 — oMunim carries an EMI row with both dates at 01 Jan 1970. A null interestStartDate must
 * fall back to createdAt, never to the epoch, and every schedule due date must inherit that anchor.
 */
describe('udhaarInterestFrom — defect 6, never the 1970 epoch', () => {
  it('falls back to createdAt when interestStartDate is null', () => {
    const row: UdhaarInterestRow = {
      type: 'credit', amount: 50000, interestRate: 2, interestType: 'monthly',
      interestStartDate: null, createdAt: '2026-01-01T00:00:00.000Z',
    }
    const from = udhaarInterestFrom(row)
    expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(from.getFullYear()).toBeGreaterThan(1971)
  })

  it('prefers an explicit interestStartDate over createdAt', () => {
    const row: UdhaarInterestRow = {
      type: 'credit', amount: 50000, interestRate: 2, interestType: 'monthly',
      interestStartDate: '2026-03-15T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
    }
    expect(udhaarInterestFrom(row).toISOString()).toBe('2026-03-15T00:00:00.000Z')
  })

  it('every udhaarSchedule() due date is anchored off it — none of them can land in 1970/71', () => {
    const row: UdhaarInterestRow = {
      type: 'credit', amount: 90000, interestRate: 1, interestType: 'monthly',
      interestStartDate: null, createdAt: '2026-01-01T00:00:00.000Z',
      emiIntervalDays: EMI_INTERVALS.month, emiOccurrences: 3,
    }
    const schedule = udhaarSchedule(row, [], '2026-12-01T00:00:00.000Z')
    expect(schedule.length).toBe(3)
    for (const inst of schedule) expect(inst.due.getFullYear()).toBeGreaterThan(1971)
  })
})

/**
 * RATE-TYPE MAPPING — the only mapping. 'days' is priced as (rate × 30) %/month on days30/exact,
 * which is algebraically P × r% × days. ₹1,00,000 at 0.1%/day for 45 days:
 *     45 elapsed days on days30/exact = 1 whole month (30d) + 15/30 = 1.5 months
 *     interest = 1,00,000 × 3% × 1.5 = ₹4,500.00        (3% = 0.1% × 30, the monthly-equivalent rate)
 * which is exactly 1,00,000 × 0.1% × 45 = ₹4,500.00 — the same identity, so the two are asserted equal.
 */
describe('rate-type mapping — days is exactly P × r% × days through the monthly engine', () => {
  const LOAN_DATE = '2026-01-01T00:00:00.000Z'
  const DAY45 = '2026-02-15T00:00:00.000Z' // hand-verified: Jan1 + 45 days

  it('0.1%/day for 45 days on ₹1,00,000 = ₹4,500.00 exactly', () => {
    const row: UdhaarInterestRow = {
      type: 'credit', amount: 100000, interestRate: 0.1, interestType: 'days',
      interestStartDate: LOAN_DATE,
    }
    const basis = udhaarLoanBasis(row)
    expect(basis.interestRate).toBe(3) // 0.1 × 30, the monthly-equivalent rate actually charged
    expect(deriveUdhaar(row, [], DAY45).accruedInterest).toBe(4500)
  })

  it('the days figure lands on the identical paise as its monthly-equivalent (3%/month, days30/exact)', () => {
    const daysRow: UdhaarInterestRow = {
      type: 'credit', amount: 100000, interestRate: 0.1, interestType: 'days', interestStartDate: LOAN_DATE,
    }
    const monthlyRow: UdhaarInterestRow = {
      type: 'credit', amount: 100000, interestRate: 3, interestType: 'monthly', interestStartDate: LOAN_DATE,
      interestConvention: conv({ dayBasis: 'days30', rounding: 'exact' }),
    }
    const daysInterest = deriveUdhaar(daysRow, [], DAY45).accruedInterest
    const monthlyInterest = deriveUdhaar(monthlyRow, [], DAY45).accruedInterest
    expect(daysInterest).toBe(4500)
    expect(monthlyInterest).toBe(4500)
    expect(daysInterest).toBe(monthlyInterest)
  })

  it('monthly and annually price the same loan identically once rate is annualised × 12', () => {
    // ₹12,000 at 24%/annum = 2%/month. One month on ₹12,000 at 2% = ₹240.
    const annualRow: UdhaarInterestRow = {
      type: 'credit', amount: 12000, interestRate: 24, interestType: 'annually', interestStartDate: LOAN_DATE,
    }
    const monthlyRow: UdhaarInterestRow = {
      type: 'credit', amount: 12000, interestRate: 2, interestType: 'monthly', interestStartDate: LOAN_DATE,
    }
    const basis = udhaarLoanBasis(annualRow)
    expect(basis.interestRate).toBe(24) // the stored quote is never divided; only the point of use divides it
    const at = '2026-02-01T00:00:00.000Z' // exactly 1 calendar month later
    expect(deriveUdhaar(annualRow, [], at).accruedInterest).toBe(240)
    expect(deriveUdhaar(monthlyRow, [], at).accruedInterest).toBe(240)
  })
})

/**
 * DEFECT 2 — oMunim counts both ends of the term, so a 30-day loan is billed as 31 days. Our term is
 * exclusive: 2026-01-01 → 2026-01-31 is 30 elapsed days, not 31.
 */
describe('defect 2 — day counts are exclusive of one end, unlike oMunim', () => {
  it('₹10,000 at 1%/day for the 30 days 2026-01-01 → 2026-01-31 is ₹3,000.00, not ₹3,100 (31 days)', () => {
    const row: UdhaarInterestRow = {
      type: 'credit', amount: 10000, interestRate: 1, interestType: 'days',
      interestStartDate: '2026-01-01T00:00:00.000Z',
    }
    const interest = deriveUdhaar(row, [], '2026-01-31T00:00:00.000Z').accruedInterest
    expect(interest).toBe(3000)
    expect(interest).not.toBe(3100)
  })
})

/**
 * settledAmount TRACKS PRINCIPAL RECOVERED, not gross cash. ₹50,000 at 2%/month from 2026-01-01,
 * ₹1,500 paid on the 1-month anniversary 2026-02-01 (1.0 months exactly, calendar/exact):
 *     interest for the month = 50,000 × 2% × 1 = ₹1,000.00
 *     interest-first: ₹1,000 → interest, ₹500 → principal ⇒ outstanding ₹49,500
 * paidPrincipal (₹500) is what settledAmount should read; paidInterest (₹1,000) is reported apart.
 */
describe('settledAmount = principal recovered; interest recovered is reported separately', () => {
  const LOAN: UdhaarInterestRow = {
    type: 'credit', amount: 50000, interestRate: 2, interestType: 'monthly',
    interestStartDate: '2026-01-01T00:00:00.000Z',
  }
  const PAID: LoanTxnLike = { date: '2026-02-01T00:00:00.000Z', amount: 1500 }

  it('paidPrincipal (₹500) is the settled figure; paidInterest (₹1,000) is separate', () => {
    const d = deriveUdhaar(LOAN, [PAID], '2026-02-01T00:00:00.000Z')
    expect(d.paidPrincipal).toBe(500)
    expect(d.paidInterest).toBe(1000)
    expect(d.outstandingPrincipal).toBe(49500)
    // udhaarDue keyed off settledAmount = paidPrincipal reproduces the same outstanding figure.
    expect(udhaarDue({ type: 'credit', amount: 50000, settledAmount: d.paidPrincipal })).toBe(d.outstandingPrincipal)
  })

  it('interest-first, then the reduced principal accrues going forward: +₹990 over the next month', () => {
    // 49,500 × 2% × 1 month = ₹990.00 — proves the SECOND segment is priced on the paid-down balance.
    const d = deriveUdhaar(LOAN, [PAID], '2026-03-01T00:00:00.000Z')
    expect(d.accruedInterest).toBe(990)
    expect(d.totalDue).toBe(50490)
  })
})

/**
 * DEFECT 3 — oMunim nets an advance payment straight into interest and can show a total below the
 * money lent. accruedInterest must never go negative, and totalDue must never fall below
 * principal-minus-principal-recovered, including on a same-day / advance receipt.
 */
describe('defect 3 — no negative interest from an advance or overpaid receipt', () => {
  const LOAN: UdhaarInterestRow = {
    type: 'credit', amount: 50000, interestRate: 2, interestType: 'monthly',
    interestStartDate: '2026-01-01T00:00:00.000Z',
  }

  it('a same-day receipt (0 days elapsed, 0 interest) applies wholly to principal, never goes negative', () => {
    const d = deriveUdhaar(LOAN, [{ date: '2026-01-01T00:00:00.000Z', amount: 20000 }], '2026-01-01T00:00:00.000Z')
    expect(d.accruedInterest).toBe(0)
    expect(d.outstandingPrincipal).toBe(30000)
    expect(d.totalDue).toBe(30000) // = 50,000 principal − 20,000 recovered, exactly
    expect(d.accruedInterest).toBeGreaterThanOrEqual(0)
  })

  it('an advance that overpays the principal never drags interest or totalDue below zero, then or later', () => {
    const d0 = deriveUdhaar(LOAN, [{ date: '2026-01-01T00:00:00.000Z', amount: 60000 }], '2026-01-01T00:00:00.000Z')
    expect(d0.outstandingPrincipal).toBe(0)
    expect(d0.accruedInterest).toBe(0)
    expect(d0.totalDue).toBe(0)
    // Zero principal accrues nothing, however far forward asOf runs — never a phantom negative.
    const later = deriveUdhaar(LOAN, [{ date: '2026-01-01T00:00:00.000Z', amount: 60000 }], '2026-06-01T00:00:00.000Z')
    expect(later.accruedInterest).toBe(0)
    expect(later.totalDue).toBe(0)
  })
})

/**
 * interestEndDate CAPS THE CLOCK. ₹50,000 at 2%/month, end 2026-03-01 (2 calendar months from
 * disbursal): interest at/after the cap = 50,000 × 2% × 2 = ₹2,000.00, and nothing accrues past it.
 * A ₹1,200 receipt priced on the end date and the identical receipt dated a month AFTER it must price
 * byte-identically — the pinning rule, not a dropped payment.
 */
describe('interestEndDate — nothing accrues past it; a late receipt prices as if dated on it', () => {
  const LOAN: UdhaarInterestRow = {
    type: 'credit', amount: 50000, interestRate: 2, interestType: 'monthly',
    interestStartDate: '2026-01-01T00:00:00.000Z', interestEndDate: '2026-03-01T00:00:00.000Z',
  }

  it('interest is capped at ₹2,000.00 (2 months) however far past the end asOf runs', () => {
    const soonAfter = deriveUdhaar(LOAN, [], '2026-04-01T00:00:00.000Z').accruedInterest
    const longAfter = deriveUdhaar(LOAN, [], '2026-12-01T00:00:00.000Z').accruedInterest
    expect(soonAfter).toBe(2000)
    expect(longAfter).toBe(2000)
    expect(soonAfter).toBe(longAfter)
  })

  it('a receipt dated ON the end date and the same receipt dated a month AFTER it price identically', () => {
    const onEnd = deriveUdhaar(LOAN, [{ date: '2026-03-01T00:00:00.000Z', amount: 1200 }], '2026-06-01T00:00:00.000Z')
    const afterEnd = deriveUdhaar(LOAN, [{ date: '2026-04-01T00:00:00.000Z', amount: 1200 }], '2026-06-01T00:00:00.000Z')
    // ₹2,000 due, ₹1,200 clears interest first, ₹800 carries as unpaid interest; principal untouched.
    expect(onEnd).toEqual(afterEnd)
    expect(onEnd.accruedInterest).toBe(800)
    expect(onEnd.outstandingPrincipal).toBe(50000)
    expect(onEnd.totalDue).toBe(50800)
  })
})

/**
 * DEFECT 5 — THE MOST IMPORTANT TEST IN THE FILE. oMunim priced the SAME loan at ₹44,488 on its list
 * and ₹14,829 on its detail screen. There is only one function here, so a "list-shaped" call and a
 * "detail-shaped" call (built independently, different call sites) MUST return byte-identical figures
 * for the same row, the same payments and the same asOf.
 */
describe('defect 5 — the list and the detail can never price the same row two different ways', () => {
  const buildRow = (): UdhaarInterestRow => ({
    type: 'credit', amount: 73400, interestRate: 1.75, interestType: 'monthly',
    interestStartDate: '2026-01-01T00:00:00.000Z',
  })
  const payments: LoanTxnLike[] = [{ date: '2026-02-15T00:00:00.000Z', amount: 12000 }]
  const asOf = '2026-05-01T00:00:00.000Z'

  /** Simulates a list row's summary card — its own local variables, its own call site. */
  function listShapedFigure() {
    const listRow = buildRow()
    return deriveUdhaar(listRow, payments, asOf)
  }

  /** Simulates the detail screen — a fresh row object, a fresh payments array, same values. */
  function detailShapedFigure() {
    const detailRow = { ...buildRow() }
    const detailPayments = payments.map((p) => ({ ...p }))
    return deriveUdhaar(detailRow, detailPayments, asOf)
  }

  it('deriveUdhaar() called from two independent call sites returns byte-identical figures', () => {
    const list = listShapedFigure()
    const detail = detailShapedFigure()
    expect(list).toEqual(detail)
    expect(list.totalDue).toBe(detail.totalDue)
    expect(list.accruedInterest).toBe(detail.accruedInterest)
  })

  it('udhaarSchedule() is equally single-sourced across the two call shapes', () => {
    const row = { ...buildRow(), emiIntervalDays: EMI_INTERVALS.month, emiOccurrences: 4 }
    const a = udhaarSchedule({ ...row }, payments.map((p) => ({ ...p })), asOf)
    const b = udhaarSchedule({ ...row }, payments.map((p) => ({ ...p })), asOf)
    expect(a).toEqual(b)
  })
})

/**
 * THE SCHEDULE. [] unless BOTH emiIntervalDays and emiOccurrences are set and > 0. The principal
 * column sums to `amount` exactly — the last row absorbs the rounding remainder.
 * ₹1,00,000 over 3 occurrences: 33,333.33 + 33,333.33 + 33,333.34 = ₹1,00,000.00 exactly.
 */
describe('udhaarSchedule — shape and the rounding-remainder rule', () => {
  const BASE: UdhaarInterestRow = {
    type: 'credit', amount: 100000, interestRate: 1, interestType: 'monthly',
    interestStartDate: '2026-01-01T00:00:00.000Z',
  }

  it('EMI_INTERVALS is week 7 / fortnight 15 / month 30', () => {
    expect(EMI_INTERVALS).toEqual({ week: 7, fortnight: 15, month: 30 })
  })

  it('[] when emiOccurrences is missing', () => {
    expect(udhaarSchedule({ ...BASE, emiIntervalDays: 30 }, [], '2026-06-01T00:00:00.000Z')).toEqual([])
  })

  it('[] when emiIntervalDays is missing', () => {
    expect(udhaarSchedule({ ...BASE, emiOccurrences: 3 }, [], '2026-06-01T00:00:00.000Z')).toEqual([])
  })

  it('[] when emiOccurrences is 0 — a falsy plan is no plan', () => {
    expect(udhaarSchedule({ ...BASE, emiIntervalDays: 30, emiOccurrences: 0 }, [], '2026-06-01T00:00:00.000Z')).toEqual([])
  })

  it('the principal column sums to amount exactly, remainder absorbed by the last installment', () => {
    const rows = udhaarSchedule({ ...BASE, emiIntervalDays: EMI_INTERVALS.month, emiOccurrences: 3 }, [], '2026-06-01T00:00:00.000Z')
    expect(rows).toHaveLength(3)
    expect(rows[0].principal).toBe(33333.33)
    expect(rows[1].principal).toBe(33333.33)
    expect(rows[2].principal).toBe(33333.34)
    const sum = Number(rows.reduce((s, r) => s + r.principal, 0).toFixed(2))
    expect(sum).toBe(100000)
  })

  it('due dates step by emiIntervalDays off the interest-from anchor (EMI_INTERVALS.week = 7 days)', () => {
    const rows = udhaarSchedule(
      { ...BASE, emiIntervalDays: EMI_INTERVALS.week, emiOccurrences: 2 },
      [], '2026-06-01T00:00:00.000Z',
    )
    expect(rows[0].due.toISOString()).toBe('2026-01-08T00:00:00.000Z')
    expect(rows[1].due.toISOString()).toBe('2026-01-15T00:00:00.000Z')
  })
})

/**
 * STRICT-ORDER ALLOCATION, BUT PAYING AHEAD IS ALLOWED. oMunim blocks a payment with "Please pay
 * previous all EMI"; we deliberately do not. ₹90,000 over 3 × 30-day installments on days30/exact,
 * 1%/month:
 *   row1: 90,000 × 1% × 1 month = ₹900.00 interest, principal ₹30,000 → total ₹30,900
 *   row2: 60,000 × 1% × 1 month = ₹600.00 interest, principal ₹30,000 → total ₹30,600
 *   row3: 30,000 × 1% × 1 month = ₹300.00 interest, principal ₹30,000 → total ₹30,300
 * A single ₹40,000 receipt: row1 fully paid (₹30,900), the ₹9,100 left over is NOT blocked — it
 * flows straight into row2 (₹9,100 of its ₹30,600), leaving row3 untouched.
 */
describe('strict-order allocation with overpayment flowing ahead (oMunim blocks this; we do not)', () => {
  const ROW: UdhaarInterestRow = {
    type: 'credit', amount: 90000, interestRate: 1, interestType: 'monthly',
    interestStartDate: '2026-01-01T00:00:00.000Z',
    interestConvention: conv({ dayBasis: 'days30', rounding: 'exact' }),
    emiIntervalDays: EMI_INTERVALS.month, emiOccurrences: 3,
  }

  it('the frozen plan prices ₹30,900 / ₹30,600 / ₹30,300', () => {
    const rows = udhaarSchedule(ROW, [], '2026-01-01T00:00:00.000Z')
    expect(rows.map((r) => r.amount)).toEqual([30900, 30600, 30300])
  })

  it('a ₹40,000 lump receipt pays row 1 in full and pushes ₹9,100 into row 2, unblocked', () => {
    const payments: LoanTxnLike[] = [{ date: '2026-01-01T00:00:00.000Z', amount: 40000 }]
    const rows = udhaarSchedule(ROW, payments, '2026-12-01T00:00:00.000Z')
    expect(rows[0].status).toBe('paid')
    expect(rows[0].paid).toBe(30900)
    expect(round2(rows[0].amount - rows[0].paid)).toBe(0)
    expect(rows[1].status).toBe('partial')
    expect(rows[1].paid).toBe(9100)
    expect(round2(rows[1].amount - rows[1].paid)).toBe(21500) // 30,600 − 9,100
    expect(rows[2].paid).toBe(0)
    expect(rows[2].status).not.toBe('paid')
  })
})

/**
 * DEFECT 7 — oMunim lets a part payment retroactively re-price months already settled (UPDATED LOAN
 * DATE / UPDATED PRINCIPAL AMOUNT). The schedule is a pure function of the FROZEN TERMS: adding a
 * payment must leave every row's from/due/principal/interest/amount untouched. Only
 * paid/paidDate/status may move.
 */
describe('defect 7 — a part payment never rewrites a schedule row\'s date or price', () => {
  const ROW: UdhaarInterestRow = {
    type: 'credit', amount: 90000, interestRate: 1, interestType: 'monthly',
    interestStartDate: '2026-01-01T00:00:00.000Z',
    interestConvention: conv({ dayBasis: 'days30', rounding: 'exact' }),
    emiIntervalDays: EMI_INTERVALS.month, emiOccurrences: 3,
  }

  it('from/due/principal/interest/amount are byte-identical before and after a part payment', () => {
    const before = udhaarSchedule(ROW, [], '2026-12-01T00:00:00.000Z')
    const payments: LoanTxnLike[] = [{ date: '2026-01-01T00:00:00.000Z', amount: 40000 }]
    const after = udhaarSchedule(ROW, payments, '2026-12-01T00:00:00.000Z')

    expect(after).toHaveLength(before.length)
    for (let i = 0; i < before.length; i++) {
      expect(after[i].from.toISOString()).toBe(before[i].from.toISOString())
      expect(after[i].due.toISOString()).toBe(before[i].due.toISOString())
      expect(after[i].principal).toBe(before[i].principal)
      expect(after[i].interest).toBe(before[i].interest)
      expect(after[i].amount).toBe(before[i].amount)
    }
    // …but paid/paidDate/status DID move — the payment was actually recorded, just not backdated
    // onto the plan.
    expect(before[0].paid).toBe(0)
    expect(after[0].paid).toBe(30900)
    expect(before[0].status).not.toBe('paid')
    expect(after[0].status).toBe('paid')
  })
})

/**
 * THE INVARIANT THAT LETS THIS SHIP. Every udhaar row in the live database has interestRate NULL,
 * and every one of them must read back today EXACTLY as it read yesterday: no interest, no plan,
 * and not one paisa of movement in the totals the dashboard, the customer panel and the balance
 * sheet are built on.
 */
describe('a row with no rate reads back exactly as it did before Task 87', () => {
  const legacy = {
    type: 'credit', amount: 80000, settledAmount: 5000, status: 'active', metal: null,
    interestRate: null, interestType: null, interestStartDate: null,
    // Even with an installment plan sitting on the columns: no rate, no plan.
    emiIntervalDays: EMI_INTERVALS.month, emiOccurrences: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  it('summarises to all nulls and schedules nothing', () => {
    expect(udhaarSummary(legacy, [], '2026-06-01T00:00:00.000Z')).toEqual({
      interest: null,
      leftAmount: null,
      leftWithInterest: null,
      paidSoFar: null,
      nextDueDate: null,
      emiTotal: null,
      emiPaid: null,
    })
    expect(udhaarSchedule(legacy, [], '2026-06-01T00:00:00.000Z')).toEqual([])
    // And priced at 0% it still accrues nothing, whatever date it is read at.
    expect(deriveUdhaar(legacy, [], '2030-01-01T00:00:00.000Z').accruedInterest).toBe(0)
  })

  it('leaves udhaarBreakdown byte-identical to its pre-Task-87 output', () => {
    // The worked example from the header of src/lib/udhaar.ts: credit ₹80,000 with ₹5,000 settled
    // plus a ₹30,000 debit nets ₹45,000. The new columns must not move a paisa of it.
    const rows = [legacy, { type: 'debit', amount: 30000, settledAmount: 0, status: 'active' }]
    expect(JSON.stringify(udhaarBreakdown(rows))).toBe(
      JSON.stringify({ toReceive: 75000, toPay: 30000, advance: 0, net: 45000, metal: { gold: 0, silver: 0 } }),
    )
  })
})

/**
 * DEFECT 5, the version that actually bites: the LIST row is enriched by udhaarSummary() while the
 * DETAIL screen reads deriveUdhaar() and udhaarSchedule() directly. If those two ever disagree, one
 * screen quotes ₹44,488 and the other ₹14,829 for the same udhaar in the same minute.
 *
 * BY HAND — ₹90,000 at 1%/month, days30 + exact, three 30-day installments from 2026-01-01:
 *   row 1  01-01 → 01-31  90,000 × 1% × 1 = ₹900.00 interest + ₹30,000 principal = ₹30,900.00
 *   row 2  01-31 → 03-02  60,000 × 1% × 1 = ₹600.00 interest + ₹30,000 principal = ₹30,600.00
 *   row 3  03-02 → 04-01  30,000 × 1% × 1 = ₹300.00 interest + ₹30,000 principal = ₹30,300.00
 * One receipt of ₹30,900 on 2026-01-31 closes row 1 exactly. Read on 2026-04-01.
 */
describe('defect 5 — the list summary and the detail objects, same row, same figures', () => {
  const ROW: UdhaarInterestRow & { dueDate?: string } = {
    type: 'credit', amount: 90000, interestRate: 1, interestType: 'monthly',
    interestStartDate: '2026-01-01T00:00:00.000Z',
    interestConvention: conv({ dayBasis: 'days30', rounding: 'exact' }),
    emiIntervalDays: EMI_INTERVALS.month, emiOccurrences: 3,
  }
  const payments: LoanTxnLike[] = [{ id: 'p1', date: '2026-01-31T00:00:00.000Z', amount: 30900 }]
  const asOf = '2026-04-01T00:00:00.000Z'

  it('every figure on the list row comes from the detail figures, unrounded twice or not at all', () => {
    const list = udhaarSummary(ROW, payments, asOf)
    const derived = deriveUdhaar(ROW, payments, asOf)
    const schedule = udhaarSchedule(ROW, payments, asOf)
    expect(list.interest).toBe(derived.accruedInterest)
    expect(list.leftAmount).toBe(derived.outstandingPrincipal)
    expect(list.leftWithInterest).toBe(derived.totalDue)
    expect(list.paidSoFar).toBe(derived.totalPaid)
    expect(list.emiTotal).toBe(3)
    expect(list.emiPaid).toBe(1)
    expect(list.nextDueDate).toBe(schedule[1].due.toISOString())
    // The hand figures: ₹900 of the receipt was interest, ₹30,000 came off the principal.
    expect(derived.paidInterest).toBe(900)
    expect(derived.paidPrincipal).toBe(30000)
    expect(derived.outstandingPrincipal).toBe(60000)
  })

  it('dates the installment the receipt completed, and calls the missed one overdue', () => {
    const schedule = udhaarSchedule(ROW, payments, asOf)
    expect(schedule.map((r) => r.amount)).toEqual([30900, 30600, 30300])
    expect(schedule[0].status).toBe('paid')
    expect(schedule[0].paidDate?.toISOString()).toBe('2026-01-31T00:00:00.000Z')
    // Row 2 fell due on 2026-03-02 and nothing came in: this is the row a collection screen chases.
    expect(schedule[1].status).toBe('overdue')
    expect(schedule[1].paidDate).toBeNull()
    // Row 3 falls due on the read date itself — due, not yet overdue.
    expect(schedule[2].status).toBe('due')
  })
})
