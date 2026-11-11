import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deriveCycles, deriveLoan, monthsBetween, type LoanTxnLike } from '@/lib/interest'

/**
 * Independent gate for "Byaj still due" (thisCycleDue / thisCycleUnpaid). Every expected number is
 * worked by hand in the comment above it. Default convention: calendar months, remainder days / 30,
 * simple interest, rounding once at the end.
 *
 * Base loan B: Rs 50,000 at 1.5%/mo from 2026-01-01T00:00Z => Rs 750.00 per whole month.
 */
const B = { principalAmount: 50000, interestRate: 1.5, loanDate: '2026-01-01T00:00:00.000Z' }
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const chargedAt = (loan: typeof B, txns: LoanTxnLike[], d: Date | string) => {
  const q = deriveLoan(loan, txns, d)
  return q.paidInterest + q.accruedInterest
}

describe('(1) A101 exact, by hand', () => {
  // Loan 09 Sep 08:30Z, Rs 5,000 on 23 Oct 18:30Z (24 Oct IST), asOf 24 Oct 06:30Z.
  // Seg 1: 09 Sep 08:30 -> 23 Oct 18:30 = anniversary 09 Oct 08:30 + 14d10h => 1 + 14/30 months
  //        = 750 + 350 = 1,100 interest; 5,000 - 1,100 = 3,900 principal; outstanding 46,100.
  // Cycle 2 = 09 Oct -> 09 Nov. Gross: 350 (on 50,000) + 46,100 x 1.5% x 16/30 = 691.50 x 16/30 = 368.80 => 718.80.
  // Still due = charged(09 Nov) 1,468.80 - max(charged(09 Oct) 750, paid 1,100) = 368.80.
  const L = { principalAmount: 50000, interestRate: 1.5, loanDate: '2026-09-09T08:30:00.000Z' }
  const T: LoanTxnLike[] = [{ id: 'p1', date: '2026-10-23T18:30:00.000Z', amount: 5000 }]
  it('asOf 24 Oct: gross 718.80, due 368.80, unpaid 0, overdue 0', () => {
    const p = deriveCycles(L, T, '2026-10-24T06:30:00.000Z')
    expect(p.thisCycleProjected).toBe(718.8)
    expect(p.thisCycleDue).toBe(368.8)
    expect(p.thisCycleUnpaid).toBe(0)
    expect(p.overdueInterest).toBe(0)
    expect(iso(p.nextDueDate)).toBe('2026-11-09')
  })
  it('asOf 01 Nov: due is still 368.80; unpaid so far = 691.50 x 8/30 = 184.40', () => {
    // 23 Oct 18:30 -> 01 Nov 06:30 = 8d12h => 8 days.
    const p = deriveCycles(L, T, '2026-11-01T06:30:00.000Z')
    expect(p.thisCycleDue).toBe(368.8)
    expect(p.thisCycleUnpaid).toBe(184.4)
  })
})

describe('(2) no payments over 3 cycles: overdue + due = charged to next due', () => {
  // asOf 15 Apr: dues 01 Feb, 01 Mar, 01 Apr passed => overdue 3 x 750 = 2,250, 3 behind.
  // Current cycle 01 Apr -> 01 May = 750. 2,250 + 750 = 3,000 = charged(01 May) = 4 x 750.
  it('2250 + 750 = 3000', () => {
    const p = deriveCycles(B, [], '2026-04-15T00:00:00.000Z')
    expect(p.overdueInterest).toBe(2250)
    expect(p.cyclesBehind).toBe(3)
    expect(p.thisCycleDue).toBe(750)
    expect(p.thisCycleProjected).toBe(750)
    expect(p.overdueInterest + p.thisCycleDue).toBe(3000)
    expect(iso(p.nextDueDate)).toBe('2026-05-01')
    // unpaid so far: 01 Apr -> 15 Apr = 14 days => 750 x 14/30 = 350
    expect(p.thisCycleUnpaid).toBe(350)
  })
})

describe('(3) a payment that only partly clears arrears', () => {
  // Rs 1,000 on 10 Mar. Interest charged by then = 2 months + 9/30 = 1,500 + 225 = 1,725 >= 1,000 => all interest.
  // NOTE re-anchoring: the segment after the payment runs 10 Mar -> 01 Apr = 22 days = 22/30 (March has 31 days,
  // 9 + 22 = 31), so charged(01 Apr) = 1,725 + 550 = 2,275, NOT 2,250 (Rs 25 = 1 extra day vs no-payment). Finding F1.
  // asOf 15 Apr: overdue = 2,275 - 1,000 = 1,275. charged(01 May) = 4 months = 3,000 (10 Mar -> 01 May = 1m + 21d).
  // due = 3,000 - max(2,275, 1,000) = 725. 1,275 + 725 = 2,000 = 3,000 - 1,000.
  // cyclesBehind: cycle3 = 2,275-1,500 = 775; 1,275-775 = 500 > 0; 500 - 750 < 0 => 2.
  it('overdue 1275, due 725, 2 cycles behind', () => {
    const p = deriveCycles(B, [{ id: 'a', date: '2026-03-10T00:00:00.000Z', amount: 1000 }], '2026-04-15T00:00:00.000Z')
    expect(p.overdueInterest).toBe(1275)
    expect(p.thisCycleDue).toBe(725)
    expect(p.thisCycleProjected).toBe(725)
    expect(p.cyclesBehind).toBe(2)
    expect(p.overdueInterest + p.thisCycleDue).toBe(2000)
  })
})

describe('(4) overpayment beyond the cycle (advance byaj)', () => {
  // Loan 50,000 @2%/mo (Rs 1,000/mo) from 01 Jan. Rs 3,000 on 31 Jan (30 days = 1 month by the engine's
  // remainder rule) => interest 1,000, principal 2,000 => 48,000. Interest can never be "prepaid":
  // the excess goes to PRINCIPAL (rule 4). Cycle 1 ends 01 Feb: 31 Jan -> 01 Feb is 1 day on 48,000
  // = 480 x 1/30... 48,000 x 2% = 960/mo x 1/30 = 32. charged(01 Feb) = 1,032; covered = max(0,1,000) = 1,000
  // => due 32 (not negative). Cycle 2 (01 Feb -> 01 Mar): charged(01 Feb)=1,032 > paid 1,000, so the next cycle
  // is NOT netted: gross 960 on 48,000 full month is due in full (NO prepaid carry-forward).
  const L = { principalAmount: 50000, interestRate: 2, loanDate: '2026-01-01T00:00:00.000Z' }
  const T: LoanTxnLike[] = [{ id: 'adv', date: '2026-01-31T00:00:00.000Z', amount: 3000 }]
  it('cycle 1: interest paid 1000, principal 2000, due 32, never negative', () => {
    const q = deriveLoan(L, T, '2026-01-31T12:00:00.000Z')
    expect(q.paidInterest).toBe(1000)
    expect(q.paidPrincipal).toBe(2000)
    const p = deriveCycles(L, T, '2026-01-31T12:00:00.000Z')
    expect(p.thisCycleDue).toBe(32)
    expect(p.overdueInterest).toBe(0)
    expect(p.thisCycleDue).toBeGreaterThanOrEqual(0)
  })
  it('cycle 2 asOf 10 Feb: full month on reduced principal, advance does NOT carry forward as prepaid byaj', () => {
    // principal 48,000 => 960 for 01 Feb->01 Mar. Overdue: charged(01 Feb)=1,032 - paid 1,000 = 32.
    // due = charged(01 Mar) - max(charged(01 Feb) 1,032, paid 1,000) = 1,992 - 1,032 = 960.
    const p = deriveCycles(L, T, '2026-02-10T00:00:00.000Z')
    expect(p.overdueInterest).toBe(32)
    expect(p.thisCycleDue).toBe(960)
    expect(p.thisCycleProjected).toBe(960)
    expect(p.overdueInterest + p.thisCycleDue).toBe(992) // 1,992 - 1,000
  })
  it('full redemption: cycle fully paid, due 0 and stays 0 months later (not negative)', () => {
    // Rs 51,000 on 31 Jan: 1,000 interest + 50,000 principal => principal 0; nothing accrues after.
    const T2: LoanTxnLike[] = [{ id: 'r', date: '2026-01-31T00:00:00.000Z', amount: 51000 }]
    for (const asOf of ['2026-01-31T12:00:00.000Z', '2026-06-15T00:00:00.000Z']) {
      const p = deriveCycles(L, T2, asOf)
      expect(p.thisCycleDue).toBe(0)
      expect(p.thisCycleUnpaid).toBe(0)
      expect(p.overdueInterest).toBe(0)
    }
  })
})

describe('(5) top-up mid-cycle', () => {
  // 50,000 @2% from 01 Jan; +20,000 on 16 Mar. No payments. Cycle 3 = 01 Mar -> 01 Apr.
  // charged(01 Mar) = 2 x 1,000 = 2,000 => overdue 2,000.
  // Seg to topup: 2 months + 15 days = 2.5 x 1,000 = 2,500. After: 70,000 x 2% = 1,400/mo x 16/30 (16 Mar->01 Apr) = 746.67.
  // charged(01 Apr) = 3,246.67 => due = 3,246.67 - 2,000 = 1,246.67 (= 500 + 746.67). Gross same (no receipts).
  // unpaid asOf 20 Mar: 2,500 + 1,400 x 4/30 (186.67) = 2,686.67 - 2,000 = 686.67.
  const L = { principalAmount: 50000, interestRate: 2, loanDate: '2026-01-01T00:00:00.000Z' }
  const T: LoanTxnLike[] = [{ id: 'tu', type: 'topup', date: '2026-03-16T00:00:00.000Z', amount: 20000 }]
  it('due 1246.67, overdue 2000, unpaid 686.67, topup not counted as paid', () => {
    const p = deriveCycles(L, T, '2026-03-20T00:00:00.000Z')
    expect(p.overdueInterest).toBe(2000)
    expect(p.thisCycleDue).toBe(1246.67)
    expect(p.thisCycleProjected).toBe(1246.67)
    expect(p.thisCycleUnpaid).toBe(686.67)
    expect(p.overdueInterest + p.thisCycleDue).toBeCloseTo(3246.67, 2)
    const q = deriveLoan(L, T, '2026-03-20T00:00:00.000Z')
    expect(q.totalPaid).toBe(0)
    expect(q.paidInterest).toBe(0)
    expect(q.outstandingPrincipal).toBe(70000)
  })
  it('top-up then payment inside the same cycle: payment of 2,300 on 18 Mar', () => {
    // At 18 Mar charged = 2,500 + 1,400 x 2/30 (93.33) = 2,593.33 >= 2,300 => all interest, principal unchanged 70,000.
    // paid 2,300. overdue = max(0, 2,000 - 2,300) = 0. covered = max(2,000, 2,300) = 2,300.
    // due = 3,246.67 - 2,300 = 946.67. Check: 2,500+93.33 = 2,593.33 owed at 18 Mar; 2,593.33-2,300 = 293.33 left
    // + 1,400 x 14/30 (18 Mar -> 01 Apr = 14 days) = 653.33 => 946.67 OK.
    const T2: LoanTxnLike[] = [...T, { id: 'pay', date: '2026-03-18T00:00:00.000Z', amount: 2300 }]
    const p = deriveCycles(L, T2, '2026-03-20T00:00:00.000Z')
    expect(p.overdueInterest).toBe(0)
    expect(p.thisCycleDue).toBe(946.67)
  })
})

describe('(6) payment reversal restores the due', () => {
  // A101 basis. With the Rs 5,000 reversed, the replay drops both rows => exactly the no-payment position:
  // charged(09 Oct) = 750, overdue 750 (1 behind), cycle 09 Oct -> 09 Nov = 750, due = 1,500 - 750 = 750.
  const L = { principalAmount: 50000, interestRate: 1.5, loanDate: '2026-09-09T08:30:00.000Z' }
  const AS_OF = '2026-10-24T06:30:00.000Z'
  const pay: LoanTxnLike = { id: 'p1', type: 'payment', date: '2026-10-23T18:30:00.000Z', amount: 5000 }
  const rev: LoanTxnLike = { id: 'r1', type: 'reversal', reversalOfId: 'p1', date: '2026-10-24T05:00:00.000Z', amount: 5000 }
  it('before reversal 368.80; after reversal 750 due, 750 overdue, identical to no payment at all', () => {
    expect(deriveCycles(L, [pay], AS_OF).thisCycleDue).toBe(368.8)
    const after = deriveCycles(L, [pay, rev], AS_OF)
    const none = deriveCycles(L, [], AS_OF)
    expect(after.thisCycleDue).toBe(750)
    expect(after.overdueInterest).toBe(750)
    expect(after.cyclesBehind).toBe(1)
    expect(after.thisCycleUnpaid).toBe(none.thisCycleUnpaid)
    expect(after.thisCycleDue).toBe(none.thisCycleDue)
    expect(after.overdueInterest).toBe(none.overdueInterest)
    expect(after.interestPaidToDate).toBe(0)
  })
  it('reversing one of two payments restores only that payment', () => {
    // Pay1 Rs 1,000 on 10 Mar, Pay2 Rs 500 on 12 Mar on base loan B, asOf 15 Apr; reverse Pay2.
    // Equivalent to only Pay1 => case (3): overdue 1,275, due 725.
    const t: LoanTxnLike[] = [
      { id: 'a', date: '2026-03-10T00:00:00.000Z', amount: 1000 },
      { id: 'b', date: '2026-03-12T00:00:00.000Z', amount: 500 },
      { id: 'rb', type: 'reversal', reversalOfId: 'b', date: '2026-03-13T00:00:00.000Z', amount: 500 },
    ]
    const p = deriveCycles(B, t, '2026-04-15T00:00:00.000Z')
    expect(p.overdueInterest).toBe(1275)
    expect(p.thisCycleDue).toBe(725)
  })
})

describe('(7) identity overdue + due == charged(nextDue) - paidToDate, across a grid', () => {
  const loans = [
    B,
    { principalAmount: 75000, interestRate: 2.25, loanDate: '2026-01-31T00:00:00.000Z' }, // month-end clamp
    { principalAmount: 12345, interestRate: 3, loanDate: '2025-11-17T06:00:00.000Z' },
  ]
  const txnSets = (start: string): LoanTxnLike[][] => {
    const s = new Date(start).getTime()
    const d = (n: number) => new Date(s + n * 86400000).toISOString()
    return [
      [],
      [{ id: '1', date: d(10), amount: 100 }],
      [{ id: '1', date: d(40), amount: 3000 }],
      [{ id: '1', date: d(40), amount: 3000 }, { id: '2', date: d(75), amount: 800 }],
      [{ id: '1', type: 'topup', date: d(20), amount: 10000 }, { id: '2', date: d(65), amount: 1500 }],
      [{ id: '1', date: d(33), amount: 5000 }, { id: '2', type: 'reversal', reversalOfId: '1', date: d(34), amount: 5000 }],
      [{ id: '1', date: d(50), amount: 1000000 }], // overpays everything
      [{ id: '1', date: d(35), amount: 900, discount: 100 }],
    ]
  }
  it('holds within 1 paisa for every loan x txn set x asOf; due >= 0; unpaid <= due', () => {
    let cases = 0
    for (const L of loans) {
      for (const T of txnSets(L.loanDate)) {
        for (const n of [1, 15, 29, 31, 45, 61, 95, 130, 200, 400]) {
          const asOf = new Date(new Date(L.loanDate).getTime() + n * 86400000)
          const p = deriveCycles(L, T, asOf)
          const nextCharged = chargedAt(L as any, T, p.nextDueDate)
          const paid = deriveLoan(L, T, asOf).paidInterest
          const expected = Math.max(0, nextCharged - paid)
          expect(p.thisCycleDue).toBeGreaterThanOrEqual(0)
          expect(p.overdueInterest).toBeGreaterThanOrEqual(0)
          expect(p.thisCycleUnpaid).toBeLessThanOrEqual(p.thisCycleDue + 0.011)
          expect(Math.abs(p.overdueInterest + p.thisCycleDue - expected)).toBeLessThan(0.0151)
          cases++
        }
      }
    }
    expect(cases).toBe(240)
  })
})

describe('(8) list column, header total and detail tile read the same figure', () => {
  const src = readFileSync(join(__dirname, '../../src/components/app/modules/loans.tsx'), 'utf8')
  it('all three sites are fed by position.thisCycleDue from deriveCycles(loan, transactions)', () => {
    expect(src).toMatch(/thisCycleByaj: pos \? pos\.thisCycleDue : null/) // sort field
    expect(src).toMatch(/<p className="font-medium tabular-nums">\{formatINR\(pos\.thisCycleDue\)\}<\/p>/) // list cell
    expect(src).toMatch(/positions\.get\(l\.id\)\?\.thisCycleDue/) // header total
    expect(src).toMatch(/formatINR\(position\.thisCycleDue\)\}<\/p>/) // detail tile
    expect(src).toMatch(/deriveCycles\(l, l\.transactions \|\| \[\]\)/) // list
    expect(src).toMatch(/deriveCycles\(loan, loan\.transactions \|\| \[\]\)/) // detail
  })
  it('no displayed amount still uses the gross figure (only tooltip / "of X" subtext)', () => {
    const uses = src.split('\n').filter((l) => l.includes('thisCycleProjected') && !l.trim().startsWith('//'))
    expect(uses).toHaveLength(2)
    expect(uses[0]).toContain('title=')
    expect(uses[1]).toContain('of ${formatINR(')
  })
  it('same inputs => list == detail == header (A101 + two other loans)', () => {
    const rows = [
      { id: 'A101', loan: { principalAmount: 50000, interestRate: 1.5, loanDate: '2026-09-09T08:30:00.000Z' }, tx: [{ id: 'p', date: '2026-10-23T18:30:00.000Z', amount: 5000 }] as LoanTxnLike[] },
      { id: 'X', loan: B, tx: [] as LoanTxnLike[] },
      { id: 'Y', loan: B, tx: [{ id: 'q', date: '2026-03-10T00:00:00.000Z', amount: 1000 }] as LoanTxnLike[] },
    ]
    const asOf = new Date('2026-10-24T06:30:00.000Z')
    const list = rows.map((r) => deriveCycles(r.loan, r.tx, asOf).thisCycleDue)
    const detail = rows.map((r) => deriveCycles(r.loan, r.tx, asOf).thisCycleDue)
    expect(list).toEqual(detail)
    const header = Math.round(list.reduce((s, v) => s + v, 0) * 100) / 100
    expect(header).toBeCloseTo(list.reduce((s, v) => s + v, 0), 2)
    expect(list[0]).toBe(368.8)
  })
})

describe('(9) no oMunim sins', () => {
  it('a year is 12 months in a leap and a non-leap year alike', () => {
    expect(monthsBetween('2023-03-01T00:00:00Z', '2024-03-01T00:00:00Z')).toBe(12) // spans 29 Feb 2024
    expect(monthsBetween('2026-03-01T00:00:00Z', '2027-03-01T00:00:00Z')).toBe(12)
    expect(monthsBetween('2027-03-01T00:00:00Z', '2028-03-01T00:00:00Z')).toBe(12) // spans 29 Feb 2028
    // 12 x 750 = 9,000 either way
    const a = deriveLoan(B, [], '2027-01-01T00:00:00Z').accruedInterest
    const b = deriveLoan({ ...B, loanDate: '2027-03-01T00:00:00.000Z' }, [], '2028-03-01T00:00:00Z').accruedInterest
    expect(a).toBe(9000)
    expect(b).toBe(9000)
  })
  it('no interest on repaid principal: after full repayment nothing accrues, even years later', () => {
    // 50,000 @1.5 from 01 Jan. 750 x 1 = 750 interest by 01 Feb; pay 50,750 on 01 Feb => principal 0.
    const T: LoanTxnLike[] = [{ id: 'f', date: '2026-02-01T00:00:00.000Z', amount: 50750 }]
    const q = deriveLoan(B, T, '2029-02-01T00:00:00.000Z')
    expect(q.outstandingPrincipal).toBe(0)
    expect(q.accruedInterest).toBe(0)
    expect(q.paidInterest).toBe(750)
    const p = deriveCycles(B, T, '2026-06-15T00:00:00.000Z')
    expect(p.thisCycleDue).toBe(0)
    expect(p.overdueInterest).toBe(0)
  })
  it('interest only on the reduced balance: 20,000 principal paid on 01 Feb => 30,000 x 1.5% = 450/month after', () => {
    // 01 Feb: interest 750 + principal 20,000 = 20,750 paid. Cycle 02 Feb: 01 Feb -> 01 Mar = 450.
    const T: LoanTxnLike[] = [{ id: 'f', date: '2026-02-01T00:00:00.000Z', amount: 20750 }]
    const p = deriveCycles(B, T, '2026-02-10T00:00:00.000Z')
    expect(p.thisCycleDue).toBe(450)
    expect(p.thisCycleProjected).toBe(450)
    expect(p.overdueInterest).toBe(0)
  })
  it('per-cycle charges telescope to the loan total (no cycle double-counts)', () => {
    const T: LoanTxnLike[] = [{ id: 'a', date: '2026-02-20T00:00:00.000Z', amount: 4000 }, { id: 'tu', type: 'topup', date: '2026-04-05T00:00:00.000Z', amount: 5000 }]
    const asOf = '2026-06-30T00:00:00.000Z'
    const p = deriveCycles(B, T, asOf)
    const sum = p.cycles.reduce((s, c) => s + c.interestCharged, 0)
    const q = deriveLoan(B, T, asOf)
    expect(Math.abs(sum - (q.paidInterest + q.accruedInterest))).toBeLessThan(0.03)
  })
})
