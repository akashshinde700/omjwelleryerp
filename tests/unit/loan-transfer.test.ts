import { describe, it, expect } from 'vitest'
import { deriveLoan, deriveSpread, deriveTransfer, ofStream, type LoanTxnLike } from '@/lib/interest'
import * as mob from '../../mobile/src/utils/interest'

/**
 * RE-PLEDGE: two interest streams on one set of ornaments.
 *
 * A girvi shop funds itself by re-pledging a customer's gold to a financier. The customer's loan
 * stays the shop's asset; the borrowing is a new liability beside it. Two rates run on the same
 * physical ornaments and the difference is the shop's margin.
 *
 * ── THE RULES UNDER TEST ─────────────────────────────────────────────────────────────────────
 * 1. Every LoanTransaction carries a `stream`: 'in' (the customer's leg — the default, and what
 *    every row written before re-pledging existed means) or 'out' (paid to the financier).
 * 2. deriveLoan() replays 'in' ONLY. A payment to a money lender can never pay down a customer's
 *    balance, however many call sites forget to filter.
 * 3. deriveTransfer() replays 'out' ONLY, through the SAME engine, off the loan's transfer*
 *    columns: interest-first, reducing balance, frozen convention. No second formula.
 * 4. The two are reported side by side and NEVER netted.
 *
 * ── THE WORKED EXAMPLE ───────────────────────────────────────────────────────────────────────
 *   Customer pledges ₹1,00,000 at 2.5%/mo on 2026-01-01.
 *   Shop re-pledges the ornaments for ₹70,000 at 1.5%/mo on 2026-02-01.
 *   At 2026-04-01 — 3 exact calendar months for the customer, 2 for the financier:
 *     customer owes us  ₹1,00,000 + 3 × 2.5% × 1,00,000 = ₹1,07,500.00
 *     we owe them          ₹70,000 + 2 × 1.5% ×   70,000 =   ₹72,100.00
 *     spread                        ₹7,500.00 − ₹2,100.00 =    ₹5,400.00
 *     own funds in the pledge       ₹1,00,000 − ₹70,000   =   ₹30,000.00
 *
 * Owner: be-lending. Independent verification of every figure: qa-finance.
 */

const LOAN = {
  principalAmount: 100000,
  interestRate: 2.5,
  loanDate: '2026-01-01T00:00:00.000Z',
  transferPrincipal: 70000,
  transferRate: 1.5,
  transferDate: '2026-02-01T00:00:00.000Z',
}
const APRIL = '2026-04-01T00:00:00.000Z'

describe('the financier leg is priced by the same engine', () => {
  it('prices both legs from their own dates, rates and principals', () => {
    const s = deriveSpread(LOAN, [], APRIL)
    expect(s.customer.outstandingPrincipal).toBe(100000)
    expect(s.customer.accruedInterest).toBe(7500)
    expect(s.customer.totalDue).toBe(107500)
    expect(s.financier!.outstandingPrincipal).toBe(70000)
    expect(s.financier!.accruedInterest).toBe(2100)
    expect(s.financier!.totalDue).toBe(72100)
    expect(s.spread).toBe(5400)
    expect(s.ownFunds).toBe(30000)
  })

  it('is null — not zero — for a pledge that was never re-pledged', () => {
    expect(deriveTransfer({ principalAmount: 100000 } as never, [], APRIL)).toBeNull()
    const s = deriveSpread({ principalAmount: 100000, interestRate: 2.5, loanDate: LOAN.loanDate }, [], APRIL)
    expect(s.financier).toBeNull()
    // With no borrowing the whole pledge is the shop's own money and the whole interest is margin.
    expect(s.spread).toBe(s.interestEarned)
    expect(s.ownFunds).toBe(100000)
  })

  it('honours the financier leg\'s own frozen convention, not the customer leg\'s', () => {
    // 2026-02-01 -> 2026-03-13 is 40 elapsed days: 1 calendar month (to 03-01) + 12 days.
    // Pro-rata under the default rule; a whole second month under the financier's "full month" terms.
    const to = '2026-03-13T00:00:00.000Z'
    const exact = deriveTransfer(LOAN, [], to)!
    const full = deriveTransfer({ ...LOAN, transferConvention: JSON.stringify({ rounding: 'full' }) }, [], to)!
    expect(exact.accruedInterest).toBe(1470) // 70,000 × 1.5% × (1 + 12/30)
    expect(full.accruedInterest).toBe(2100) // 70,000 × 1.5% × 2
  })
})

describe('the two streams cannot contaminate each other', () => {
  const txns: LoanTxnLike[] = [
    // Paid to the financier: ₹20,000 on 2026-03-01.
    { id: 'o1', stream: 'out', type: 'transfer_payment', date: '2026-03-01T00:00:00.000Z', amount: 20000 },
    // Received from the customer: ₹30,000 on 2026-03-01.
    { id: 'i1', stream: 'in', type: 'part_payment', date: '2026-03-01T00:00:00.000Z', amount: 30000 },
  ]

  it('a payment to the financier does not touch the customer balance', () => {
    const withOut = deriveLoan(LOAN, txns, APRIL)
    const withoutOut = deriveLoan(LOAN, ofStream(txns, 'in'), APRIL)
    expect(withOut.outstandingPrincipal).toBe(withoutOut.outstandingPrincipal)
    expect(withOut.totalPaid).toBe(30000)
    // 2 months on ₹1,00,000 = ₹5,000 interest; ₹30,000 clears it, ₹25,000 off principal.
    expect(withOut.paidInterest).toBe(5000)
    expect(withOut.outstandingPrincipal).toBe(75000)
    // One more month on the reduced principal: 75,000 × 2.5% = ₹1,875.
    expect(withOut.accruedInterest).toBe(1875)
  })

  it('a customer receipt does not pay down the financier', () => {
    const f = deriveTransfer(LOAN, txns, APRIL)!
    expect(f.totalPaid).toBe(20000)
    // 1 month on ₹70,000 at 1.5% = ₹1,050 interest; ₹20,000 clears it, ₹18,950 off principal.
    expect(f.paidInterest).toBe(1050)
    expect(f.outstandingPrincipal).toBe(51050)
    // One more month on the reduced balance: 51,050 × 1.5% = ₹765.75.
    expect(f.accruedInterest).toBe(765.75)
  })

  it('treats a row with no stream as the customer leg, so nothing written before this moves', () => {
    const legacy: LoanTxnLike[] = [{ id: 'x', type: 'part_payment', date: '2026-03-01T00:00:00.000Z', amount: 30000 }]
    expect(deriveLoan(LOAN, legacy, APRIL).outstandingPrincipal).toBe(75000)
    expect(deriveTransfer(LOAN, legacy, APRIL)!.totalPaid).toBe(0)
  })

  it('a reversal on one leg cannot cancel a row on the other', () => {
    const withReversal: LoanTxnLike[] = [
      ...txns,
      { id: 'r1', stream: 'out', type: 'reversal', reversalOfId: 'i1', date: '2026-03-02T00:00:00.000Z', amount: 30000 },
    ]
    // The reversal is on the 'out' stream and names an 'in' row: the customer's payment stands.
    expect(deriveLoan(LOAN, withReversal, APRIL).totalPaid).toBe(30000)
  })
})

describe('the phone answers exactly what the counter answers', () => {
  it('matches the web engine on both legs and the spread', () => {
    const txns: LoanTxnLike[] = [
      { id: 'o1', stream: 'out', type: 'transfer_payment', date: '2026-03-01T00:00:00.000Z', amount: 20000 },
      { id: 'i1', stream: 'in', type: 'part_payment', date: '2026-03-01T00:00:00.000Z', amount: 30000 },
      { id: 't1', stream: 'in', type: 'topup', date: '2026-03-10T00:00:00.000Z', amount: 5000 },
    ]
    const web = deriveSpread(LOAN, txns, APRIL)
    const phone = mob.deriveSpread(LOAN, txns as never, APRIL)
    expect(phone.customer.outstandingPrincipal).toBe(web.customer.outstandingPrincipal)
    expect(phone.customer.accruedInterest).toBe(web.customer.accruedInterest)
    expect(phone.financier!.totalDue).toBe(web.financier!.totalDue)
    expect(phone.spread).toBe(web.spread)
    expect(phone.ownFunds).toBe(web.ownFunds)
  })
})

describe('a custody charge is fee income, never a repayment', () => {
  it('is invisible to the replay: only `amount` reduces the loan', () => {
    // The payments route stores the fee in `charges`, outside `amount`. If it ever leaked into
    // `amount` the customer's principal would fall by a fee he paid on top of his instalment.
    const withFee: LoanTxnLike[] = [{ id: 'i1', type: 'part_payment', date: '2026-03-01T00:00:00.000Z', amount: 30000 }]
    const d = deriveLoan(LOAN, withFee, APRIL)
    expect(d.totalPaid).toBe(30000)
    expect(d.outstandingPrincipal).toBe(75000)
    // `charges` is not part of LoanTxnLike at all — the engine cannot see it even by accident.
    expect(Object.keys(withFee[0])).not.toContain('charges')
  })
})
