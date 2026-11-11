import { describe, it, expect } from 'vitest'
import { monthsBetween, simpleInterest, deriveLoan, splitPayment, sumOutstandingPrincipal } from '@/lib/interest'
import { postVoucher, type LedgerTx, type VoucherLeg } from '@/lib/ledger'

/**
 * Tier-2 checkpoint 2, items 2 & 3. The defect these lock down: the loan list charged days/30,
 * the girvi calculator charged whole months the operator typed, and the release dialog charged
 * whatever was overtyped over a prefilled bare principal — three different numbers for one loan.
 * Convention: calendar-anchored pro-rata (complete calendar months + remainder/30), simple
 * interest on the outstanding principal, payments interest-first. See src/lib/interest.ts.
 * Owners: be-lending, verification: qa-finance.
 */

const CONVENTION = 'calendar-anchored pro-rata: complete calendar months + remainder/30'

const LOAN = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z' }
const PART_PAYMENT_DATE = '2026-02-10T00:00:00.000Z' // day 40
const RELEASE_DATE = '2026-04-11T00:00:00.000Z' // day 100

describe('monthsBetween — calendar-anchored pro-rata', () => {
  it('counts complete months on the anniversary and the remainder over 30', () => {
    // 2026-01-01 → 2026-02-10: anniversary 02-01 reached, 9 days past it.
    expect(monthsBetween(LOAN.loanDate, PART_PAYMENT_DATE)).toBeCloseTo(1 + 9 / 30, 10)
    // 2026-02-10 → 2026-04-11: anniversaries 03-10 and 04-10, 1 day past the last.
    expect(monthsBetween(PART_PAYMENT_DATE, RELEASE_DATE)).toBeCloseTo(2 + 1 / 30, 10)
  })

  it('is NOT totalDays/30', () => {
    // 100 elapsed days would be 3.3333 months; calendar-anchored gives 3 + 10/30 over the
    // same span only because Jan+Feb+Mar happen to be 90 days. The two rules diverge here:
    const days = 40 / 30 // 1.3333… — what the old loans.tsx charged for segment 1
    expect(monthsBetween(LOAN.loanDate, PART_PAYMENT_DATE)).not.toBeCloseTo(days, 6)
  })

  it('clamps a month-end anniversary instead of rolling into the next month', () => {
    // 31 Jan + 1 month is 28 Feb, not 3 March. A rolling anniversary would report 0 complete
    // months here and charge 28/30 instead of a full month.
    expect(monthsBetween('2026-01-31T00:00:00.000Z', '2026-02-28T00:00:00.000Z')).toBe(1)
    expect(monthsBetween('2026-01-31T00:00:00.000Z', '2026-03-01T00:00:00.000Z')).toBeCloseTo(1 + 1 / 30, 10)
  })

  it('is zero, never negative, for a date at or before the anchor', () => {
    expect(monthsBetween(RELEASE_DATE, LOAN.loanDate)).toBe(0)
    expect(monthsBetween(LOAN.loanDate, LOAN.loanDate)).toBe(0)
  })
})

// Assertion 5 — the whole point of the convention.
describe('February vs March: equal calendar terms accrue equal interest', () => {
  it('a loan over Feb (28 days) and one over Mar (31 days) both accrue exactly one month', () => {
    const feb = deriveLoan({ ...LOAN, loanDate: '2026-02-01T00:00:00.000Z' }, [], '2026-03-01T00:00:00.000Z')
    const mar = deriveLoan({ ...LOAN, loanDate: '2026-03-01T00:00:00.000Z' }, [], '2026-04-01T00:00:00.000Z')
    expect(feb.accruedInterest).toBe(1250) // 50000 × 2.5% × 1
    expect(mar.accruedInterest).toBe(feb.accruedInterest)
    // days/30 charged the February borrower 28/30 = ₹1,166.67 and the March one 31/30 = ₹1,291.67.
    expect(feb.accruedInterest).not.toBe(50000 * 2.5 * (28 / 30) / 100)
  })

  it('holds across three whole months too', () => {
    const janToApr = deriveLoan(LOAN, [], '2026-04-01T00:00:00.000Z') // 90 days
    const marToJun = deriveLoan({ ...LOAN, loanDate: '2026-03-01T00:00:00.000Z' }, [], '2026-06-01T00:00:00.000Z') // 92 days
    expect(janToApr.accruedInterest).toBe(3750)
    expect(marToJun.accruedInterest).toBe(janToApr.accruedInterest)
  })
})

// Assertion 4 — no minimum interest period.
describe('no minimum interest period', () => {
  it('5 days accrues 0.166667 months = ₹208.33, not a full month of ₹1,250', () => {
    const d = deriveLoan(LOAN, [], '2026-01-06T00:00:00.000Z')
    expect(d.monthsElapsed).toBeCloseTo(5 / 30, 10)
    expect(d.accruedInterest).toBe(208.33)
    expect(d.totalDue).toBe(50208.33)
  })

  it('a same-day release owes the bare principal', () => {
    const d = deriveLoan(LOAN, [], LOAN.loanDate)
    expect(d.accruedInterest).toBe(0)
    expect(d.totalDue).toBe(50000)
  })
})

describe('the worked example — part payment then release', () => {
  const partPayment = { id: 'p1', date: PART_PAYMENT_DATE, amount: 15000 }

  it('segment 1: 1.3 months on ₹50,000 at 2.5% = ₹1,625.00', () => {
    const atPayment = deriveLoan(LOAN, [], PART_PAYMENT_DATE)
    expect(atPayment.accruedInterest).toBe(1625)
    expect(atPayment.outstandingPrincipal).toBe(50000)
  })

  // Assertion 6 — interest after a part payment accrues on the REDUCED principal.
  it('interest-first: ₹1,625 to interest, ₹13,375 to principal, outstanding ₹36,625', () => {
    const atPayment = deriveLoan(LOAN, [], PART_PAYMENT_DATE)
    const split = splitPayment(15000, atPayment.accruedInterest)
    expect(split).toEqual({ interestComponent: 1625, principalComponent: 13375 })

    const after = deriveLoan(LOAN, [partPayment], PART_PAYMENT_DATE)
    expect(after.outstandingPrincipal).toBe(36625)
    expect(after.accruedInterest).toBe(0)
    expect(after.paidInterest).toBe(1625)
    expect(after.paidPrincipal).toBe(13375)
  })

  it('segment 2 accrues on ₹36,625, not on the original ₹50,000', () => {
    const atRelease = deriveLoan(LOAN, [partPayment], RELEASE_DATE)
    expect(atRelease.monthsSinceLastEvent).toBeCloseTo(2 + 1 / 30, 10)
    expect(atRelease.accruedInterest).toBe(1861.77) // 36625 × 2.5% × 2.0333333
    // Accruing on the untouched principal — the bug — would have charged ₹2,541.67.
    expect(atRelease.accruedInterest).not.toBe(2541.67)
    expect(atRelease.outstandingPrincipal).toBe(36625)
    expect(atRelease.totalDue).toBe(38486.77)
  })

  // Assertion 2 — the fixed-date total.
  it(`total received over the life of the loan is ₹53,486.77 (${CONVENTION})`, () => {
    const atRelease = deriveLoan(LOAN, [partPayment], RELEASE_DATE)
    const release = { id: 'p2', date: RELEASE_DATE, amount: atRelease.totalDue }
    const closed = deriveLoan(LOAN, [partPayment, release], RELEASE_DATE)

    expect(release.amount, `release quote must be ₹38,486.77 under ${CONVENTION}`).toBe(38486.77)
    expect(closed.totalPaid, `₹15,000 + ₹38,486.77 = ₹53,486.77 under ${CONVENTION}`).toBe(53486.77)
    expect(closed.outstandingPrincipal).toBe(0)
    expect(closed.accruedInterest).toBe(0)
    expect(closed.totalDue).toBe(0)
    expect(closed.paidPrincipal).toBe(50000)
    expect(closed.paidInterest).toBe(3486.77)
  })
})

/**
 * Assertion 1 (primary) and 3 — the property, not the number.
 *
 * Why interest-first always recovers MORE than principal-first: let I be the interest accrued when
 * the part payment lands, and let the payment be at least I. Interest-first clears I and reduces
 * the principal by (payment − I); principal-first reduces it by the full payment and carries I
 * unpaid. So the principal standing through segment 2 is HIGHER by exactly I under interest-first,
 * and the extra interest it earns is
 *
 *     premium = I × rate × months(segment 2)
 *
 * On these inputs: 1625 × 2.5% × 2.0333333 = ₹82.60.
 * Under the OLD days/30 rule the same formula gives 1666.67 × 2.5% × 2.0 = ₹83.33, which is why a
 * test hard-coding ₹83.33 goes red against correct code. Only the algebraic form survives a change
 * of rate, dates or month rule, which is why it is asserted first.
 */
describe('interest-first recovers more than principal-first', () => {
  /** Principal-first: the whole payment kills principal, accrued interest is carried unpaid. */
  function principalFirstTotal(loan: typeof LOAN, payment: number, payDate: string, endDate: string) {
    const carriedInterest = simpleInterest(loan.principalAmount, loan.interestRate, monthsBetween(loan.loanDate, payDate))
    const principal = loan.principalAmount - payment
    const seg2 = simpleInterest(principal, loan.interestRate, monthsBetween(payDate, endDate))
    return payment + principal + carriedInterest + seg2
  }

  function interestFirstTotal(loan: typeof LOAN, payment: number, payDate: string, endDate: string) {
    const txns = [{ id: 'p1', date: payDate, amount: payment }]
    return payment + deriveLoan(loan, txns, endDate).totalDue
  }

  it('the property holds across rates, dates and payment sizes', () => {
    const cases = [
      { rate: 2.5, payment: 15000, pay: PART_PAYMENT_DATE, end: RELEASE_DATE },
      { rate: 1.5, payment: 15000, pay: PART_PAYMENT_DATE, end: RELEASE_DATE },
      { rate: 3, payment: 30000, pay: '2026-03-15T00:00:00.000Z', end: '2026-09-02T00:00:00.000Z' },
      { rate: 2, payment: 5000, pay: '2026-01-20T00:00:00.000Z', end: '2027-01-01T00:00:00.000Z' },
    ]
    for (const c of cases) {
      const loan = { ...LOAN, interestRate: c.rate }
      const iFirst = interestFirstTotal(loan, c.payment, c.pay, c.end)
      const pFirst = principalFirstTotal(loan, c.payment, c.pay, c.end)
      expect(iFirst, `interest-first must recover more at ${c.rate}%/mo`).toBeGreaterThan(pFirst)

      // …and the premium is exactly I × rate × months(segment 2).
      const I = simpleInterest(loan.principalAmount, c.rate, monthsBetween(loan.loanDate, c.pay))
      const expectedPremium = simpleInterest(I, c.rate, monthsBetween(c.pay, c.end))
      // Precision 2: iFirst comes off a totalDue already rounded to paise, so the two agree to
      // the paise and no further — which is exactly the accuracy the books are kept to.
      expect(iFirst - pFirst).toBeCloseTo(expectedPremium, 2)
    }
  })

  // Assertion 3 — the delta on the approved inputs.
  it(`the delta on the worked example is ₹82.60 (${CONVENTION})`, () => {
    const iFirst = interestFirstTotal(LOAN, 15000, PART_PAYMENT_DATE, RELEASE_DATE)
    const pFirst = principalFirstTotal(LOAN, 15000, PART_PAYMENT_DATE, RELEASE_DATE)
    expect(Number(iFirst.toFixed(2))).toBe(53486.77)
    expect(Number(pFirst.toFixed(2))).toBe(53404.17)
    expect(Number((iFirst - pFirst).toFixed(2)), `₹82.60 under ${CONVENTION}; ₹83.33 is the days/30 delta and is wrong here`).toBe(82.6)
  })
})

describe('derivation mechanics', () => {
  it('a payment smaller than the accrued interest touches no principal', () => {
    const txns = [{ id: 'p1', date: PART_PAYMENT_DATE, amount: 1000 }] // interest due is ₹1,625
    const d = deriveLoan(LOAN, txns, PART_PAYMENT_DATE)
    expect(d.outstandingPrincipal).toBe(50000)
    expect(d.accruedInterest).toBe(625) // 1625 − 1000 still owed
    expect(d.paidPrincipal).toBe(0)
  })

  it('carries the unpaid interest forward without compounding it', () => {
    const txns = [{ id: 'p1', date: PART_PAYMENT_DATE, amount: 1000 }]
    const d = deriveLoan(LOAN, txns, RELEASE_DATE)
    // ₹625 carried + 50000 × 2.5% × 2.0333333 = 625 + 2541.67
    expect(d.accruedInterest).toBe(3166.67)
    expect(d.outstandingPrincipal).toBe(50000)
  })

  it('a discount is applied to the dues but is not cash received', () => {
    const txns = [{ id: 'p1', date: PART_PAYMENT_DATE, amount: 14500, discount: 500 }]
    const d = deriveLoan(LOAN, txns, PART_PAYMENT_DATE)
    expect(d.outstandingPrincipal).toBe(36625) // same as a ₹15,000 payment
    expect(d.totalPaid).toBe(14500)
    expect(d.totalDiscount).toBe(500)
  })

  it('ignores a transaction dated after the as-of date', () => {
    const txns = [{ id: 'p1', date: RELEASE_DATE, amount: 15000 }]
    expect(deriveLoan(LOAN, txns, PART_PAYMENT_DATE).outstandingPrincipal).toBe(50000)
  })

  it('a reversal cancels both itself and the row it reverses', () => {
    const txns = [
      { id: 'p1', date: PART_PAYMENT_DATE, amount: 15000 },
      { id: 'r1', date: '2026-03-01T00:00:00.000Z', amount: -15000, reversalOfId: 'p1' },
    ]
    const d = deriveLoan(LOAN, txns, RELEASE_DATE)
    expect(d.outstandingPrincipal).toBe(50000)
    expect(d.totalPaid).toBe(0)
    // Back to the untouched loan: 50000 × 2.5% × (3 + 10/30)
    expect(d.accruedInterest).toBe(4166.67)
  })

  it('replays out-of-order rows in date order, so a back-dated payment is not mis-sequenced', () => {
    const ordered = deriveLoan(LOAN, [
      { id: 'p1', date: PART_PAYMENT_DATE, amount: 15000 },
      { id: 'p2', date: '2026-03-10T00:00:00.000Z', amount: 5000 },
    ], RELEASE_DATE)
    const shuffled = deriveLoan(LOAN, [
      { id: 'p2', date: '2026-03-10T00:00:00.000Z', amount: 5000 },
      { id: 'p1', date: PART_PAYMENT_DATE, amount: 15000 },
    ], RELEASE_DATE)
    expect(shuffled).toEqual(ordered)
  })

  it('never reports a negative principal on an overpayment', () => {
    const d = deriveLoan(LOAN, [{ id: 'p1', date: PART_PAYMENT_DATE, amount: 99999 }], RELEASE_DATE)
    expect(d.outstandingPrincipal).toBe(0)
    expect(d.totalDue).toBe(0)
  })

  it('splitPayment components always sum back to the applied amount', () => {
    for (const [applied, interest] of [[1000, 333.335], [0.01, 0.005], [7777.77, 1234.567]]) {
      const s = splitPayment(applied, interest)
      expect(s.interestComponent + s.principalComponent).toBeCloseTo(Number(applied.toFixed(2)), 10)
    }
  })
})

/**
 * The payment route builds its legs from splitPayment() and hands them to postVoucher(), which
 * THROWS if debits do not equal credits — a counter clerk would see a 400 instead of a receipt.
 * This posts the exact legs POST /api/loans/[id]/payments builds, against a stub client, so a
 * rounding mismatch fails here and not at the counter. No database, no server.
 */
describe('a payment always produces a balanced voucher', () => {
  function stubTx() {
    const written: any[] = []
    const tx: LedgerTx = {
      ledgerEntry: {
        async createMany({ data }) { written.push(...data); return { count: data.length } },
        async findMany() { return [] },
        async findFirst() { return null },
      },
      account: { async findMany() { return [] } },
    }
    return { tx, written }
  }

  /** Mirrors src/app/api/loans/[id]/payments/route.ts exactly. */
  function legsFor(cash: number, discount: number, accruedInterest: number) {
    const applied = Number((cash + discount).toFixed(2))
    const { interestComponent, principalComponent } = splitPayment(applied, accruedInterest)
    return ([
      { accountName: 'Cash in Hand', debit: cash, type: 'receipt' },
      { accountName: 'Loan Rebate', debit: discount },
      { accountName: 'Loans Given', credit: principalComponent },
      { accountName: 'Interest Income', credit: interestComponent },
    ] as VoucherLeg[]).filter((l) => (l.debit || l.credit || 0) > 0)
  }

  it('balances across awkward amounts, discounts and interest splits', async () => {
    const cases: Array<[number, number, number]> = [
      [15000, 0, 1625],           // the worked example part payment
      [38486.77, 0, 1861.77],     // the worked example release
      [54000, 166.67, 4166.67],   // release with a rebate
      [1000, 0, 1625],            // smaller than the interest due — no principal leg at all
      [0.01, 0, 0],               // one paisa, all principal
      [0, 500, 333.335],          // pure rebate, interest rounds at the half paisa
      [7777.77, 0.03, 1234.567],
    ]
    for (const [cash, discount, interest] of cases) {
      const { tx, written } = stubTx()
      await expect(
        postVoucher(tx, { firmId: 'f1', userId: 'u1', type: 'loan', legs: legsFor(cash, discount, interest) }),
        `legs for ₹${cash} cash + ₹${discount} rebate against ₹${interest} interest must balance`,
      ).resolves.toBeTruthy()
      const dr = written.reduce((s, e) => s + (e.debit || 0), 0)
      const cr = written.reduce((s, e) => s + (e.credit || 0), 0)
      expect(Number(dr.toFixed(2))).toBe(Number(cr.toFixed(2)))
      expect(written.every((e) => (e.debit || 0) > 0 || (e.credit || 0) > 0)).toBe(true)
    }
  })
})

/**
 * Task 53 — the summary readers (dashboard, customer panel) used to sum Loan.principalAmount,
 * which is the DISBURSED amount and is never patched, so a part-paid loan was re-billed in full.
 * Owners: be-lending, verification: qa-finance.
 */
describe('sumOutstandingPrincipal — what summary screens must show', () => {
  const partPaid = { ...LOAN, transactions: [{ id: 't1', date: PART_PAYMENT_DATE, amount: 15000 }] }

  it('nets the part payment off the principal instead of re-billing it', () => {
    // ₹15,000 clears ₹1,625 interest first, ₹13,375 off ₹50,000 ⇒ ₹36,625 still out.
    expect(sumOutstandingPrincipal([partPaid], RELEASE_DATE)).toBe(36625)
  })

  it('totals a mixed book and ignores a reversed payment', () => {
    const reversed = {
      ...LOAN,
      principalAmount: 20000,
      transactions: [
        { id: 't2', date: PART_PAYMENT_DATE, amount: 5000 },
        { id: 't3', date: PART_PAYMENT_DATE, amount: -5000, reversalOfId: 't2' },
      ],
    }
    // 36,625 part-paid + 20,000 whose only payment was reversed + 50,000 untouched.
    expect(sumOutstandingPrincipal([partPaid, reversed, { ...LOAN, transactions: [] }], RELEASE_DATE)).toBe(106625)
  })

  it('is zero for an empty book, not NaN', () => {
    expect(sumOutstandingPrincipal([], RELEASE_DATE)).toBe(0)
  })
})
