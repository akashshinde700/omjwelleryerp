import { describe, it, expect } from 'vitest'
import { deriveLoan, isUnrecordedClosure } from '@/lib/interest'

/**
 * Additional principal on a live girvi, and the settlement of an auctioned pledge.
 *
 * Conventions are unchanged and are NOT re-derived here: calendar-anchored pro-rata
 * (complete calendar months + remainder/30), no minimum period, simple interest on the
 * OUTSTANDING principal, payments applied interest-first. See src/lib/interest.ts.
 *
 * What these lock down:
 *  1. A top-up raises the principal FROM ITS OWN DATE. Every segment before it stays priced at the
 *     old principal — bumping Loan.principalAmount instead would silently re-price the history.
 *  2. An auction settles the loan on its date and nothing accrues afterwards.
 *
 * Owners: be-lending. Independent verification of every figure: qa-finance.
 */

const LOAN = { principalAmount: 50000, interestRate: 2.5, loanDate: '2026-01-01T00:00:00.000Z' }
const TOPUP_DATE = '2026-02-01T00:00:00.000Z'
const ASOF = '2026-03-01T00:00:00.000Z'
const AUCTION_DATE = '2026-04-11T00:00:00.000Z'

describe('top-up: additional principal carries its own date', () => {
  const topup = { id: 'tu1', type: 'topup', date: TOPUP_DATE, amount: 20000 }

  it('prices the segment before the top-up at the old principal and the one after at the new', () => {
    const d = deriveLoan(LOAN, [topup], ASOF)
    // segment 1: 2026-01-01 → 02-01, 1 month × ₹50,000 × 2.5% = ₹1,250.00
    // segment 2: 2026-02-01 → 03-01, 1 month × ₹70,000 × 2.5% = ₹1,750.00
    expect(d.accruedInterest).toBe(3000)
    expect(d.outstandingPrincipal).toBe(70000)
    expect(d.totalDue).toBe(73000)
    expect(d.totalTopUp).toBe(20000)
    expect(d.principalAdvanced).toBe(70000)
  })

  it('is NOT the same as patching the principal — that would over-charge the first segment', () => {
    const patched = deriveLoan({ ...LOAN, principalAmount: 70000 }, [], ASOF)
    expect(patched.accruedInterest).toBe(3500) // 2 months on ₹70,000
    expect(deriveLoan(LOAN, [topup], ASOF).accruedInterest).toBe(3000)
  })

  it('is an advance, not a receipt: it clears no interest and is not in totalPaid', () => {
    const d = deriveLoan(LOAN, [topup], ASOF)
    expect(d.totalPaid).toBe(0)
    expect(d.paidInterest).toBe(0)
    expect(d.paidPrincipal).toBe(0)
    // Interest that had accrued by the top-up date is carried forward unpaid, not capitalised:
    // it is still ₹1,250 of the ₹3,000 above and earns nothing itself.
    expect(deriveLoan(LOAN, [topup], TOPUP_DATE).accruedInterest).toBe(1250)
  })

  it('a later part payment still applies interest-first, on the topped-up balance', () => {
    //  ₹5,000 on 2026-03-01 against ₹3,000 of accrued interest ⇒ ₹2,000 off the principal.
    const pay = { id: 'p1', type: 'part_payment', date: ASOF, amount: 5000 }
    const d = deriveLoan(LOAN, [topup, pay], ASOF)
    expect(d.paidInterest).toBe(3000)
    expect(d.paidPrincipal).toBe(2000)
    expect(d.outstandingPrincipal).toBe(68000)
    expect(d.accruedInterest).toBe(0)
  })

  it('a reversed top-up leaves no trace in the balance', () => {
    const reversal = { id: 'r1', type: 'reversal', date: TOPUP_DATE, amount: -20000, reversalOfId: 'tu1' }
    const d = deriveLoan(LOAN, [topup, reversal], ASOF)
    expect(d.outstandingPrincipal).toBe(50000)
    expect(d.totalTopUp).toBe(0)
    expect(d.accruedInterest).toBe(2500) // 2 months on ₹50,000
  })

  it('an order-of-events check: two top-ups segment independently', () => {
    const second = { id: 'tu2', type: 'topup', date: ASOF, amount: 10000 }
    // Jan: ₹50,000 (₹1,250) · Feb: ₹70,000 (₹1,750) · Mar: ₹80,000 (₹2,000) = ₹5,000.
    const d = deriveLoan(LOAN, [topup, second], '2026-04-01T00:00:00.000Z')
    expect(d.accruedInterest).toBe(5000)
    expect(d.outstandingPrincipal).toBe(80000)
  })
})

describe('auction: the pledge is sold and the loan settles on that date', () => {
  // ₹50,000 @ 2.5%/mo, 2026-01-01 → 2026-04-11 is 3 + 10/30 months ⇒ ₹4,166.67 interest.
  // dues = 50,000 + 4,166.67 + 1,500 charges = ₹55,666.67.
  const AT_AUCTION = deriveLoan(LOAN, [], AUCTION_DATE)

  it('the dues the auction has to clear are the derived quote plus the charges', () => {
    expect(AT_AUCTION.outstandingPrincipal).toBe(50000)
    expect(AT_AUCTION.accruedInterest).toBe(4166.67)
    expect(Math.round((AT_AUCTION.totalDue + 1500) * 100) / 100).toBe(55666.67)
  })

  it('proceeds ABOVE the dues settle the loan in full — the excess is not the loan’s business', () => {
    // ₹62,000 − ₹1,500 charges = ₹60,500 available; only ₹54,166.67 of it is owed.
    // The ₹6,333.33 surplus is a liability to the pledgor and never touches the balance.
    const auction = { id: 'a1', type: 'auction', date: AUCTION_DATE, amount: 54166.67, discount: 0 }
    const d = deriveLoan(LOAN, [auction], AUCTION_DATE)
    expect(d.outstandingPrincipal).toBe(0)
    expect(d.accruedInterest).toBe(0)
    expect(d.totalDue).toBe(0)
    expect(d.paidInterest).toBe(4166.67)
    expect(d.paidPrincipal).toBe(50000)
  })

  it('proceeds BELOW the dues settle it too, with the shortfall carried as the write-off', () => {
    // ₹48,000 − ₹1,500 = ₹46,500 recovered, ₹7,666.67 unrecoverable.
    const auction = { id: 'a2', type: 'auction', date: AUCTION_DATE, amount: 46500, discount: 7666.67 }
    const d = deriveLoan(LOAN, [auction], AUCTION_DATE)
    expect(d.outstandingPrincipal).toBe(0)
    expect(d.totalDue).toBe(0)
    expect(d.totalPaid).toBe(46500) // cash recovered — the write-off is not a receipt
    expect(d.totalDiscount).toBe(7666.67)
    // paidPrincipal counts principal CLEARED (cash plus the written-off part), the same way a
    // release with a rebate does. Principal recovered in CASH is 42,333.33 and lives on the
    // transaction row and in the auction response, not in the derivation.
    expect(d.paidInterest).toBe(4166.67) // interest-first, so the loss falls on the principal
    expect(d.paidPrincipal).toBe(50000)
  })

  it('nothing accrues after the auction date, however long the row sits there', () => {
    const auction = { id: 'a2', type: 'auction', date: AUCTION_DATE, amount: 46500, discount: 7666.67 }
    const years = deriveLoan(LOAN, [auction], '2029-12-31T00:00:00.000Z')
    expect(years.outstandingPrincipal).toBe(0)
    expect(years.accruedInterest).toBe(0)
    expect(years.totalDue).toBe(0)
  })

  it('settles a loan that had been topped up and part paid first', () => {
    // ₹50,000 · +₹20,000 on 02-01 · ₹5,000 paid on 03-01 (₹3,000 interest, ₹2,000 principal).
    // From 03-01 to 04-11: 1 + 10/30 months × ₹68,000 × 2.5% = ₹2,266.67.
    const txns = [
      { id: 'tu1', type: 'topup', date: TOPUP_DATE, amount: 20000 },
      { id: 'p1', type: 'part_payment', date: ASOF, amount: 5000 },
    ]
    const at = deriveLoan(LOAN, txns, AUCTION_DATE)
    expect(at.outstandingPrincipal).toBe(68000)
    expect(at.accruedInterest).toBe(2266.67)
    const auction = { id: 'a3', type: 'auction', date: AUCTION_DATE, amount: 70266.67, discount: 0 }
    const after = deriveLoan(LOAN, [...txns, auction], AUCTION_DATE)
    expect(after.outstandingPrincipal).toBe(0)
    expect(after.totalDue).toBe(0)
  })
})

describe('closures that predate the payments endpoint', () => {
  it('flags a terminal loan with no transaction behind it (A104/A105 in the live data)', () => {
    expect(isUnrecordedClosure({ status: 'released', transactions: [] })).toBe(true)
    expect(isUnrecordedClosure({ status: 'auctioned', transactions: null })).toBe(true)
  })

  it('does not flag an active loan, or one closed through a real transaction', () => {
    expect(isUnrecordedClosure({ status: 'active', transactions: [] })).toBe(false)
    expect(isUnrecordedClosure({ status: 'released', transactions: [{ id: 'x', date: ASOF, amount: 100 }] })).toBe(false)
  })

  it('a closure whose only transaction was reversed counts as unrecorded again', () => {
    expect(
      isUnrecordedClosure({
        status: 'released',
        transactions: [
          { id: 'x', date: ASOF, amount: 100 },
          { id: 'y', date: ASOF, amount: -100, reversalOfId: 'x' },
        ],
      }),
    ).toBe(true)
  })
})
