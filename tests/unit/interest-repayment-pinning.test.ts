import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CONVENTION,
  conventionMonths,
  deriveLoan,
  describeMonths,
  simpleInterest,
  type InterestConvention,
  type MonthRounding,
  type RateBasis,
} from '@/lib/interest'
import { round2 } from '@/lib/gst'

/**
 * Pins two arithmetic defects a competitor's girvi screen has, which we deliberately do NOT
 * reproduce. Both are load-bearing on the SAME two facts already documented in interest.ts:
 * deriveLoan() accrues each segment on the RUNNING `principal` (never loan.principalAmount, note 7),
 * and accrueSegment() prices exactly the months figure it is handed — the same figure describeMonths()
 * renders for the screen (note under accrueSegment / describeMonths). This file does not add either
 * fact; it locks both down so a refactor cannot quietly lose them.
 *
 * Owners: be-lending. Independent verification: qa-api.
 */

// ── Defect A — the competitor's scenario, verbatim ──────────────────────────────────────────────
// Principal ₹1,30,000, disbursed 01 Apr 2026, rate 2% ANNUAL, a deposit that clears the whole loan
// lands 06 Sep 2026. The competitor's FINAL CALCULATION correctly shows Total Principal 0.00 and
// then still bills interest on the full ₹1,30,000 through an END DATE of 18 Sep 2026 — about 12
// days of interest on money the customer already returned.
const ANNUAL_CONV: InterestConvention = { ...DEFAULT_CONVENTION, rateBasis: 'annual' }
const LOAN_DATE = '2026-04-01T00:00:00.000Z'
const PRINCIPAL = 130000
const RATE = 2 // % per annum
const FULL_PAYMENT_DATE = '2026-09-06T00:00:00.000Z'
const AS_OF = '2026-09-18T00:00:00.000Z' // the competitor's wrong END DATE

const LOAN = { principalAmount: PRINCIPAL, interestRate: RATE, loanDate: LOAN_DATE, interestConvention: ANNUAL_CONV }
const PER_MONTH_RATE = RATE / 12 // annual quote divided by 12, same as perMonthRate() inside the engine

// Independently derived (conventionMonths + simpleInterest, never deriveLoan) — what segment 1 owes
// at the moment the full payment lands, so the fixture pays exactly principal + interest.
const monthsToFullPayment = conventionMonths(LOAN_DATE, FULL_PAYMENT_DATE, ANNUAL_CONV, true)
const interestAtFullPayment = round2(simpleInterest(PRINCIPAL, PER_MONTH_RATE, monthsToFullPayment))
const FULL_PAYMENT_AMOUNT = round2(PRINCIPAL + interestAtFullPayment)

// The competitor's own wrong number: 12 more days of interest on the full principal after it was
// already repaid. Computed independently so the assertion below can name it.
const monthsCompetitorWronglyCharges = conventionMonths(FULL_PAYMENT_DATE, AS_OF, ANNUAL_CONV, false)
const competitorsWrongInterest = round2(simpleInterest(PRINCIPAL, PER_MONTH_RATE, monthsCompetitorWronglyCharges))

describe('Defect A — interest must not run past full repayment', () => {
  it(`clears exactly at ${FULL_PAYMENT_DATE}: principal 0, interest 0`, () => {
    const atPayment = deriveLoan(LOAN, [{ id: 'p1', date: FULL_PAYMENT_DATE, type: 'part_payment', amount: FULL_PAYMENT_AMOUNT }], FULL_PAYMENT_DATE)
    expect(atPayment.outstandingPrincipal).toBe(0)
    expect(atPayment.accruedInterest).toBe(0)
  })

  it(`accrues NOTHING for 06→18 Sep once principal is zero (competitor wrongly charges ₹${competitorsWrongInterest})`, () => {
    const payment = { id: 'p1', date: FULL_PAYMENT_DATE, type: 'part_payment', amount: FULL_PAYMENT_AMOUNT }
    const d = deriveLoan(LOAN, [payment], AS_OF)
    expect(d.outstandingPrincipal).toBe(0)
    expect(
      d.accruedInterest,
      `competitor's END DATE 18 Sep bills ₹${competitorsWrongInterest} of interest on the already-repaid ₹${PRINCIPAL} — we must charge ₹0`,
    ).toBe(0)
    expect(d.totalDue).toBe(0)
  })
})

describe('Defect A — the partial case: interest AFTER a part payment prices the reduced principal', () => {
  const partialAmount = round2(interestAtFullPayment + 50000) // clears interest + ₹50,000 of principal
  const reducedPrincipal = PRINCIPAL - 50000 // ₹80,000
  const payment = { id: 'p1', date: FULL_PAYMENT_DATE, type: 'part_payment', amount: partialAmount }

  it('the payment itself clears interest and exactly ₹50,000 of principal', () => {
    const atPayment = deriveLoan(LOAN, [payment], FULL_PAYMENT_DATE)
    expect(atPayment.outstandingPrincipal).toBe(reducedPrincipal)
    expect(atPayment.accruedInterest).toBe(0)
    expect(atPayment.paidInterest).toBe(interestAtFullPayment)
    expect(atPayment.paidPrincipal).toBe(50000)
  })

  it('the period after the payment accrues on ₹80,000, never on the original ₹1,30,000', () => {
    // Independently derived expectation: same months figure, priced against the REDUCED balance.
    const monthsAfter = conventionMonths(FULL_PAYMENT_DATE, AS_OF, ANNUAL_CONV, false)
    const expectedSegment2 = round2(simpleInterest(reducedPrincipal, PER_MONTH_RATE, monthsAfter))
    const wrongIfPricedOnOriginal = round2(simpleInterest(PRINCIPAL, PER_MONTH_RATE, monthsAfter))

    const d = deriveLoan(LOAN, [payment], AS_OF)
    expect(d.outstandingPrincipal).toBe(reducedPrincipal)
    expect(d.accruedInterest).toBe(expectedSegment2)
    expect(
      d.accruedInterest,
      `pricing the post-payment segment on the untouched ₹${PRINCIPAL} would give ₹${wrongIfPricedOnOriginal}, not ₹${expectedSegment2}`,
    ).not.toBe(wrongIfPricedOnOriginal)
  })
})

describe('Defect A — ordering: interest-first, a small payment moves no principal', () => {
  it('a payment smaller than accrued interest leaves outstandingPrincipal unchanged and carries the remainder', () => {
    const smallPayment = 500 // « interestAtFullPayment (~₹1,119)
    expect(smallPayment).toBeLessThan(interestAtFullPayment)
    const d = deriveLoan(LOAN, [{ id: 'p1', date: FULL_PAYMENT_DATE, type: 'part_payment', amount: smallPayment }], FULL_PAYMENT_DATE)
    expect(d.outstandingPrincipal).toBe(PRINCIPAL)
    expect(d.paidPrincipal).toBe(0)
    expect(d.paidInterest).toBe(smallPayment)
    expect(d.accruedInterest).toBe(round2(interestAtFullPayment - smallPayment))
  })
})

// ── Defect B — displayed period must equal charged period ──────────────────────────────────────
// The competitor's screen prints "5 Months 18 Days (172 Days)" for a term its own ₹1,213.00 of
// interest back-solves to ≈170.3 days — it displays one period and charges on another. We share the
// same split risk: describeMonths() renders what a human reads, accrueSegment() prices what the
// counter charges. Pin that the two numbers a screen would show — the caption's re-derived months,
// and the interest — always agree to the paise, for both rate bases and more than one rounding rule.
describe('Defect B — the caption describeMonths() renders must price to the same interest accrueSegment() charges', () => {
  const RANGES: Array<[string, string, string]> = [
    ['a whole number of months', '2026-01-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'],
    ['a month plus a few days', '2026-01-01T00:00:00.000Z', '2026-02-17T00:00:00.000Z'],
    ['a span crossing February', '2026-01-20T00:00:00.000Z', '2026-03-05T00:00:00.000Z'],
    ['a span crossing a year boundary', '2025-11-10T00:00:00.000Z', '2026-02-20T00:00:00.000Z'],
    ["the competitor's own 01 Apr → 18 Sep span", LOAN_DATE, AS_OF],
  ]
  const RATE_BASES: RateBasis[] = ['monthly', 'annual']
  // 'exact' is the default; 'half' is a real non-default MONTHLY INTEREST OPTION.
  const ROUNDINGS: MonthRounding[] = ['exact', 'half']
  const CAPTION_RE = /^(\d+) months? \+ (\d+)\/30 days/

  for (const [label, from, to] of RANGES) {
    for (const rateBasis of RATE_BASES) {
      for (const rounding of ROUNDINGS) {
        it(`${label} — rateBasis ${rateBasis}, rounding ${rounding}`, () => {
          const conv: InterestConvention = { ...DEFAULT_CONVENTION, rateBasis, rounding }
          const principal = 130000
          const rate = 2

          const months = conventionMonths(from, to, conv, true)
          const caption = describeMonths(months)
          const match = caption.match(CAPTION_RE)
          expect(match, `describeMonths produced an unparsable caption: "${caption}"`).toBeTruthy()
          const displayedMonths = Number(match![1]) + Number(match![2]) / 30

          const perMonth = rateBasis === 'annual' ? rate / 12 : rate
          const chargedInterest = round2(simpleInterest(principal, perMonth, months))
          const displayedInterest = round2(simpleInterest(principal, perMonth, displayedMonths))
          expect(
            displayedInterest,
            `"${caption}" implies ₹${displayedInterest} of interest but the engine charges ₹${chargedInterest} for ${from} → ${to} (${rateBasis}/${rounding})`,
          ).toBe(chargedInterest)

          // And against the real engine end to end, not just the shared formula.
          const loan = { principalAmount: principal, interestRate: rate, loanDate: from, interestConvention: conv }
          const actual = deriveLoan(loan, [], to).accruedInterest
          expect(actual, `deriveLoan disagrees with the caption "${caption}" for ${from} → ${to} (${rateBasis}/${rounding})`).toBe(chargedInterest)
        })
      }
    }
  }
})
